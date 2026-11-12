import Foundation
import Observation
import UIKit

/// The signed-in session and the live overview. Every screen reads from here; actions live in AppModel+Actions.
@MainActor
@Observable
final class AppModel {
    let router = Router()
    let toasts = ToastCenter()

    // One store per feature; each owns its data and talks to the server through `app.api`.
    let focus = FocusStore()
    let activity = ActivityStore()
    let account = AccountStore()
    let notes = NotesStore()
    let search = SearchStore()
    let sprint = SprintStore()

    private(set) var serverURL: URL
    private(set) var token: String?
    private(set) var signedOutReason: String?

    private(set) var config: AppConfig?
    private(set) var overview: Overview?
    private(set) var overviewError: String?
    private(set) var isLoadingOverview = false

    private(set) var pushEnabledOnServer: Bool?
    var pushRegistrationError: String?

    /// Keys of actions in flight, so their buttons show progress and can't be pressed twice.
    var busy: Set<String> = []

    @ObservationIgnored private let keychain = KeychainTokenStore()
    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private var refreshGeneration = 0

    convenience init() {
        let server = ServerSettings.current()
        self.init(serverURL: server, token: LaunchOverrides.token ?? KeychainTokenStore().token(for: server))
    }

    /// Tests pass a stub session; the app uses the shared one.
    init(serverURL: URL, token: String?, session: URLSession = .shared) {
        self.serverURL = serverURL
        self.token = token
        self.session = session
        focus.app = self
        activity.app = self
        account.app = self
        notes.app = self
        search.app = self
        sprint.app = self
        router.threadOpener = { [weak self] id in self?.openThread(id) }
    }

    // MARK: - Agents

    /// Every thread the overview knows: on items and without one.
    var allThreads: [ThreadSummary] {
        (overview?.items.flatMap(\.threads) ?? []) + (overview?.unlinkedThreads.map(\.thread) ?? [])
    }

    /// The open pull request an agent works on: the one whose branch it is on.
    func pullRequest(for thread: ThreadSummary) -> PrSummary? {
        guard let branch = thread.branch, !branch.isEmpty else { return nil }
        return focus.focus?.pullRequests.first { $0.headRef == branch }
    }

    /// An agent link (Live Activity, notification, search, activity): its pull request, else its work item, else the
    /// thread in T3 Code. BorgDock has no thread screen of its own. Waits briefly for the first overview after a cold start.
    func openThread(_ id: String) {
        Task {
            for _ in 0..<20 where overview == nil || focus.focus == nil {
                try? await Task.sleep(for: .milliseconds(250))
            }
            guard let thread = allThreads.first(where: { $0.id == id }) else {
                toasts.show("That agent isn't on this server any more")
                return
            }
            if let pr = pullRequest(for: thread) {
                router.openPullRequest(pr.prKey)
            } else if let entry = overview?.items.first(where: { $0.threads.contains { $0.id == id } }) {
                router.openItem(entry.item.id)
            } else {
                T3Link.open(thread)
            }
        }
    }

    var isSignedIn: Bool { token != nil }

    /// Agents waiting on you, for the Work tab's badge.
    var dispatchBadge: Int { overview.map { $0.walk?.briefing.needYou ?? OverviewSummary($0).waiting } ?? 0 }

    /// Deep links. Pairing and desktop links go to the account flow, the island's Undo to the approval hold, the rest to the router.
    func open(_ url: URL) {
        switch url.host() {
        case "pair": account.handlePairingLink(url)
        case "link-desktop": account.handleDesktopLink(url)
        case "approval":
            if let id = ApprovalUndoLink.holdId(from: url), !focus.hold.undo(holdId: id) { toasts.show("That approval already posted") }
        default: router.handle(url)
        }
    }

    var api: APIClient { APIClient(baseURL: serverURL, token: token, session: session, signer: signer) }

    /// The device key's signer, once the account flow has one.
    var signer: RequestSigner?

    // MARK: - Session

    func didSignIn(_ response: AppTokenResponse) async {
        do {
            try keychain.save(response.token, for: serverURL)
        } catch {
            toasts.show(error.localizedDescription, isError: true)
        }
        token = response.token
        signedOutReason = nil
        await PushRegistrar.requestPermissionAndRegister()
    }

    func signOut() async {
        _ = try? await api.logout()
        endSession(reason: nil)
    }

    /// Drops the local session without calling the server, e.g. after a 401.
    func endSession(reason: String?) {
        keychain.delete(for: serverURL)
        token = nil
        signedOutReason = reason
        config = nil
        overview = nil
        overviewError = nil
        router.reset()
    }

    func changeServer(to url: URL) {
        guard url != serverURL else { return }
        if isSignedIn { endSession(reason: nil) }
        ServerSettings.save(url)
        serverURL = url
        token = keychain.token(for: url)
    }

    /// Turns an error into a sentence for the user. A 401 also ends the session.
    @discardableResult
    func report(_ error: Error) -> String? {
        if error is CancellationError { return nil }
        if let error = error as? APIError, error.isUnauthorized {
            endSession(reason: "Your session ended. Sign in again.")
            return nil
        }
        let message = error.localizedDescription
        toasts.show(message, isError: true)
        return message
    }

