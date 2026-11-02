import XCTest
@testable import BorgDock

/// The widgets' snapshot on disk, the question actions, workstream files and the search jump.
final class ExtensionsTests: XCTestCase {
    private var folder: URL!

    override func setUpWithError() throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("i3-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: folder)
    }

    // MARK: Widget snapshot

    func testDecodesTheServersSnapshot() throws {
        let json = """
        {"generatedAt":"2026-10-30T20:05:00.123Z","focus":{"needYou":3,"ready":2,"waiting":5,"top":[{"key":"shop/shop#3712","number":3712,"title":"Checkout","segments":["success","failure","pending"],"age":"2 h"}]},
         "agents":{"waitingOnYou":2,"running":4},"master":{"state":"failing","repo":"shop/shop","job":"e2e / checkout","since":"2026-10-30T19:41:00Z","prsHit":3,"claimedBy":"Lars"}}
        """
        let snapshot = try JSONDecoder().decode(WidgetSnapshot.self, from: Data(json.utf8))
        XCTAssertEqual(snapshot.focus.top.first?.segments, [.success, .failure, .pending])
        XCTAssertEqual(snapshot.master.state, .failing)
        XCTAssertNotNil(snapshot.master.sinceDate)
        XCTAssertNotNil(snapshot.generatedDate)
    }

    func testAnUnknownMasterStateReadsAsUnknown() throws {
        let json = #"{"state":"flaky","repo":null,"job":null,"since":null,"prsHit":0,"claimedBy":null}"#
        XCTAssertEqual(try JSONDecoder().decode(WidgetSnapshot.Master.self, from: Data(json.utf8)).state, .unknown)
    }

    func testStoresTheSnapshotAndReportsWhetherItChanged() throws {
        let store = WidgetSnapshotStore(directory: folder)
        XCTAssertNil(store.load())
        XCTAssertTrue(try store.save(.placeholder))
        XCTAssertEqual(store.load(), .placeholder)
        XCTAssertFalse(try store.save(.placeholder), "the same snapshot needs no timeline reload")
        XCTAssertThrowsError(try WidgetSnapshotStore(directory: nil).save(.placeholder))
    }

    func testWidgetLinksOpenTheRightRoutes() {
        XCTAssertEqual(BorgDockLink.pullRequest(key: "shop/shop#3712")?.absoluteString, "borgdock://pr/shop/shop/3712")
        XCTAssertNil(BorgDockLink.pullRequest(key: "nonsense"))
        XCTAssertEqual(Router.Tab(link: "dispatch"), .dispatch)
        XCTAssertNil(Router.Tab(link: "nope"))
    }

    @MainActor
    func testTheRouterOpensTabAndWorkstreamLinks() {
        let router = Router()
        XCTAssertTrue(router.handle(BorgDockLink.tab("activity")))
        XCTAssertEqual(router.tab, .activity)
        XCTAssertTrue(router.handle(BorgDockLink.workstream("ws-1")))
        XCTAssertEqual(router.tab, .notes)
        XCTAssertEqual(router.notesPath, [.workstream("ws-1")])
    }

    // MARK: Live Activities

    func testTheAgentStateReadsTheServersIsoTime() throws {
        let json = #"{"step":"Running the tests","stepIndex":4,"stepCount":6,"status":"running","startedAt":"2026-10-30T20:58:00Z"}"#
        let state = try JSONDecoder().decode(AgentActivityState.self, from: Data(json.utf8))
        XCTAssertEqual(state.stepLabel, "step 4 of 6")
        XCTAssertEqual(state.startDate, ISODates.parse("2026-10-30T20:58:00Z"))
        XCTAssertEqual(ChecksActivityState(passed: 15, failed: 1, pending: 2, total: 18).finished, 16)
    }

