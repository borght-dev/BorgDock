import Foundation
import LocalAuthentication
import Observation
import UIKit

/// Focus and everything a pull request needs: the board, details, Quick Review's held approvals and the writes.
@MainActor
@Observable
final class FocusStore {
    @ObservationIgnored weak var app: AppModel?

    private(set) var focus: Focus?
    private(set) var error: String?
    private(set) var isLoading = false
    private(set) var syncedAt: Date?
    var bucket: FocusBucket = .you

    /// Details and files by PR key, kept while the app runs so going back and forth stays instant.
    private(set) var details: [String: PrDetail] = [:]
    private(set) var files: [String: PrFiles] = [:]
    private(set) var conversations: [String: PrConversation] = [:]

    /// Approvals waiting out their Undo.
    let hold = ApprovalHold(presenter: ApprovalLiveActivity())
    /// The file a Quick Review should open on, by PR key (from the Files tab).
    var reviewStartPath: [String: String] = [:]
    /// The draft and line comments of an unfinished review, by PR key; survives Undo.
    var reviewDrafts: [String: ReviewDraft] = [:]
    /// An error to show when a refused approval brings its PR back.
    var reviewErrors: [String: String] = [:]
    /// A PR whose approval was undone: Quick Review opens its decision again.
    var reopenDecision: String?
    /// Where the Comments composer posts, by PR key; the conversation when unset.
    var replyTarget: [String: ReplyTarget] = [:]

    /// The account preference; read once per launch and when Settings changes it.
    private(set) var faceIdPreference = false
    var faceIdForActions: Bool {
        #if DEBUG
        if debugFaceID { return true }
        #endif
        return faceIdPreference
    }

    #if DEBUG
    /// Screenshot states (I1DebugRoute).
    var debugFaceID = false
    var debugPrTab: String?
    var debugReviewPosition: Int?
    #endif

    @ObservationIgnored private var loadGeneration = 0

    init() {}

    var api: APIClient? { app?.api }

    /// Your GitHub logins, from the accounts the server read the pull requests with.
    var myLogins: Set<String> { Set(focus?.pullRequests.map(\.account) ?? []) }

    func pullRequests(in bucket: FocusBucket) -> [PrSummary] {
        focus?.pullRequests.filter { $0.bucket == bucket } ?? []
    }

    func summary(_ key: PrKey) -> PrSummary? {
        details[key.key]?.summary ?? focus?.pullRequests.first { $0.key == key.key }
    }

    // MARK: - Loading

    func load(reportErrors: Bool = false) async {
        guard let api else { return }
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        defer { if generation == loadGeneration { isLoading = false } }
        do {
            let fresh = try await api.focus()
            guard generation == loadGeneration else { return }
            focus = fresh
            syncedAt = .now
            error = nil
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            if reportErrors || focus != nil {
                app?.report(error)
            } else {
                self.error = (error as? APIError)?.message ?? error.localizedDescription
            }
        }
    }

    /// Every 30 s while Focus is on screen.
    func poll() async {
        while !Task.isCancelled {
            await load()
            try? await Task.sleep(for: .seconds(focus == nil && error != nil ? 5 : 30))
        }
    }

    func loadPreferences() async {
        guard let api else { return }
        if let value = try? await api.faceIdForActions() { faceIdPreference = value }
    }

    @discardableResult
    func loadDetail(_ key: PrKey) async -> PrDetail? {
        guard let api else { return nil }
        do {
            let detail = try await api.pullRequest(key)
            details[key.key] = detail
            return detail
        } catch {
            app?.report(error)
            return nil
        }
    }

    @discardableResult
    func loadFiles(_ key: PrKey) async -> PrFiles? {
        guard let api else { return nil }
        do {
            let fresh = try await api.pullRequestFiles(key)
            files[key.key] = fresh
            return fresh
        } catch {
            app?.report(error)
            return nil
        }
    }

    @discardableResult
    func loadConversation(_ key: PrKey) async -> PrConversation? {
        guard let api else { return nil }
        do {
            let fresh = try await api.conversation(key)
            conversations[key.key] = fresh
            return fresh
        } catch {
            app?.report(error)
            return nil
        }
    }

    // MARK: - Actions

    private func run(_ busyKey: String, _ work: (APIClient) async throws -> Void) async -> Bool {
        guard let app, !app.busy.contains(busyKey) else { return false }
        app.busy.insert(busyKey)
        defer { app.busy.remove(busyKey) }
        do {
            try await work(app.api)
            return true
        } catch {
            app.report(error)
            return false
        }
    }

