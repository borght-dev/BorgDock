import Foundation
import Observation

/// A pull request: `owner/repo#number`, the key the server uses everywhere.
struct PrKey: Hashable, Codable, Sendable, Identifiable {
    let owner: String
    let repo: String
    let number: Int

    var id: String { key }
    var key: String { "\(owner)/\(repo)#\(number)" }
    /// "/api/prs/owner/repo/12"
    var apiPath: String { "/api/prs/\(APIClient.pathComponent(owner))/\(APIClient.pathComponent(repo))/\(number)" }

    init(owner: String, repo: String, number: Int) {
        self.owner = owner
        self.repo = repo
        self.number = number
    }

    /// Parses "owner/repo#12".
    init?(key: String) {
        let parts = key.split(separator: "#", maxSplits: 1)
        guard parts.count == 2, let number = Int(parts[1]) else { return nil }
        let names = parts[0].split(separator: "/", maxSplits: 1)
        guard names.count == 2 else { return nil }
        self.init(owner: String(names[0]), repo: String(names[1]), number: number)
    }
}

struct ItemRoute: Hashable {
    let id: Int
    /// Shown while GET /api/items/:id loads, e.g. a Browse result that isn't in the overview.
    var prefill: WorkItemSummary?
}

struct StartContext: Identifiable {
    let id = UUID()
    let item: WorkItemSummary
    /// Offers "Assign to me" when the item came from Browse and isn't his.
    let fromBrowse: Bool
    var initialMode: StartMode = .plan
}

/// What the start-an-agent sheet starts from. Every field is optional; the sheet fills in the rest.
struct LaunchContext: Identifiable, Hashable {
    let id = UUID()
    var itemId: Int?
    var prKey: String?
    var ciGroupId: String?
    /// Continue or start beside this thread.
    var threadId: String?
    var message: String = ""
    var title: String = ""
}

/// Every screen a navigation stack can show. Each tab keeps its own path of these.
enum Route: Hashable {
    case pullRequest(PrKey)
    case workItem(ItemRoute)
    case ciGroup(String)
    case workstream(String)
    /// A note by its path inside the vault, e.g. "Daily/2026-10-30.md".
    case note(String)
    case browse
    case activity
    case settings
    case machines
    /// The vault; Focus's notes button and note links open it.
    case notes
    case sprintItems(SprintList)
    /// Which repositories the Pull requests list reads (Settings → Pull requests).
    case repositories
}

/// Sheets, presented over whatever tab is showing.
enum SheetRoute: Identifiable {
    case start(StartContext)
    case launch(LaunchContext)
    case merge(PrKey)
    case checks(PrKey)
    case quickCapture
    case addMachine
    case linkDesktop
    case settings

    var id: String {
        switch self {
        case .start(let context): "start-\(context.id)"
        case .launch(let context): "launch-\(context.id)"
        case .merge(let key): "merge-\(key.key)"
        case .checks(let key): "checks-\(key.key)"
        case .quickCapture: "quick-capture"
        case .addMachine: "add-machine"
        case .linkDesktop: "link-desktop"
        case .settings: "settings"
        }
    }
}

/// Full-screen flows.
enum CoverRoute: Identifiable, Hashable {
    /// Quick Review of one pull request, or a queue of them.
    case review([PrKey])

    var id: String {
        switch self {
        case .review(let keys): "review-" + keys.map(\.key).joined(separator: ",")
        }
    }
}

@MainActor
@Observable
final class Router {
    enum Tab: Hashable {
        case today, pullRequests, work, sprint, search

        /// borgdock://tab/<name>, from the widgets, which send "focus" and "dispatch"; links from before keep "today".
        init?(link: String) {
            switch link {
            case "today", "focus": self = .today
            case "prs": self = .pullRequests
            case "work", "dispatch": self = .work
            case "sprint": self = .sprint
            case "search": self = .search
            default: return nil
            }
        }
    }

    var tab: Tab = .today
    var todayPath: [Route] = []
    var pullRequestsPath: [Route] = []
    var workPath: [Route] = []
    var sprintPath: [Route] = []
    var searchPath: [Route] = []
    var sheet: SheetRoute?
    var cover: CoverRoute?
    /// A bay or lane to scroll Dispatch to (DEBUG screenshots).
    var scrollTarget: String?