    // MARK: - Data

    func bootstrap() async {
        guard isSignedIn else { return }
        await account.bootstrap()
        await loadConfig()
        await activity.refresh()
        await PushRegistrar.registerIfAllowed()
    }

    /// Quietly on launch; a pull to refresh passes `reportErrors` so failures show as a toast.
    func loadConfig(reportErrors: Bool = false) async {
        do {
            config = try await api.config()
        } catch {
            if reportErrors || (error as? APIError)?.isUnauthorized == true { report(error) }
        }
    }

    /// The 30 s poll and the reload after a write: the server's cached overview.
    func refreshOverview() async {
        await loadOverview { try await $0.overview() }
    }

    /// Pull to refresh: POST /api/refresh reads ADO and T3 now. The current overview stays on screen while it
    /// runs, and a failure shows as a toast instead of replacing it.
    func refreshFromSources() async {
        await loadOverview(reportErrorsAsToast: true) { try await $0.refresh() }
    }

    /// Only the newest load wins, so a slow poll can't overwrite the state after an action.
    private func loadOverview(reportErrorsAsToast: Bool = false, _ fetch: (APIClient) async throws -> Overview) async {
        guard isSignedIn else { return }
        refreshGeneration += 1
        let generation = refreshGeneration
        isLoadingOverview = true
        defer { if generation == refreshGeneration { isLoadingOverview = false } }
        do {
            let fresh = try await fetch(api)
            guard generation == refreshGeneration else { return }
            overview = fresh
            overviewError = nil
        } catch is CancellationError {
            return
        } catch let error as APIError {
            guard generation == refreshGeneration else { return }
            if error.isUnauthorized || (reportErrorsAsToast && overview != nil) {
                report(error)
            } else {
                overviewError = error.message
            }
        } catch {
            if reportErrorsAsToast && overview != nil { report(error) } else { overviewError = error.localizedDescription }
        }
    }

    /// Pull to refresh on an item: fresh sources and the item's ADO text, fetched in parallel.
    /// Returns the new detail, or nil when it couldn't be read (the error is shown as a toast).
    func refreshItem(_ id: Int) async -> ItemDetail? {
        let api = self.api
        async let detail = Result { try await api.item(id) }
        await refreshFromSources()
        switch await detail {
        case .success(let detail):
            return detail
        case .failure(let error):
            report(error)
            return nil
        }
    }

    /// Pull to refresh in Browse: the saved queries and the current query or search, fetched in parallel.
    func reloadBrowse(query: String, search: String?) async -> (queries: [BrowseQuery]?, result: BrowseResult?) {
        let api = self.api
        async let queries = Result { try await api.browseQueries() }
        async let result = Result { try await api.browse(query: query, search: search) }
        let (freshQueries, freshResult) = await (queries, result)
        if case .failure(let error) = freshResult { report(error) } else if case .failure(let error) = freshQueries { report(error) }
        return (try? freshQueries.get(), try? freshResult.get())
    }

    /// Pull to refresh in Settings: sessions, notification preferences and config, in parallel.
    func reloadSettings() async -> (preferences: NotificationPreferences?, sessions: [SessionInfo]?) {
        let api = self.api
        async let preferences = Result { try await api.notificationPreferences() }
        async let sessions = Result { try await api.sessions() }
        await loadConfig(reportErrors: true)
        let (freshPreferences, freshSessions) = await (preferences, sessions)
        for case .failure(let error) in [freshPreferences.map { _ in () }, freshSessions.map { _ in () }] {
            report(error)
            break
        }
        return (try? freshPreferences.get(), try? freshSessions.get())
    }

    /// The server applies a write, then re-syncs ADO and T3 in the background; look twice.
    func refreshAfterWrite() {
        Task {
            try? await Task.sleep(for: .milliseconds(800))
            await refreshOverview()
            try? await Task.sleep(for: .seconds(3))
            await refreshOverview()
        }
    }

    /// Polls every 30 s while the app is in the foreground; cancelled with the calling task.
    func pollOverview() async {
        while !Task.isCancelled {
            await refreshOverview()
            let delay: Duration = overviewError != nil && overview == nil ? .seconds(4) : .seconds(30)
            try? await Task.sleep(for: delay)
        }
    }

    func itemOverview(_ id: Int) -> ItemOverview? {
        overview?.items.first { $0.item.id == id }
    }

    var freeWorktrees: [Worktree] {
        overview?.worktrees.filter { $0.canStart } ?? []
    }

    // MARK: - Push

    func uploadPushToken(_ deviceToken: Data) async {
        guard isSignedIn else { return }
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        do {
            let response = try await api.registerAPNs(ApnsRegistration(deviceToken: hex, environment: PushRegistrar.environment))
            pushEnabledOnServer = response.enabled
            pushRegistrationError = nil
        } catch {
            pushRegistrationError = error.localizedDescription
            if (error as? APIError)?.isUnauthorized == true { report(error) }
        }
    }
}

/// Lets the notification delegate, which iOS calls outside SwiftUI, reach the app.
@MainActor
enum AppContext {
    static weak var model: AppModel?
}