    func testLiveActivityRegistrationMatchesTheContract() throws {
        let body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(LiveActivityRegistration.agent(threadId: "t1", pushToken: "ab"))) as? [String: String]
        XCTAssertEqual(body, ["kind": "agent", "threadId": "t1", "pushToken": "ab"])
        XCTAssertEqual(Data([0x0A, 0xFF]).tokenHex, "0aff")
    }

    // MARK: Question notification

    func testReadsTheQuestionWithItsReasons() throws {
        let card = try XCTUnwrap(NotificationQuestion(userInfo: ["dispatch": [
            "kind": "question", "itemId": 61044, "threadId": "t1", "requestId": "r", "questionId": "q",
            "recommended": 1, "allowCustomAnswer": true,
            "options": [["label": "SQLite plugin", "value": "sqlite"], ["label": "IndexedDB via idb-keyval", "value": "idb", "description": "Works in the WebView."]],
        ] as [String: Any]]))
        XCTAssertEqual(card.initialSelection, 1)
        XCTAssertEqual(card.options[1].description, "Works in the WebView.")
        XCTAssertNil(card.options[0].description)
        XCTAssertEqual(NotificationQuestion.shortLabel(card.options[1].label), "IndexedDB")
        XCTAssertNil(NotificationQuestion(userInfo: ["dispatch": ["kind": "finished", "itemId": 1, "threadId": "t"]]))
    }

    func testOptionActionIdentifiersRoundTrip() {
        XCTAssertEqual(QuestionActions.option(2), "answer.option.2")
        XCTAssertEqual(QuestionActions.optionIndex("answer.option.2"), 2)
        XCTAssertNil(QuestionActions.optionIndex("answer.text"))
    }

    // MARK: Workstreams

    @MainActor
    func testDecodesTheDesktopsWorkstreamFile() throws {
        let file = folder.appendingPathComponent("\(SampleVault.workstreamId).json")
        try Data(SampleVault.workstreamJSON.utf8).write(to: file)
        try Data("{".utf8).write(to: folder.appendingPathComponent("\(UUID().uuidString.lowercased()).json"))
        try Data(SampleVault.workstreamJSON.utf8).write(to: folder.appendingPathComponent("\(SampleVault.workstreamId)-PC.json"))
        let loaded = WorkstreamFiles.load(from: folder)
        XCTAssertEqual(loaded.count, 1, "malformed files and a sync client's copies are skipped")
        let workstream = try XCTUnwrap(loaded.first)
        XCTAssertEqual(workstream.title, "Offline-first mobile checkout")
        XCTAssertEqual(workstream.verifiedCount, 2)
        XCTAssertEqual(workstream.openCount, 1)
        XCTAssertEqual(workstream.evidence(for: workstream.outcomes[0]), ["gh:github.com/shop/shop#3650"])
        XCTAssertEqual(workstream.member("ado:acme#61044")?.ref, .item(organization: "acme", project: "Shop", id: 61044))
        XCTAssertNotNil(workstream.proposal(for: workstream.decisions[1]))
        XCTAssertFalse(workstream.resolvableKeys.contains { $0.hasPrefix("url:") })
        XCTAssertEqual(DecisionRow.detail(workstream, workstream.decisions[1]), "2 alternatives · agent proposal waiting")
        XCTAssertTrue(DecisionRow.detail(workstream, workstream.decisions[0]).hasSuffix("note \"Offline basket decisions\""))
    }

    func testAnUnknownReferenceKindStillDecodes() throws {
        let json = #"{"id":"x","title":"T","members":[{"key":"k","ref":{"kind":"deployment","id":"d"},"role":"context","label":"L","note":""}]}"#
        let workstream = try JSONDecoder().decode(Workstream.self, from: Data(json.utf8))
        XCTAssertEqual(workstream.members.first?.ref, .unknown)
        XCTAssertEqual(workstream.outcomes, [])
    }

    // MARK: Search

    func testANumberJumpsStraightToIt() throws {
        let results = try JSONDecoder().decode(SearchResults.self, from: Data(#"""
        {"query":"3712","pullRequests":[{"key":"shop/shop#3712","owner":"shop","repo":"shop","number":3712,"title":"Checkout","state":"open","isDraft":false,"mergedAt":null,"updatedAt":"2026-10-30T10:00:00Z","checks":null}],"items":[],"threads":[]}
        """#.utf8))
        XCTAssertEqual(SearchJump.route(for: "3712", results: results), .pullRequest(PrKey(owner: "shop", repo: "shop", number: 3712)))
        XCTAssertEqual(SearchJump.route(for: " #3712 ", results: results), .pullRequest(PrKey(owner: "shop", repo: "shop", number: 3712)))
        XCTAssertEqual(SearchJump.route(for: "AB#61021", results: results), .workItem(ItemRoute(id: 61021)))
        XCTAssertEqual(SearchJump.route(for: "61021", results: .empty), .workItem(ItemRoute(id: 61021)))
        XCTAssertNil(SearchJump.route(for: "99", results: .empty))
        XCTAssertNil(SearchJump.route(for: "checkout", results: results))
    }

    @MainActor
    func testNotesSearchFindsTitlesFirstThenText() {
        let store = NotesStore(defaults: UserDefaults(suiteName: "i3-\(UUID().uuidString)")!)
        XCTAssertTrue(store.search("anything").isEmpty)
        XCTAssertEqual(NotesStore.snippet("# Checkout\nThe timeout fix in #3712 waits on the e2e fix.", word: "timeout"), "# Checkout The timeout fix in #3712 waits on the e2e fix…")
    }
}
