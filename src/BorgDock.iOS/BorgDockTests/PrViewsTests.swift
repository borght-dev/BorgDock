import XCTest
@testable import BorgDock

/// Saved views: the three-way merge both apps share, the store's tabs and edits, and its sync over /api/pr-views.
@MainActor
final class PrViewsTests: XCTestCase {
    private func view(_ id: String, _ name: String = "", query: String = "") -> SavedPrView {
        SavedPrView(id: id, name: name.isEmpty ? id : name, filter: .all, query: query, display: PrDisplay())
    }

    private func ids(_ views: [SavedPrView]) -> [String] { views.map(\.id) }

    // MARK: - Merge (spec 2026-11-22-ios-pr-list.md)

    func testMergeKeepsTheirOrderAndAppendsWhatWasAddedHere() {
        let base = [view("a"), view("b")]
        let theirs = [view("b"), view("a"), view("t")]
        let mine = base + [view("m")]
        XCTAssertEqual(ids(PrViewMerge.merge(base: base, mine: mine, theirs: theirs)), ["b", "a", "t", "m"])
    }

    func testMergeDropsWhatWasDeletedHere() {
        let base = [view("a"), view("b")]
        XCTAssertEqual(ids(PrViewMerge.merge(base: base, mine: [view("b")], theirs: [view("a"), view("b"), view("t")])), ["b", "t"])
    }

    func testAnEditHereWinsAndComesBackWhenTheyDeletedIt() {
        let base = [view("a", query: "repo:shop"), view("b")]
        let mine = [view("a", query: "repo:web"), view("b", "Bee")]
        let theirs = [view("a", query: "repo:api")]
        let merged = PrViewMerge.merge(base: base, mine: mine, theirs: theirs)
        XCTAssertEqual(ids(merged), ["a", "b"])
        XCTAssertEqual(merged[0].query, "repo:web", "edited here replaces their copy")
        XCTAssertEqual(merged[1].name, "Bee", "edited here, deleted there: it comes back at the end")
    }

    func testAnUnchangedViewTakesTheirEdit() {
        let base = [view("a", query: "repo:shop")]
        XCTAssertEqual(PrViewMerge.merge(base: base, mine: base, theirs: [view("a", query: "repo:api")]).first?.query, "repo:api")
        XCTAssertEqual(PrViewMerge.merge(base: [], mine: [], theirs: [view("t")]).map(\.id), ["t"], "a first sync takes the desktop's")
    }

    // MARK: - Store

    private func freshDefaults() -> UserDefaults {
        let name = "pr-views-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    func testOlderDisplayChoicesMoveToTheirMatch() {
        let defaults = freshDefaults()
        defaults.set("repository", forKey: "prs.grouping")
        defaults.set("waiting", forKey: "prs.sort")
        defaults.set("yourTurn", forKey: "prs.filter")
        defaults.set(false, forKey: "prs.showDrafts")
        let store = PrListStore(defaults: defaults)
        XCTAssertEqual(store.display.groupBy, .repo)
        XCTAssertEqual(store.display.sortBy, .created)
        XCTAssertEqual(store.display.sortDir, .asc, "waiting longest is created, oldest first")
        XCTAssertEqual(store.view, .needsYou)
        XCTAssertEqual(store.query, "-is:draft", "hidden drafts become a filter")

        let fresh = PrListStore(defaults: freshDefaults())
        XCTAssertEqual(fresh.display, PrDisplay(), "a new install starts like the desktop")
        XCTAssertEqual(fresh.display.groupBy, .status)
        XCTAssertEqual(fresh.display.sortBy, .priority)
    }

    func testASavedViewKeepsItsTabQueryAndDisplayAndShowsWhenItIsEdited() {
        let defaults = freshDefaults()
        let store = PrListStore(defaults: defaults)
        store.showBuiltIn(.mine)
        store.setQuery("repo:shop")
        store.changeDisplay { $0.groupBy = .repo }
        let id = store.saveView(name: "  Shop  ")
        XCTAssertEqual(store.activeView?.name, "Shop")
        XCTAssertEqual(store.activeView?.filter, .mine)
        XCTAssertFalse(store.activeViewIsEdited)

        store.setQuery("repo:shop author:priya")
        XCTAssertTrue(store.activeViewIsEdited)
        store.changeDisplay { $0.sortBy = .title }
        XCTAssertEqual(PrListStore(defaults: defaults).display.sortBy, .title, "the edit survives a restart")
        store.updateActiveView()
        XCTAssertFalse(store.activeViewIsEdited)

        store.showBuiltIn(.all)
        XCTAssertEqual(store.query, "", "leaving a view drops its query")
        XCTAssertEqual(store.display.groupBy, .repo, "and brings back the built-in display")
        XCTAssertEqual(store.display.sortBy, .priority)
        store.showSaved(id)
        XCTAssertEqual(store.query, "repo:shop author:priya")
        store.deleteView(id)
        XCTAssertNil(store.activeViewId)
        XCTAssertEqual(store.view, .all)
    }

