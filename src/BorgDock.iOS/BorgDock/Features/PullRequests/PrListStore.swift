import Foundation
import Observation

/// What the Pull requests list shows: the tab, the query, the display and the saved views (the desktop's
/// `stores/pr-view-store.ts`). The tab, query and display are this iPhone's; the saved views sync with the server, which
/// the linked desktop reads and writes too (spec 2026-11-22-ios-pr-list.md, "Saved view sync").
@MainActor
@Observable
final class PrListStore {
    @ObservationIgnored weak var app: AppModel?

    /// The built-in tab, or the saved view's base tab while one is on screen.
    private(set) var view: PrViewKey
    /// The saved view on screen; nil while a built-in tab is.
    private(set) var activeViewId: String?
    /// Free text and qualifiers: the only filter state.
    private(set) var query: String
    /// What the list shows now: the active saved view's display (maybe edited), else `baseDisplay`.
    private(set) var display: PrDisplay
    /// The built-in tabs' display.
    private(set) var baseDisplay: PrDisplay
    /// Leaves failing pull requests out of every tab but Failing.
    private(set) var hideFailing: Bool
    private(set) var savedViews: [SavedPrView]
    private(set) var syncError: String?

    /// What this iPhone last read from or wrote to the server: the merge's base.
    @ObservationIgnored private var base: PrViews
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var syncTask: Task<Void, Never>?
    @ObservationIgnored private var syncing = false
    @ObservationIgnored private var syncAgain = false

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let decoder = JSONDecoder()
        func stored<T: Decodable>(_ type: T.Type, _ key: String) -> T? { defaults.data(forKey: key).flatMap { try? decoder.decode(type, from: $0) } }
        let migrated = Self.migrated(defaults)
        let baseDisplay = stored(PrDisplay.self, Keys.display) ?? migrated.display
        let savedViews = stored([SavedPrView].self, Keys.savedViews) ?? []
        let active = defaults.string(forKey: Keys.activeView).flatMap { id in savedViews.first { $0.id == id } }
        self.baseDisplay = baseDisplay
        self.savedViews = savedViews
        base = stored(PrViews.self, Keys.base) ?? .empty
        hideFailing = defaults.bool(forKey: Keys.hideFailing)
        view = defaults.string(forKey: Keys.view).flatMap(PrViewKey.init) ?? migrated.view
        query = defaults.string(forKey: Keys.query) ?? migrated.query
        activeViewId = active?.id
        display = active.map { stored(PrDisplay.self, Keys.activeDisplay) ?? $0.display } ?? baseDisplay
    }

    var activeView: SavedPrView? { activeViewId.flatMap { id in savedViews.first { $0.id == id } } }

    /// The list differs from the saved view on screen: Update view or Save as new.
    var activeViewIsEdited: Bool { activeView?.isEdited(filter: view, query: query, display: display) ?? false }

    // MARK: - Tabs and query

    /// A built-in tab: leaving a saved view drops its query and display.
    func showBuiltIn(_ key: PrViewKey) {
        if activeViewId != nil {
            activeViewId = nil
            display = baseDisplay
            query = ""
        }
        view = key
        persistList()
    }

    func showSaved(_ id: String) {
        guard let saved = savedViews.first(where: { $0.id == id }) else { return }
        activeViewId = id
        display = saved.display
        view = saved.filter
        query = saved.query
        persistList()
    }

    func setQuery(_ query: String) {
        guard query != self.query else { return }
        self.query = query
        defaults.set(query, forKey: Keys.query)
    }

    func setHideFailing(_ hide: Bool) {
        hideFailing = hide
        defaults.set(hide, forKey: Keys.hideFailing)
    }

    // MARK: - Display

    /// Changes the list's display; outside a saved view it becomes the built-in tabs' display too.
    func changeDisplay(_ change: (inout PrDisplay) -> Void) {
        change(&display)
        if activeViewId == nil { baseDisplay = display }
        persistList()
    }

    func resetDisplay() {
        changeDisplay { display in
            let kept = display.desktopFields
            display = PrDisplay()
            display.desktopFields = kept
        }
    }

    // MARK: - Saved views

    /// Saves the list as it is now as a new view and shows it.
    @discardableResult
    func saveView(name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let saved = SavedPrView(id: SavedPrView.newId(), name: trimmed.isEmpty ? "Untitled view" : String(trimmed.prefix(80)), filter: view, query: query, display: display)
        savedViews.append(saved)
        activeViewId = saved.id
        viewsChanged()
        persistList()
        return saved.id
    }

    /// Writes the list as it is now into the saved view on screen.
    func updateActiveView() {
        guard let id = activeViewId, let index = savedViews.firstIndex(where: { $0.id == id }) else { return }
        savedViews[index].filter = view
        savedViews[index].query = query
        savedViews[index].display = display
        viewsChanged()
    }

    /// Puts the saved view on screen back the way it was saved.
    func revertActiveView() {
        if let activeViewId { showSaved(activeViewId) }
    }

    func renameView(_ id: String, to name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let index = savedViews.firstIndex(where: { $0.id == id }) else { return }
        savedViews[index].name = String(trimmed.prefix(80))
        viewsChanged()
    }

    func moveView(_ id: String, by offset: Int) {
        guard let index = savedViews.firstIndex(where: { $0.id == id }), savedViews.indices.contains(index + offset) else { return }
        savedViews.swapAt(index, index + offset)
        viewsChanged()
    }

    func deleteView(_ id: String) {
        savedViews.removeAll { $0.id == id }
        viewsChanged()
        if activeViewId == id { showBuiltIn(.all) }
    }

    // MARK: - Sync

    /// Reads the server's views and merges them with this iPhone's; writes back what changed here.
    func sync() async {
        // Without a server there is nobody to share the views with: they stay this iPhone's.
        guard let app, app.isSignedIn, app.direct == nil else { return }
        if syncing {
            syncAgain = true
            return
        }
        syncing = true
        defer {
            syncing = false
            if syncAgain {
                syncAgain = false
                scheduleSync(after: .zero)
            }
        }
        for _ in 0..<3 {
            let mine = savedViews
            do {
                let theirs: PrViews = try await app.api.get("/api/pr-views")
                // Revisions only go up: a lower one means the server lost its list, so the base says nothing about it and
                // taking its list would delete every view here. Every view here then counts as added.
                let before = theirs.revision >= base.revision ? base.views : []
                let merged = theirs.revision == base.revision ? mine : PrViewMerge.merge(base: before, mine: mine, theirs: theirs.views)
                if merged == theirs.views {
                    adopt(theirs, sent: mine)
                } else {
                    let saved: PrViews = try await app.api.put("/api/pr-views", body: PutPrViewsRequest(baseRevision: theirs.revision, views: merged))
                    adopt(saved, sent: mine)
                }
                syncError = nil
                return
            } catch APIError.conflict {
                continue
            } catch is CancellationError {
                return
            } catch {
                syncError = error.localizedDescription
                return
            }
        }
    }

    /// Syncs a moment after a change, so a burst of edits is one write.
    func scheduleSync(after delay: Duration = .seconds(1)) {
        syncTask?.cancel()
        syncTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.sync()
        }
    }

    /// The server's answer becomes the base. Edits made here while the request ran are merged onto it, not lost.
    private func adopt(_ server: PrViews, sent: [SavedPrView]) {
        base = server
        persist(base, Keys.base)
        let views = savedViews == sent ? server.views : PrViewMerge.merge(base: sent, mine: savedViews, theirs: server.views)
        if views != server.views { scheduleSync() }
        apply(views)
    }

    /// New views from a sync. The active view gone: back to All. Changed while you hadn't edited it: its new version.
    private func apply(_ views: [SavedPrView]) {
        let before = activeView
        let editedBefore = activeViewIsEdited
        savedViews = views
        persist(savedViews, Keys.savedViews)
        guard let before else { return }
        guard let after = activeView else {
            showBuiltIn(.all)
            return
        }
        if after != before, !editedBefore { showSaved(after.id) }
    }

    private func viewsChanged() {
        persist(savedViews, Keys.savedViews)
        scheduleSync()
    }

    // MARK: - Storage

    enum Keys {
        static let view = "prs.view"
        static let activeView = "prs.activeView"
        static let activeDisplay = "prs.activeDisplay"
        static let query = "prs.query"
        static let display = "prs.display"
        static let hideFailing = "prs.hideFailing"
        static let savedViews = "prs.savedViews"
        static let base = "prs.viewsBase"
        static let folded = "prs.folded"
    }

    private func persistList() {
        defaults.set(view.rawValue, forKey: Keys.view)
        defaults.set(activeViewId, forKey: Keys.activeView)
        defaults.set(query, forKey: Keys.query)
        persist(baseDisplay, Keys.display)
        if activeViewId != nil { persist(display, Keys.activeDisplay) } else { defaults.removeObject(forKey: Keys.activeDisplay) }
    }

    private func persist(_ value: some Encodable, _ key: String) {
        if let data = try? JSONEncoder().encode(value) { defaults.set(data, forKey: key) }
    }

    /// Builds before the desktop's list kept a pill, a grouping, an order and a Drafts switch. New installs start like
    /// the desktop: by status, by priority.
    static func migrated(_ defaults: UserDefaults) -> (view: PrViewKey, query: String, display: PrDisplay) {
        var display = PrDisplay()
        switch defaults.string(forKey: "prs.grouping") {
        case "author": display.groupBy = .author
        case "repository": display.groupBy = .repo
        case "status": display.groupBy = .status
        case "flat": display.groupBy = .none
        default: break
        }
        switch defaults.string(forKey: "prs.sort") {
        case "waiting": (display.sortBy, display.sortDir) = (.created, .asc)
        case "updated": (display.sortBy, display.sortDir) = (.updated, .desc)
        case "newest": (display.sortBy, display.sortDir) = (.created, .desc)
        case "smallest": (display.sortBy, display.sortDir) = (.size, .asc)
        case "title": (display.sortBy, display.sortDir) = (.title, .asc)
        default: break
        }
        let view: PrViewKey = switch defaults.string(forKey: "prs.filter") {
        case "yourTurn": .needsYou
        case "mine": .mine
        case "failing": .failing
        case "ready": .ready
        default: .all
        }
        let hidesDrafts = defaults.object(forKey: "prs.showDrafts") as? Bool == false
        return (view, hidesDrafts ? "-is:draft" : "", display)
    }
}