    func snoozeUntilTomorrow(_ key: PrKey) async {
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: .now))
            .flatMap { Calendar.current.date(bySettingHour: 8, minute: 0, second: 0, of: $0) }
        let done = await run("snooze-\(key.key)") { _ = try await $0.snooze(key, until: tomorrow) }
        guard done else { return }
        app?.toasts.show("Snoozed #\(key.number) until tomorrow")
        await load()
    }

    func rerunFailed(_ key: PrKey) async {
        var reruns = 0
        let done = await run("rerun-\(key.key)") { reruns = try await $0.rerunFailed(key).reruns }
        guard done else { return }
        app?.toasts.show(reruns == 0 ? "No failed runs to restart" : reruns == 1 ? "Restarted 1 workflow run" : "Restarted \(reruns) workflow runs")
        await loadDetail(key)
    }

    func merge(_ key: PrKey, _ request: MergeRequest) async -> MergeResponse? {
        guard await confirmWithFaceID("Merge #\(key.number)") else { return nil }
        var response: MergeResponse?
        let done = await run("merge-\(key.key)") { response = try await $0.merge(key, request) }
        guard done, let response else { return nil }
        app?.toasts.show(response.message.isEmpty ? (response.autoMerge ? "Merges when checks pass" : "Merged #\(key.number)") : response.message)
        await load()
        return response
    }

    func postComment(_ key: PrKey, body: String, threadId: String?) async -> Bool {
        let done = await run("comment-\(key.key)") { _ = try await $0.postComment(key, PostCommentRequest(body: body, threadId: threadId)) }
        if done { await loadConversation(key) }
        return done
    }

    func resolve(_ key: PrKey, threadId: String) async {
        let done = await run("resolve-\(threadId)") { _ = try await $0.resolveThread(key, threadId: threadId) }
        if done { await loadConversation(key) }
    }

    /// Request changes and Comment post at once; Approve goes through `approve` and its Undo.
    func submitReview(_ key: PrKey, event: ReviewEvent, draft: ReviewDraft, headSha: String) async -> Bool {
        if event == .approve, !(await confirmWithFaceID("Approve #\(key.number)")) { return false }
        let request = SubmitReviewRequest(event: event, body: draft.body, headSha: headSha, comments: draft.lineComments)
        let done = await run("review-\(key.key)") { _ = try await $0.submitReview(key, request) }
        guard done else { return false }
        reviewDrafts[key.key] = nil
        app?.toasts.show(event == .requestChanges ? "Asked for changes on #\(key.number)" : event == .approve ? "Approved #\(key.number)" : "Commented on #\(key.number)")
        await load()
        return true
    }

    /// Approves after the Undo window. Face ID (when on) is asked first, so the wait isn't spent on it.
    /// `thenMerge`: Approve & auto-merge; the merge is asked for once the approval is sent (GitHub merges when
    /// the checks pass).
    func approve(_ key: PrKey, draft: ReviewDraft, headSha: String, thenMerge: MergeRequest? = nil, onUndo: @escaping @MainActor () -> Void) async -> Bool {
        guard await confirmWithFaceID("Approve #\(key.number)") else { return false }
        reviewDrafts[key.key] = draft
        let request = SubmitReviewRequest(event: .approve, body: draft.body, headSha: headSha, comments: draft.lineComments)
        hold.hold(
            key,
            label: "Approving #\(key.number)…",
            title: summary(key)?.title,
            send: { [weak self] in
                guard let api = self?.api else { throw APIError.network("Signed out.") }
                _ = try await api.submitReview(key, request)
            },
            onUndo: onUndo,
            onSent: { [weak self] in
                self?.reviewDrafts[key.key] = nil
                self?.app?.toasts.show("Approved #\(key.number)")
                Task {
                    if let thenMerge, let api = self?.api {
                        do {
                            let response = try await api.merge(key, thenMerge)
                            self?.app?.toasts.show(response.message)
                        } catch {
                            self?.app?.report(error)
                        }
                    }
                    await self?.load()
                }
            },
            onFailure: { [weak self] error in
                guard let self else { return }
                let message = (error as? APIError)?.message ?? error.localizedDescription
                self.reviewErrors[key.key] = "Review not submitted: \(message)"
                self.app?.toasts.show("Approval of #\(key.number) not submitted. \(message)", isError: true)
                self.app?.router.review([key])
            }
        )
        return true
    }

    // MARK: - Face ID

    /// True when the preference is off, or Face ID (or the passcode) confirms. The signature is always sent.
    func confirmWithFaceID(_ reason: String) async -> Bool {
        guard faceIdPreference else { return true }
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            app?.toasts.show("Face ID isn't set up on this iPhone. Turn it off in Settings to continue.", isError: true)
            return false
        }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch {
            return false
        }
    }

    // MARK: - Small actions

    func copyBranch(_ pr: PrSummary) {
        UIPasteboard.general.string = pr.headRef
        app?.toasts.show("Copied \(pr.headRef)")
    }

    func openOnGitHub(_ pr: PrSummary) {
        guard let url = URL(string: pr.url) else { return }
        UIApplication.shared.open(url)
    }

    /// Fix with Claude: the failing checks of this pull request, handed to an agent.
    func fixWithClaude(_ pr: PrSummary) {
        app?.router.present(.launch(LaunchContext(
            itemId: pr.workItemIds.first,
            prKey: pr.key,
            message: "Fix the failing checks on \(pr.key) (\(pr.headRef)).",
            title: "Fix #\(pr.number) checks"
        )))
    }

    /// Open in T3: a new thread on this pull request's branch.
    func openInT3(_ pr: PrSummary) {
        app?.router.present(.launch(LaunchContext(
            itemId: pr.workItemIds.first,
            prKey: pr.key,
            title: "#\(pr.number) \(pr.title)"
        )))
    }
}

/// An unfinished review: the overall comment and the line comments, as they'll be sent.
struct ReviewDraft: Hashable, Sendable {
    var body = ""
    var comments: [String: [DiffAnchor: String]] = [:]

    var lineComments: [ReviewLineComment] {
        comments.sorted { $0.key < $1.key }.flatMap { path, lines in
            lines.sorted { $0.key.line < $1.key.line }.map {
                ReviewLineComment(path: path, line: $0.key.line, side: $0.key.side, body: $0.value)
            }
        }
    }

    var isEmpty: Bool { body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && lineComments.isEmpty }

    mutating func set(_ text: String, path: String, anchor: DiffAnchor) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        var lines = comments[path] ?? [:]
        lines[anchor] = trimmed.isEmpty ? nil : trimmed
        comments[path] = lines.isEmpty ? nil : lines
    }

    func comment(path: String, anchor: DiffAnchor) -> String? { comments[path]?[anchor] }
}