    /// Pushes onto the current tab's stack.
    func push(_ route: Route) {
        switch tab {
        case .today: todayPath.append(route)
        case .pullRequests: pullRequestsPath.append(route)
        case .work: workPath.append(route)
        case .sprint: sprintPath.append(route)
        case .search: searchPath.append(route)
        }
    }

    /// Switches to `tab` and shows `route` as its only screen, e.g. from a notification.
    func open(_ route: Route, in tab: Tab) {
        open([route], in: tab)
    }

    func open(_ path: [Route], in tab: Tab) {
        sheet = nil
        cover = nil
        self.tab = tab
        switch tab {
        case .today: todayPath = path
        case .pullRequests: pullRequestsPath = path
        case .work: workPath = path
        case .sprint: sprintPath = path
        case .search: searchPath = path
        }
    }

    func present(_ sheet: SheetRoute) {
        self.sheet = sheet
    }

    func push(_ item: ItemRoute) {
        push(.workItem(item))
    }

    func openItem(_ id: Int) {
        open(.workItem(ItemRoute(id: id)), in: .work)
    }

    func openPullRequest(_ key: PrKey) {
        open(.pullRequest(key), in: .pullRequests)
    }

    /// Activity lives behind the bell on Focus, not in the tab bar.
    func openActivity() {
        open(.activity, in: .today)
    }

    /// An agent link: AppModel resolves it to the agent's pull request, its item, or the thread in T3 Code.
    @ObservationIgnored var threadOpener: (@MainActor (String) -> Void)?

    func openThread(_ id: String) {
        threadOpener?(id)
    }

    /// Notes live behind Focus's notes button; a note opens on top of the vault, so Back shows the rest.
    func openNote(_ path: String) {
        open([.notes, .note(path)], in: .today)
    }

    func start(_ item: WorkItemSummary, fromBrowse: Bool, mode: StartMode = .plan) {
        sheet = .start(StartContext(item: item, fromBrowse: fromBrowse, initialMode: mode))
    }

    func review(_ keys: [PrKey]) {
        sheet = nil
        cover = .review(keys)
    }

    func reset() {
        tab = .today
        todayPath = []
        pullRequestsPath = []
        workPath = []
        sprintPath = []
        searchPath = []
        sheet = nil
        cover = nil
    }

    /// borgdock://pr/owner/repo/12, borgdock://item/123, borgdock://thread/<id>, borgdock://ci/<id>,
    /// borgdock://note/<path>, borgdock://capture, borgdock://review/owner/repo/12, borgdock://workstream/<id>,
    /// borgdock://tab/<focus|prs|work|sprint|activity|notes|search> (activity and notes open on Focus).
    /// Pairing and desktop links (borgdock://pair?…, borgdock://link-desktop?…) are handled by the account flow and
    /// the island's Undo (borgdock://approval/<id>/undo) by the approval hold, not here. Returns false if unknown.
    @discardableResult
    func handle(_ url: URL) -> Bool {
        guard url.scheme == "borgdock" else { return false }
        let parts = [url.host() ?? ""] + url.pathComponents.filter { $0 != "/" }
        switch parts.first {
        case "pr" where parts.count == 4:
            guard let number = Int(parts[3]) else { return false }
            openPullRequest(PrKey(owner: parts[1], repo: parts[2], number: number))
        case "review" where parts.count == 4:
            guard let number = Int(parts[3]) else { return false }
            review([PrKey(owner: parts[1], repo: parts[2], number: number)])
        case "item" where parts.count == 2:
            guard let id = Int(parts[1]) else { return false }
            openItem(id)
        case "thread" where parts.count == 2:
            openThread(parts[1])
        case "ci" where parts.count == 2:
            open(.ciGroup(parts[1]), in: .pullRequests)
        case "note" where parts.count >= 2:
            openNote(parts.dropFirst().joined(separator: "/"))
        case "capture":
            present(.quickCapture)
        case "workstream" where parts.count == 2:
            open([.notes, .workstream(parts[1])], in: .today)
        case "tab" where parts.count == 2 && parts[1] == "activity":
            openActivity()
        case "tab" where parts.count == 2 && parts[1] == "notes":
            open(.notes, in: .today)
        case "tab" where parts.count == 2:
            guard let tab = Tab(link: parts[1]) else { return false }
            sheet = nil
            cover = nil
            self.tab = tab
        default:
            return false
        }
        return true
    }
}