    func testSyncMergesWithTheServerAndWritesOverItsRevision() async throws {
        let app = AppModel(serverURL: StubURLProtocol.baseURL, token: "test-token", session: StubURLProtocol.session())
        let store = PrListStore(defaults: freshDefaults())
        store.app = app
        let desktopView = #"{"id":"d1","name":"Desk","filter":"failing","query":"repo:api","display":{"layout":"board","groupBy":"repo"}}"#
        StubURLProtocol.respond { request in
            if request.method == "GET" { return (200, #"{"revision":4,"views":[\#(desktopView)],"updatedAt":"2026-11-22T10:00:00Z"}"#) }
            let body = request.json as? [String: Any]
            let views = String(data: try! JSONSerialization.data(withJSONObject: body?["views"] ?? []), encoding: .utf8)!
            return (200, #"{"revision":5,"views":\#(views),"updatedAt":"2026-11-22T10:01:00Z"}"#)
        }
        store.setQuery("author:me")
        store.saveView(name: "Mine")
        await store.sync()

        let put = try XCTUnwrap(StubURLProtocol.requests.first { $0.method == "PUT" })
        XCTAssertEqual(put.path, "/api/pr-views")
        let body = try XCTUnwrap(put.json as? [String: Any])
        XCTAssertEqual(body["baseRevision"] as? Int, 4, "written over the revision it read")
        let sent = try XCTUnwrap(body["views"] as? [[String: Any]])
        XCTAssertEqual(sent.map { $0["name"] as? String }, ["Desk", "Mine"])
        XCTAssertEqual((sent[0]["display"] as? [String: Any])?["layout"] as? String, "board", "the desktop's layout survives the phone")
        XCTAssertEqual((sent[1]["display"] as? [String: Any])?["layout"] as? String, "table", "a phone view carries the desktop's defaults")
        XCTAssertEqual(store.savedViews.map(\.name), ["Desk", "Mine"])
    }

    func testAConflictReadsAgainAndAViewDeletedElsewhereLeavesTheList() async throws {
        let app = AppModel(serverURL: StubURLProtocol.baseURL, token: "test-token", session: StubURLProtocol.session())
        let store = PrListStore(defaults: freshDefaults())
        store.app = app
        let shared = #"{"id":"v1","name":"Shop","filter":"all","query":"repo:shop","display":{}}"#
        StubURLProtocol.respond { _ in (200, #"{"revision":1,"views":[\#(shared)],"updatedAt":null}"#) }
        await store.sync()
        store.showSaved("v1")
        XCTAssertEqual(store.query, "repo:shop")

        // The desktop deleted it.
        StubURLProtocol.respond { _ in (200, #"{"revision":2,"views":[],"updatedAt":null}"#) }
        await store.sync()
        XCTAssertTrue(store.savedViews.isEmpty)
        XCTAssertNil(store.activeViewId, "the list goes back to All")
        XCTAssertEqual(store.query, "")

        // A write that loses the race reads again, merges and writes over the new revision.
        store.saveView(name: "Again")
        let calls = LockedCounter()
        StubURLProtocol.respond { request in
            if request.method == "GET" { return (200, #"{"revision":\#(calls.next() == 0 ? 2 : 3),"views":[],"updatedAt":null}"#) }
            let base = (request.json as? [String: Any])?["baseRevision"] as? Int
            return base == 2 ? (409, #"{"error":"changed","current":{"revision":3,"views":[],"updatedAt":null}}"#) : (200, #"{"revision":4,"views":[],"updatedAt":null}"#)
        }
        await store.sync()
        let puts = StubURLProtocol.requests.filter { $0.method == "PUT" }.compactMap { ($0.json as? [String: Any])?["baseRevision"] as? Int }
        XCTAssertEqual(puts, [2, 3])
    }
}

/// Counts calls from the stub's background thread.
final class LockedCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0

    func next() -> Int {
        lock.withLock {
            defer { value += 1 }
            return value
        }
    }
}
