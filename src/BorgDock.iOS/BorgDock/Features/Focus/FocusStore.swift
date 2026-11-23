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
    /// Why the list on screen is old: the newest read failed and an earlier answer is still shown.
    private(set) var trouble: ListTrouble?

    /// Details and files by PR key, kept while the app runs so going back and forth stays instant.
    private(set) var details: [String: PrDetail] = [:]
    private(set) var files: [String: PrFiles] = [:]
    private(set) var conversations: [String: PrConversation] = [:]
    /// Related CI failures with a live failure: which red pull requests are not red by their own doing.
    private(set) var ciGroups: [CiFailureGroup] = []
    /// E2E reports read for author runs.
    let e2e = E2eReports()

    /// Approvals waiting out their Undo.
    let hold = ApprovalHold(presenter: ApprovalLiveActivity())
    /// The file a Quick Review should open on, by PR key (from the Files tab).
    var reviewStartPath: [String: String] = [:]
    /// The draft and line comments of an unfinished review, by PR key; survives Undo.
    var reviewDrafts: [String: ReviewDraft] = [:]
    /// What you decided in Quick Review, by PR key: held, posted, or refused with GitHub's reason.
    var reviewDecisions: [String: ReviewDecisionRecord] = [:]
    /// Pull requests whose files you've opened since the app started; the others start on their brief.
    private(set) var openedReviews: Set<String> = []
    /// The files you've opened in Quick Review, by PR key: a step's green dots.
    var openedFiles: [String: Set<String>] = [:]
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
    /// Where a Quick Review opens when it isn't a file, e.g. the tests step.
    var debugReviewStart: [String: ReviewWalk.Position] = [:]
    var debugShowReviewFiles = false
    #endif

    @ObservationIgnored private var loadGeneration = 0
    /// The failure the last poll reported, so a poll that keeps failing says so once.
    @ObservationIgnored private var reportedPollError: String?
    /// Quick Review's reads of a pull request's detail and files, in flight or done, so the next PR in the queue is
    /// read while you review the current one and both views share one request.
    @ObservationIgnored private var snapshotReads: [String: Task<ReviewSnapshot, Error>] = [:]
    @ObservationIgnored private var snapshotReadAt: [String: Date] = [:]

    init() {}

    /// Whoever reads GitHub: the server, or this phone itself.
    var backend: (any PullRequestBackend)? { app?.pullRequests }

    /// Your GitHub logins, from the accounts the server read the pull requests with.
    var myLogins: Set<String> { Set(focus?.pullRequests.map(\.account) ?? []) }

    func pullRequests(in bucket: FocusBucket) -> [PrSummary] {
        focus?.pullRequests.filter { $0.bucket == bucket } ?? []
    }

    func summary(_ key: PrKey) -> PrSummary? {
        details[key.key]?.summary ?? focus?.pullRequests.first { $0.key == key.key }
    }

    // MARK: - Loading

    /// `fresh` reads GitHub now instead of the last poll's answer (pull to refresh).
    func load(reportErrors: Bool = false, fresh: Bool = false) async {
        guard let backend else { return }
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        defer { if generation == loadGeneration { isLoading = false } }
        do {
            async let groups = try? backend.ciGroups()
            let fresh = try await backend.focus(fresh: fresh)
            let freshGroups = await groups
            guard generation == loadGeneration else { return }
            focus = fresh
            if let freshGroups { ciGroups = freshGroups }
            syncedAt = .now
            error = nil
            trouble = nil
            reportedPollError = nil
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            let message = (error as? APIError)?.message ?? error.localizedDescription
            if reportErrors || focus != nil {
                if focus != nil { trouble = ListTrouble(error) }
                // Without a connection every poll fails the same way; the list on screen stays, and one toast is enough.
                // BorgDock Review says it in a banner over the list instead.
                if reportErrors || (message != reportedPollError && app?.direct == nil) { app?.report(error) }
                reportedPollError = message
            } else {
                self.error = message
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
        guard let app else { return }
        if let direct = app.direct {
            faceIdPreference = direct.faceIdForActions
        } else if let value = try? await app.api.faceIdForActions() {
            faceIdPreference = value
        }
    }

    /// The list as the last launch left it, shown while the first read runs.
    func restore(_ focus: Focus?) {
        if self.focus == nil { self.focus = focus }
    }

    /// Forgets what was read, when the last account it was read with is removed.
    func forget() {
        loadGeneration += 1
        focus = nil
        error = nil
        trouble = nil
        details = [:]
        files = [:]
        conversations = [:]
        ciGroups = []
    }

    @discardableResult
    func loadDetail(_ key: PrKey) async -> PrDetail? {
        do {
            return try await fetchDetail(key)
        } catch {
            app?.report(error)
            return nil
        }
    }

    @discardableResult
    func loadFiles(_ key: PrKey) async -> PrFiles? {
        do {
            return try await fetchFiles(key)
        } catch {
            app?.report(error)
            return nil
        }
    }

    private func fetchDetail(_ key: PrKey) async throws -> PrDetail {
        guard let backend else { throw APIError.network("Signed out.") }
        let detail = try await backend.pullRequest(key)
        details[key.key] = detail
        return detail
    }

    private func fetchFiles(_ key: PrKey) async throws -> PrFiles {
        guard let backend else { throw APIError.network("Signed out.") }
        let fresh = try await backend.pullRequestFiles(key)
        files[key.key] = fresh
        return fresh
    }

    // MARK: - Quick Review reads

    /// A read this recent is still good for the walk; older ones are read again.
    static let reviewSnapshotFreshFor: TimeInterval = 10 * 60

    /// The detail and files Quick Review walks: the prefetched read when it is recent, else a new one that retries
    /// once on its own before it fails.
    func reviewSnapshot(_ key: PrKey) async throws -> ReviewSnapshot {
        if let read = snapshotReads[key.key], let snapshot = try? await read.value, isFresh(key) { return snapshot }
        return try await startSnapshotRead(key).value
    }

    /// Reads the next pull request of the queue while you review this one. Failures stay quiet: the review reads
    /// it again when you get there.
    func prefetchReview(_ key: PrKey) {
        if snapshotReads[key.key] != nil, snapshotReadAt[key.key] == nil || isFresh(key) { return }
        startSnapshotRead(key)
    }

    @discardableResult
    private func startSnapshotRead(_ key: PrKey) -> Task<ReviewSnapshot, Error> {
        snapshotReadAt[key.key] = nil
        let read = Task { [weak self] () throws -> ReviewSnapshot in
            guard let self else { throw CancellationError() }
            return try await RetryOnce.run {
                async let detail = self.fetchDetail(key)
                async let files = self.fetchFiles(key)
                let snapshot = ReviewSnapshot(detail: try await detail, files: try await files)
                self.snapshotReadAt[key.key] = .now
                return snapshot
            }
        }
        snapshotReads[key.key] = read
        return read
    }

    private func isFresh(_ key: PrKey) -> Bool {
        guard let readAt = snapshotReadAt[key.key] else { return false }
        return Date.now.timeIntervalSince(readAt) < FocusStore.reviewSnapshotFreshFor
    }

    func markReviewOpened(_ key: PrKey) {
        openedReviews.insert(key.key)
    }

    /// The number of another pull request you approved in this review, for "Your approval of #405 isn't affected."
    func approvalElsewhere(than key: PrKey) -> Int? {
        if let held = hold.pending.last(where: { $0.key != key }) { return held.key.number }
        return reviewDecisions
            .filter { $0.key != key.key && $0.value.event == .approve && $0.value.status == .posted }
            .max { $0.value.at < $1.value.at }
            .flatMap { PrKey(key: $0.key)?.number }
    }

    /// After a decision posts: the pull request as GitHub has it now, and Focus.
    private func refreshAfterReview(_ key: PrKey) async {
        _ = try? await fetchDetail(key)
        await load()
    }

    @discardableResult
    func loadConversation(_ key: PrKey) async -> PrConversation? {
        guard let backend else { return nil }
        do {
            let fresh = try await backend.conversation(key)
            conversations[key.key] = fresh
            return fresh
        } catch {
            app?.report(error)
            return nil
        }
    }

    /// The conversation for Quick Review's walk, which shows other people's threads under their lines. A failure stays
    /// quiet: the walk reads fine without them.
    func readConversationQuietly(_ key: PrKey) async {
        guard let backend, let fresh = try? await backend.conversation(key) else { return }
        conversations[key.key] = fresh
    }

    // MARK: - Actions

    private func run(_ busyKey: String, _ work: (any PullRequestBackend) async throws -> Void) async -> Bool {
        guard let app, !app.busy.contains(busyKey) else { return false }
        app.busy.insert(busyKey)
        defer { app.busy.remove(busyKey) }
        do {
            try await work(app.pullRequests)
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
        let done = await run("rerun-\(key.key)") { backend in
            do {
                reruns = try await backend.rerunFailed(key).reruns
            } catch let refused as RerunRefused {
                // BorgDock Review stops offering what this account's token can't do.
                self.app?.direct?.noteActionsWrite(false, for: refused.account)
                throw refused
            }
        }
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
        reviewDecisions[key.key] = ReviewDecisionRecord(event: event, body: draft.body, lineComments: draft.lineComments, headSha: headSha,
                                                        at: .now, autoMerge: false, status: .posted)
        app?.toasts.show(event == .requestChanges ? "Asked for changes on #\(key.number)" : event == .approve ? "Approved #\(key.number)" : "Commented on #\(key.number)")
        await refreshAfterReview(key)
        return true
    }

    /// Approves after the Undo window. Face ID (when on) is asked first, so the wait isn't spent on it.
    /// `thenMerge`: Approve & auto-merge; the merge is asked for once the approval is sent (GitHub merges when
    /// the checks pass).
    func approve(_ key: PrKey, draft: ReviewDraft, headSha: String, thenMerge: MergeRequest? = nil, onUndo: @escaping @MainActor () -> Void) async -> Bool {
        guard await confirmWithFaceID("Approve #\(key.number)") else { return false }
        reviewDrafts[key.key] = draft
        reviewDecisions[key.key] = ReviewDecisionRecord(event: .approve, body: draft.body, lineComments: draft.lineComments, headSha: headSha,
                                                        at: .now, autoMerge: thenMerge != nil, status: .held)
        let request = SubmitReviewRequest(event: .approve, body: draft.body, headSha: headSha, comments: draft.lineComments)
        hold.hold(
            key,
            label: "Approving #\(key.number)",
            title: summary(key)?.title,
            send: { [weak self] in
                guard let backend = self?.backend else { throw APIError.network("Signed out.") }
                _ = try await backend.submitReview(key, request)
            },
            onUndo: { [weak self] in
                self?.reviewDecisions[key.key] = nil
                onUndo()
            },
            onSent: { [weak self] in
                self?.reviewDrafts[key.key] = nil
                self?.reviewDecisions[key.key]?.status = .posted
                self?.app?.toasts.show("Approved #\(key.number)")
                Task {
                    if let thenMerge, let backend = self?.backend {
                        do {
                            let response = try await backend.merge(key, thenMerge)
                            self?.app?.toasts.show(response.message)
                        } catch {
                            self?.app?.report(error)
                        }
                    }
                    await self?.refreshAfterReview(key)
                }
            },
            onFailure: { [weak self] error in
                guard let self else { return }
                let message = (error as? APIError)?.message ?? error.localizedDescription
                self.reviewDecisions[key.key]?.status = .failed(message)
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

/// Why the pull request list on screen is old.
struct ListTrouble: Equatable {
    enum Kind { case offline, token, other }

    let kind: Kind
    let message: String

    init(_ error: any Error) {
        let message = (error as? APIError)?.message ?? error.localizedDescription
        self.message = message
        if case .network? = error as? APIError {
            kind = .offline
        } else if message.hasPrefix("Could not reach GitHub") {
            kind = .offline
        } else if (error as? APIError)?.isUnauthorized == true {
            kind = .token
        } else {
            kind = .other
        }
    }
}

/// A pull request's detail and files, read together for Quick Review.
struct ReviewSnapshot: Sendable {
    let detail: PrDetail
    let files: PrFiles
}

/// An unfinished review: the overall comment and the line comments, as they'll be sent.
struct ReviewDraft: Hashable, Sendable {
    var body = ""
    /// By path, then by the line the comment is left on: the last line of one that covers several.
    var comments: [String: [DiffAnchor: String]] = [:]
    /// The first line of a comment on several lines, by path and by its last line.
    var starts: [String: [DiffAnchor: Int]] = [:]

    var lineComments: [ReviewLineComment] {
        comments.sorted { $0.key < $1.key }.flatMap { path, lines in
            lines.sorted { $0.key.line < $1.key.line }.map {
                ReviewLineComment(path: path, line: $0.key.line, side: $0.key.side, body: $0.value, startLine: starts[path]?[$0.key])
            }
        }
    }

    var isEmpty: Bool { body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && lineComments.isEmpty }

    /// `startLine`: the first line when the comment covers several; an empty text removes the draft.
    mutating func set(_ text: String, path: String, anchor: DiffAnchor, startLine: Int? = nil) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        var lines = comments[path] ?? [:]
        lines[anchor] = trimmed.isEmpty ? nil : trimmed
        comments[path] = lines.isEmpty ? nil : lines
        var first = starts[path] ?? [:]
        first[anchor] = trimmed.isEmpty ? nil : startLine.flatMap { $0 < anchor.line ? $0 : nil }
        starts[path] = first.isEmpty ? nil : first
    }

    func comment(path: String, anchor: DiffAnchor) -> String? { comments[path]?[anchor] }

    func startLine(path: String, anchor: DiffAnchor) -> Int? { starts[path]?[anchor] }

    /// Whether a draft covers this line: the diff tints the lines a comment is about.
    func covers(path: String, anchor: DiffAnchor) -> Bool {
        (comments[path] ?? [:]).keys.contains { end in
            end.side == anchor.side && (starts[path]?[end] ?? end.line) <= anchor.line && anchor.line <= end.line
        }
    }
}
