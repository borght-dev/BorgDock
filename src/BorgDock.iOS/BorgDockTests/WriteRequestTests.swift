import UserNotifications
import XCTest
@testable import BorgDock

/// The writes that touch real T3 agents and ADO items, checked against a stub server only:
/// method, path, bearer header and the exact JSON body.
final class WriteRequestTests: XCTestCase {
    private func body(_ request: StubURLProtocol.Recorded) throws -> [String: Any] {
        try XCTUnwrap(request.json as? [String: Any], "JSON body")
    }

    func testStartThreadSendsTheContractBodyWithExplicitNulls() async throws {
        StubURLProtocol.respond { _ in (200, #"{"threadId":"t1","link":"http://t3/t1","adoState":null,"warning":"ADO state not changed: denied"}"#) }
        let response = try await StubURLProtocol.client().startThread(StartThreadRequest(
            itemId: 59463, worktree: "M5", model: "codex/gpt-6.1-sol", effort: "xhigh", mode: .plan, prompt: "Pick up AB#59463",
            moveAdoTo: nil, assignToMe: false
        ))

        XCTAssertEqual(response.warning, "ADO state not changed: denied")
        let request = try XCTUnwrap(StubURLProtocol.requests.only)
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.path, "/api/threads")
        XCTAssertEqual(request.headers["Authorization"], "Bearer test-token")
        XCTAssertEqual(request.headers["Content-Type"], "application/json")
        XCTAssertEqual(request.headers["X-Dispatch-Intent"], "1")
        let json = try body(request)
        XCTAssertEqual(json["itemId"] as? Int, 59463)
        XCTAssertEqual(json["worktree"] as? String, "M5")
        XCTAssertEqual(json["model"] as? String, "codex/gpt-6.1-sol")
        XCTAssertEqual(json["effort"] as? String, "xhigh")
        XCTAssertNil(json["agent"], "the deprecated agent field is no longer sent")
        XCTAssertEqual(json["mode"] as? String, "plan")
        XCTAssertEqual(json["prompt"] as? String, "Pick up AB#59463")
        XCTAssertTrue(json["moveAdoTo"] is NSNull, "moveAdoTo is sent as null, not left out")
        XCTAssertEqual(json["assignToMe"] as? Bool, false)
    }

    func testStartThreadSendsANullEffortForModelsWithoutReasoningLevels() async throws {
        StubURLProtocol.respond { _ in (200, #"{"threadId":"t1","link":"l","adoState":"In Progress","warning":null}"#) }
        _ = try await StubURLProtocol.client().startThread(StartThreadRequest(
            itemId: 1, worktree: "M7", model: "claudeAgent/claude-haiku-4-5", effort: nil, mode: .default, prompt: "Go",
            moveAdoTo: "In Progress", assignToMe: true
        ))
        let json = try body(try XCTUnwrap(StubURLProtocol.requests.only))
        XCTAssertEqual(json["model"] as? String, "claudeAgent/claude-haiku-4-5")
        XCTAssertTrue(json["effort"] is NSNull)
        XCTAssertNil(json["agent"])
        XCTAssertEqual(json["mode"] as? String, "default")
        XCTAssertEqual(json["moveAdoTo"] as? String, "In Progress")
        XCTAssertEqual(json["assignToMe"] as? Bool, true)
    }

    func testQAStartSendsModeQAWithANullMove() async throws {
        StubURLProtocol.respond { _ in (200, #"{"threadId":"t1","link":"l","appLink":"t3code://threads/e/t1","adoState":null,"warning":null}"#) }
        let response = try await StubURLProtocol.client().startThread(StartThreadRequest(
            itemId: 59455, worktree: "M3", model: "codex/gpt-6.1-sol", effort: "high", mode: .qa, prompt: "/ado-update-for-qa AB#59455",
            moveAdoTo: nil, assignToMe: false
        ))
        XCTAssertEqual(response.appLink, "t3code://threads/e/t1")
        let json = try body(try XCTUnwrap(StubURLProtocol.requests.only))
        XCTAssertEqual(json["mode"] as? String, "qa")
        XCTAssertTrue(json["moveAdoTo"] is NSNull)
        XCTAssertEqual(json["worktree"] as? String, "M3")
    }

    func testDoneStartSendsModeDoneWithANullMove() async throws {
        StubURLProtocol.respond { _ in (200, #"{"threadId":"t2","link":"l","appLink":"t3code://threads/e/t2","adoState":null,"warning":null}"#) }
        _ = try await StubURLProtocol.client().startThread(StartThreadRequest(
            itemId: 59461, worktree: "M8", model: "codex/gpt-6.1-sol", effort: nil, mode: .done,
            prompt: "Close AB#59461 as Done without QA and write down why.", moveAdoTo: nil, assignToMe: false
        ))
        let json = try body(try XCTUnwrap(StubURLProtocol.requests.only))
        XCTAssertEqual(json["mode"] as? String, "done")
        XCTAssertTrue(json["moveAdoTo"] is NSNull)
        XCTAssertEqual(json["prompt"] as? String, "Close AB#59461 as Done without QA and write down why.")
    }

    func testStartOptionsDecodeAndComeFromTheItemRoute() async throws {
        StubURLProtocol.respond { _ in
            (200, #"{"prompts":{"pickup":"Pick up AB#7","qa":"/ado-update-for-qa AB#7","done":"Close AB#7"},"branch":null,"qaWorktree":"M2"}"#)
        }
        let options = try await StubURLProtocol.client().startOptions(itemId: 7)
        XCTAssertEqual(StubURLProtocol.requests.map { "\($0.method) \($0.path)" }, ["GET /api/items/7/start"])
        XCTAssertEqual(options.prompts.qa, "/ado-update-for-qa AB#7")
        XCTAssertEqual(options.prompts.done, "Close AB#7")
        XCTAssertNil(options.branch)
        XCTAssertEqual(options.qaWorktree, "M2")

        let pr = try JSONDecoder().decode(PullRequest.self, from: Data(#"{"number":1,"url":"u","state":"open","title":"t","isDraft":false,"checks":null}"#.utf8))
        XCTAssertNil(pr.branch, "older servers don't send the PR branch")
    }

    func testAnswerSendsOptionValuesKeyedByQuestion() async throws {
        StubURLProtocol.respond { _ in (200, #"{"ok":true}"#) }
        _ = try await StubURLProtocol.client().answer(threadId: "thread-1", AnswerRequest(requestId: "req-1", answers: ["q1": .single("keep"), "q2": .multiple(["a", "b"])]))

        let request = try XCTUnwrap(StubURLProtocol.requests.only)
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.path, "/api/threads/thread-1/answers")
        let json = try body(request)
        XCTAssertEqual(json["requestId"] as? String, "req-1")
        let answers = try XCTUnwrap(json["answers"] as? [String: Any])
        XCTAssertEqual(answers["q1"] as? String, "keep")
        XCTAssertEqual(answers["q2"] as? [String], ["a", "b"])
    }

    func testSettleMoveDismissQueueAndLink() async throws {
        StubURLProtocol.respond { request in
            request.path.hasSuffix("/state") ? (200, #"{"state":"Code Review"}"#) : (200, #"{"ok":true}"#)
        }
        let client = StubURLProtocol.client()
        _ = try await client.settle(threadId: "t1")
        let moved = try await client.moveState(itemId: 58568, to: "Code Review")
        _ = try await client.dismissSuggestion(itemId: 58451)
        _ = try await client.queue(itemId: 59458)
        _ = try await client.unqueue(itemId: 59458)
        _ = try await client.link(threadId: "t2", to: 59461)

        XCTAssertEqual(moved.state, "Code Review")
        let sent = StubURLProtocol.requests
        XCTAssertEqual(sent.map { "\($0.method) \($0.path)" }, [
            "POST /api/threads/t1/settle",
            "POST /api/items/58568/state",
            "POST /api/items/58451/dismiss",
            "POST /api/queue/59458",
            "DELETE /api/queue/59458",
            "POST /api/threads/t2/link",
        ])
        XCTAssertEqual(try body(sent[1])["to"] as? String, "Code Review")
        XCTAssertEqual(try body(sent[0]).count, 0, "settle sends {}")
        XCTAssertEqual(try body(sent[5])["itemId"] as? Int, 59461)
    }

    func testApplyAllMovesEachSuggestedItemAndReportsFailures() async throws {
        StubURLProtocol.respond { request in
            request.path == "/api/items/2/state" ? (409, #"{"error":"The item changed in ADO."}"#) : (200, #"{"state":"Ready For QA"}"#)
        }
        let moves = [StateMove(itemId: 1, to: "Code Review"), StateMove(itemId: 2, to: "Ready For QA"), StateMove(itemId: 3, to: "Ready For QA")]
        let outcome = await StateMove.apply(moves, using: StubURLProtocol.client())

        XCTAssertEqual(StubURLProtocol.requests.map(\.path), ["/api/items/1/state", "/api/items/2/state", "/api/items/3/state"])
        XCTAssertEqual(outcome.moved, [1, 3])
        XCTAssertEqual(outcome.failures.map(\.move), [StateMove(itemId: 2, to: "Ready For QA")])
        XCTAssertEqual(outcome.failures.first?.error as? APIError, .conflict("The item changed in ADO."))
    }

    func testTokenExchangeWithoutABearerStillSendsTheIntentHeader() async throws {
        StubURLProtocol.respond { _ in (200, #"{"token":"tok","sessionId":"s1"}"#) }
        let response = try await StubURLProtocol.client(token: nil)
            .exchangeAppToken(AppTokenRequest(code: "c1", codeVerifier: "v1", deviceName: "iPhone"))

        XCTAssertEqual(response.token, "tok")
        let request = try XCTUnwrap(StubURLProtocol.requests.only)
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.path, "/api/auth/app/token")
        XCTAssertNil(request.headers["Authorization"])
        XCTAssertEqual(request.headers["X-Dispatch-Intent"], "1")
        let json = try body(request)
        XCTAssertEqual(json["code"] as? String, "c1")
        XCTAssertEqual(json["codeVerifier"] as? String, "v1")
        XCTAssertEqual(json["deviceName"] as? String, "iPhone")
    }

    func testRegistersTheAPNsTokenForTheRightEnvironment() async throws {
        StubURLProtocol.respond { _ in (200, #"{"ok":true,"enabled":false}"#) }
        let response = try await StubURLProtocol.client().registerAPNs(ApnsRegistration(deviceToken: "ab01", environment: .sandbox))

        XCTAssertFalse(response.enabled)
        let json = try body(try XCTUnwrap(StubURLProtocol.requests.only))
        XCTAssertEqual(json["deviceToken"] as? String, "ab01")
        XCTAssertEqual(json["environment"] as? String, "sandbox")
    }

    func testStatusCodesMapToErrors() async {
        let cases: [(Int, APIError)] = [
            (401, .unauthorized("Sign in first.")),
            (409, .conflict("Sign in first.")),
            (502, .upstream("Sign in first.")),
            (503, .stillLoading("Sign in first.")),
            (400, .server(status: 400, message: "Sign in first.")),
        ]
        for (status, expected) in cases {
            StubURLProtocol.respond { _ in (status, #"{"error":"Sign in first."}"#) }
            do {
                _ = try await StubURLProtocol.client().overview()
                XCTFail("\(status) should throw")
            } catch {
                XCTAssertEqual(error as? APIError, expected)
            }
        }
    }

    func testBrowseUsesSearchOrQuery() async throws {
        StubURLProtocol.respond { _ in (200, #"{"items":[],"truncated":false}"#) }
        let client = StubURLProtocol.client()
        _ = try await client.browse(query: "sprint-review", search: nil)
        _ = try await client.browse(query: "sprint", search: "logout fails")
        XCTAssertEqual(StubURLProtocol.requests.map(\.query), ["query=sprint-review", "search=logout%20fails"])
    }
}

/// Notification quick actions, against the stub server.
final class NotificationActionTests: XCTestCase {
    private let question = QuestionPush(
        itemId: 59455, threadId: "thread-9", requestId: "req-9", questionId: "q-9",
        options: [QuestionOption(label: "Keep the current checkout", value: "keep"), QuestionOption(label: "Switch now", value: "route")],
        recommended: 0, allowCustomAnswer: true
    )

    func testUseRecommendedAnswerSendsThatOptionsValue() async throws {
        StubURLProtocol.respond { _ in (200, #"{"ok":true}"#) }
        let outcome = await NotificationActionHandler(api: StubURLProtocol.client())
            .handle(action: "answer.recommended", userText: nil, data: .question(question))

        XCTAssertEqual(outcome, .done("Answer sent to 59455"))
        let request = try XCTUnwrap(StubURLProtocol.requests.only)
        XCTAssertEqual(request.path, "/api/threads/thread-9/answers")
        let json = try XCTUnwrap(request.json as? [String: Any])
        XCTAssertEqual(json["requestId"] as? String, "req-9")
        XCTAssertEqual((json["answers"] as? [String: String])?["q-9"], "keep")
    }

    func testRecommendedWithoutARecommendationSendsNothing() async {
        StubURLProtocol.respond { _ in (200, #"{"ok":true}"#) }
        let noRecommendation = QuestionPush(
            itemId: 1, threadId: "t", requestId: "r", questionId: "q", options: question.options, recommended: nil, allowCustomAnswer: false
        )
        let outcome = await NotificationActionHandler(api: StubURLProtocol.client())
            .handle(action: "answer.recommended", userText: nil, data: .question(noRecommendation))

        XCTAssertEqual(outcome, .skipped("1 has no recommended answer. Open BorgDock to answer."))
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
    }

    func testTypedAnswerSendsTheText() async throws {
        StubURLProtocol.respond { _ in (200, #"{"ok":true}"#) }
        let outcome = await NotificationActionHandler(api: StubURLProtocol.client())
            .handle(action: "answer.text", userText: "  Wait for 59458  ", data: .question(question))

        XCTAssertEqual(outcome, .done("Answer sent to 59455"))
        let json = try XCTUnwrap(StubURLProtocol.requests.only?.json as? [String: Any])
        XCTAssertEqual((json["answers"] as? [String: String])?["q-9"], "Wait for 59458")
    }

    func testTypedAnswerIsRefusedWhenTheQuestionOnlyTakesOptions() async {
        StubURLProtocol.respond { _ in (200, #"{"ok":true}"#) }
        let optionsOnly = QuestionPush(
            itemId: 2, threadId: "t", requestId: "r", questionId: "q", options: question.options, recommended: 0, allowCustomAnswer: false
        )
        let outcome = await NotificationActionHandler(api: StubURLProtocol.client())
            .handle(action: "answer.text", userText: "Something else", data: .question(optionsOnly))
        XCTAssertEqual(outcome, .skipped("2 needs one of the agent's options. Open BorgDock to answer."))
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
    }

    /// A move is a run now: the action opens the app on the run sheet, so the handler itself sends nothing.
    func testMoveInADOSendsNothingFromTheHandler() async {
        StubURLProtocol.respond { _ in (200, #"{"state":"Code Review"}"#) }
        let outcome = await NotificationActionHandler(api: StubURLProtocol.client())
            .handle(action: "move", userText: nil, data: .suggestion(itemId: 58568, to: "Code Review"))

        XCTAssertEqual(outcome, .skipped("Open BorgDock to act on 58568."))
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
    }

    func testAStaleQuestionReportsTheServersMessage() async {
        StubURLProtocol.respond { _ in (409, #"{"error":"The agent has moved on from that question. Reload to see the current one."}"#) }
        let outcome = await NotificationActionHandler(api: StubURLProtocol.client())
            .handle(action: "answer.recommended", userText: nil, data: .question(question))
        XCTAssertEqual(outcome, .failed("Couldn't answer 59455: The agent has moved on from that question. Reload to see the current one."))
    }

    func testAnActionThatDoesntFitThePayloadSendsNothing() async {
        StubURLProtocol.respond { _ in (200, #"{"ok":true}"#) }
        let outcome = await NotificationActionHandler(api: StubURLProtocol.client())
            .handle(action: "move", userText: nil, data: .waiting(itemId: 5))
        XCTAssertEqual(outcome, .skipped("Open BorgDock to act on 5."))
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)
    }

    func testCategoriesMatchTheContract() {
        let categories = Dictionary(uniqueKeysWithValues: NotificationCategories.all.map { ($0.identifier, $0) })
        XCTAssertEqual(categories["BORGDOCK_QUESTION"]?.actions.map(\.identifier), ["answer.recommended", "answer.text"])
        XCTAssertTrue(categories["BORGDOCK_QUESTION"]?.actions.last is UNTextInputNotificationAction)
        XCTAssertEqual(categories["BORGDOCK_QUESTION_RECOMMENDED"]?.actions.map(\.identifier), ["answer.recommended"])
        XCTAssertEqual(categories["BORGDOCK_QUESTION_TEXT"]?.actions.map(\.identifier), ["answer.text"])
        XCTAssertTrue(categories["BORGDOCK_QUESTION_TEXT"]?.actions.first is UNTextInputNotificationAction)
        XCTAssertEqual(categories["BORGDOCK_SUGGESTION"]?.actions.map(\.identifier), ["move"])
        XCTAssertTrue(categories["BORGDOCK_SUGGESTION"]?.actions.first?.options.contains(.foreground) == true)
        XCTAssertEqual(categories["BORGDOCK_PR"]?.actions.map(\.identifier), ["pr.review", "pr.open"])
        XCTAssertEqual(categories["BORGDOCK_CI"]?.actions.map(\.identifier), ["ci.checks", "ci.claude"])
        XCTAssertEqual(categories["BORGDOCK_DEFAULT"]?.actions.count, 0)
        let answers = NotificationCategories.all.flatMap(\.actions).filter { $0.identifier.hasPrefix("answer.") }
        XCTAssertEqual(answers.count, 4)
        XCTAssertTrue(answers.allSatisfy { $0.options.contains(.authenticationRequired) }, "no answer from a locked phone")
    }
}

private extension Array {
    var only: Element? { count == 1 ? first : nil }
}

final class ResolveURLTests: XCTestCase {
    func testServerPathsKeepTheServersPrefix() {
        let api = APIClient(baseURL: URL(string: "https://example.com/borgdock")!, token: nil)
        XCTAssertEqual(api.resolve("/api/items/1/attachments/a?name=x.png&sig=s")?.absoluteString, "https://example.com/borgdock/api/items/1/attachments/a?name=x.png&sig=s")
        XCTAssertEqual(api.resolve("https://cdn.example.com/a.png")?.absoluteString, "https://cdn.example.com/a.png")
    }
}
