import XCTest
@testable import BorgDock

/// Decodes an /api/overview in the shape the server sends: a capture with its text replaced by samples (Fixtures/overview.json).
final class APIDecodingTests: XCTestCase {
    private func fixture(_ name: String) throws -> Data {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: name, withExtension: "json"))
        return try Data(contentsOf: url)
    }

    func testDecodesTheCapturedOverview() throws {
        let overview = try JSONDecoder().decode(Overview.self, from: fixture("overview"))

        XCTAssertEqual(overview.items.count, 26)
        XCTAssertEqual(overview.unlinkedThreads.count, 4)
        XCTAssertEqual(overview.worktrees.map(\.name), (0...9).map { "M\($0)" })
        XCTAssertTrue(overview.sources.ado.ok)
        XCTAssertTrue(overview.sources.t3.ok)

        let bays = Dictionary(grouping: overview.items, by: \.bay).mapValues(\.count)
        XCTAssertEqual(bays[.waiting], 3)
        XCTAssertEqual(bays[.drift], 4)
        XCTAssertEqual(bays[.idle], 15)
        XCTAssertEqual(bays[.handed], 4)
        XCTAssertTrue(overview.items.allSatisfy(\.item.assignedToMe))
    }

    func testDecodesADriftItemWithItsSuggestionAndPullRequest() throws {
        let overview = try JSONDecoder().decode(Overview.self, from: fixture("overview"))
        let drift = try XCTUnwrap(overview.items.first { $0.item.id == 58568 })

        XCTAssertEqual(drift.bay, .drift)
        XCTAssertEqual(drift.item.type, .pbi)
        XCTAssertEqual(drift.item.state, "Development In Progress")
        XCTAssertEqual(drift.item.stateCategory, .inProgress)
        XCTAssertEqual(drift.suggestion?.to, "Code Review")
        XCTAssertEqual(drift.pullRequest?.number, 4062)
        XCTAssertEqual(drift.pullRequest?.state, .open)
        XCTAssertEqual(drift.item.workflow.first, "New")
        XCTAssertEqual(drift.item.workflow.last, "Done")
        XCTAssertNotNil(ISODate.parse(drift.item.dueDate))
        XCTAssertEqual(StateMove.suggested(in: overview), [StateMove(itemId: 58568, to: "Code Review")])
    }

    func testDecodesAWaitingThreadAndTheUnlinkedThreads() throws {
        let overview = try JSONDecoder().decode(Overview.self, from: fixture("overview"))
        let waiting = try XCTUnwrap(overview.items.first { $0.item.id == 59657 })
        let thread = try XCTUnwrap(waiting.threads.first)

        XCTAssertEqual(thread.status, .yourTurn)
        XCTAssertEqual(thread.worktree, "M0")
        XCTAssertNil(thread.questionRequestId)
        XCTAssertNotNil(thread.lastAgentMessage)
        XCTAssertNotNil(ISODate.parse(thread.lastActivityAt), "fractional-second timestamps parse")

        let unlinked = try XCTUnwrap(overview.unlinkedThreads.first { $0.thread.worktree == "M2" })
        XCTAssertEqual(unlinked.thread.status, .yourTurn)
        XCTAssertEqual(unlinked.thread.title, "Try a new image CDN")
        XCTAssertNil(unlinked.guessItemId)

        let summary = OverviewSummary(overview)
        XCTAssertEqual(summary.running, overview.items.filter { $0.bay == .working }.count, "the web rule: working bay only")
        XCTAssertEqual(summary.waiting, 3)
        XCTAssertEqual(summary.drift, 4)
    }

    func testUnknownEnumValuesAndAMissingAssignedToMeDoNotBreakDecoding() throws {
        let json = """
        {"id":1,"type":"Epic","typeName":"Epic","title":"T","state":"Odd","stateCategory":"Frozen","workflow":[],
         "sprint":"","dueDate":null,"priority":null,"tags":[],"assignedTo":null,"url":"u"}
        """
        let item = try JSONDecoder().decode(WorkItemSummary.self, from: Data(json.utf8))
        XCTAssertEqual(item.type, .other)
        XCTAssertEqual(item.stateCategory, .unknown)
        XCTAssertFalse(item.assignedToMe)

        let status = try JSONDecoder().decode([ThreadStatus].self, from: Data(#"["your-turn","thinking"]"#.utf8))
        XCTAssertEqual(status, [.yourTurn, .unknown])
    }

    func testDecodesAQueuedItemThatIsntMine() throws {
        let json = """
        {"item":{"id":59719,"type":"Bug","typeName":"Bug","title":"App | The shop app shows errors at checkout","state":"New","stateCategory":"Proposed",
          "workflow":["New","Development In Progress","Done"],"sprint":"5.2.8","dueDate":null,"priority":2,"tags":[],
          "assignedTo":null,"assignedToMe":false,"url":"u"},
         "bay":"next","waitingFor":null,"suggestion":null,"pullRequest":null,"threads":[],"queuedAt":"2026-10-02T20:40:00.000Z"}
        """
        let entry = try JSONDecoder().decode(ItemOverview.self, from: Data(json.utf8))
        XCTAssertEqual(entry.bay, .next)
        XCTAssertFalse(entry.item.assignedToMe)
        XCTAssertNil(entry.item.assignedTo)
        XCTAssertEqual(entry.queuedAt, "2026-10-02T20:40:00.000Z")
        XCTAssertTrue(StartThreadDraft(item: entry.item, fromBrowse: false, config: nil, worktrees: []).offersAssign)
    }

    func testDecodesQuestionsAndAnswerValues() throws {
        let json = """
        {"id":"q1","question":"Which?","options":[{"label":"Keep it","value":"keep"}],"recommended":0,"allowCustomAnswer":true,"multiSelect":false}
        """
        let question = try JSONDecoder().decode(AgentQuestion.self, from: Data(json.utf8))
        XCTAssertEqual(question.options.first?.value, "keep")
        XCTAssertEqual(question.recommended, 0)

        let answers = try JSONDecoder().decode([String: AnswerValue].self, from: Data(#"{"a":"x","b":["y","z"]}"#.utf8))
        XCTAssertEqual(answers, ["a": .single("x"), "b": .multiple(["y", "z"])])
    }

    func testReadsPushDataFromAnAPNsPayload() {
        let question: [AnyHashable: Any] = [
            "aps": ["alert": ["title": "59455: the agent asks", "body": "Which?"], "category": "DISPATCH_QUESTION"],
            "dispatch": [
                "kind": "question", "itemId": 59455, "threadId": "t1", "requestId": "r1", "questionId": "q1",
                "options": [["label": "Keep it", "value": "keep"]], "recommended": 0, "allowCustomAnswer": true,
            ],
        ]
        XCTAssertEqual(PushData(userInfo: question), .question(QuestionPush(
            itemId: 59455, threadId: "t1", requestId: "r1", questionId: "q1",
            options: [QuestionOption(label: "Keep it", value: "keep")], recommended: 0, allowCustomAnswer: true
        )))
        XCTAssertEqual(PushData(userInfo: ["dispatch": ["kind": "suggestion", "itemId": 7, "to": "Code Review"]]), .suggestion(itemId: 7, to: "Code Review"))
        XCTAssertEqual(PushData(userInfo: ["dispatch": ["kind": "finished", "itemId": 7, "threadId": "t"]]), .finished(itemId: 7, threadId: "t"))
        XCTAssertEqual(PushData(userInfo: ["dispatch": ["kind": "waiting", "itemId": 0]])?.itemId, 0)
        XCTAssertNil(PushData(userInfo: ["aps": [:]]))
    }
}

extension APIDecodingTests {
    func testRemoteWorkspaceIdentityModelsAndOfflineSelection() throws {
        let json = #"{"id":"windows:p1","environmentId":"windows","environmentLabel":"Windows","available":true,"name":"W4","state":"free","itemId":null,"running":false,"needsYou":false,"models":[{"id":"codex_work/sol","label":"Sol · Work","provider":"Codex","recent":false,"efforts":[],"defaultEffort":null}],"defaultModel":"codex_work/sol"}"#
        let workspace = try JSONDecoder().decode(Worktree.self, from: Data(json.utf8))
        XCTAssertEqual(workspace.id, "windows:p1")
        XCTAssertEqual(workspace.environmentLabel, "Windows")
        XCTAssertTrue(workspace.canStart)
        XCTAssertEqual(workspace.models?.first?.id, "codex_work/sol")
        var offline = workspace
        offline.available = false
        XCTAssertFalse(offline.canStart)
    }

    func testPerEnvironmentSourceStatusDecodesAlongsideLegacySummary() throws {
        let json = #"{"ado":{"ok":true,"at":null,"error":null},"t3":{"ok":false,"at":null,"error":"Windows offline"},"environments":[{"environmentId":"windows","label":"Windows","ok":false,"at":"2026-10-06T20:00:00Z","error":"Offline"}]}"#
        let sources = try JSONDecoder().decode(OverviewSources.self, from: Data(json.utf8))
        XCTAssertEqual(sources.environments?.first?.label, "Windows")
        XCTAssertEqual(sources.environments?.first?.ok, false)
    }
}
