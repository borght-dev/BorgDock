import CryptoKit
import UserNotifications
import XCTest
@testable import BorgDock

/// The device signature: canonical string, headers and a signature the server can verify with the public key.
final class RequestSignerTests: XCTestCase {
    private let key = P256.Signing.PrivateKey()

    private func signer() -> DeviceRequestSigner {
        DeviceRequestSigner(
            key: .software(key),
            now: { Date(timeIntervalSince1970: 1_793_000_000.5) },
            nonce: { "0123456789abcdef0123456789abcdef" }
        )
    }

    func testCanonicalStringMatchesTheContract() {
        let body = Data(#"{"text":"Go"}"#.utf8)
        let canonical = DeviceRequestSigner.canonicalString(
            method: "post", path: "/api/threads/t1/messages?x=1", signedAt: "2026-10-31T10:00:00.000Z", nonce: "n0nce-n0nce-n0nce", body: body
        )
        let hash = SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(canonical, "POST\n/api/threads/t1/messages\n2026-10-31T10:00:00.000Z\nn0nce-n0nce-n0nce\n\(hash)")
    }

    func testAnEmptyBodyHashesTheEmptyString() {
        XCTAssertEqual(DeviceRequestSigner.sha256Hex(Data()), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    }

    func testHeadersCarryAVerifiableDERSignature() async throws {
        let body = Data(#"{"machineId":"mac-mini"}"#.utf8)
        let headers = try await signer().headers(method: "POST", path: "/api/agents/launch", body: body)

        let signedAt = try XCTUnwrap(headers["X-BorgDock-Signed-At"])
        XCTAssertEqual(signedAt, "2026-10-26T07:33:20.500Z")
        XCTAssertNotNil(ISODate.parse(signedAt))
        XCTAssertEqual(headers["X-BorgDock-Nonce"], "0123456789abcdef0123456789abcdef")

        let der = try XCTUnwrap(headers["X-BorgDock-Signature"].flatMap { Data(base64Encoded: $0) })
        let signature = try P256.Signing.ECDSASignature(derRepresentation: der)
        let canonical = DeviceRequestSigner.canonicalString(method: "POST", path: "/api/agents/launch", signedAt: signedAt, nonce: "0123456789abcdef0123456789abcdef", body: body)
        XCTAssertTrue(key.publicKey.isValidSignature(signature, for: Data(canonical.utf8)))
        XCTAssertFalse(key.publicKey.isValidSignature(signature, for: Data((canonical + "x").utf8)))
    }

    func testRandomNoncesAreLongAndUnique() {
        let a = DeviceRequestSigner.randomNonce()
        XCTAssertEqual(a.count, 32)
        XCTAssertNotEqual(a, DeviceRequestSigner.randomNonce())
    }

    func testThePublicKeyIsTheX963Representation() {
        let device = DeviceKey.software(key)
        XCTAssertEqual(device.publicKeyBytes.count, 65)
        XCTAssertEqual(device.publicKeyBytes.first, 0x04)
        XCTAssertEqual(device.publicKeyBase64, key.publicKey.x963Representation.base64EncodedString())
    }

    func testSignedRoutesSendTheSignatureAndUnsignedOnesDont() async throws {
        StubURLProtocol.respond { request in (200, request.path.hasSuffix("/read") ? #"{"unread":0}"# : #"{"ok":true}"#) }
        let api = APIClient(baseURL: StubURLProtocol.baseURL, token: "t", session: StubURLProtocol.session(), signer: signer())
        _ = try await api.approvePlan(threadId: "thread 1")
        _ = try await api.markRead(.all)
        let requests = StubURLProtocol.requests
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests[0].path, "/api/threads/thread%201/approve-plan")
        XCTAssertNotNil(requests[0].headers["X-BorgDock-Signature"])
        XCTAssertNil(requests[1].headers["X-BorgDock-Signature"])
    }

    func testASignedCallWithoutAKeyFailsBeforeReachingTheServer() async {
        StubURLProtocol.respond { _ in (200, #"{"ok":true}"#) }
        let api = APIClient(baseURL: StubURLProtocol.baseURL, token: "t", session: StubURLProtocol.session())
        do {
            _ = try await api.sendMessage(threadId: "t", text: "hi")
            XCTFail("expected an error")
        } catch {
            XCTAssertTrue(StubURLProtocol.requests.isEmpty)
        }
    }
}

/// Pairing links and the HMAC proof that this device saw the machine's QR code.
final class PairingTests: XCTestCase {
    func testParsesAPairingLink() throws {
        let secret = Data((0..<32).map { UInt8($0) })
        let encoded = secret.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let url = try XCTUnwrap(URL(string: "borgdock://pair?server=https://host.example/borgdock&code=KQ7-M2D&secret=\(encoded)"))
        let link = try XCTUnwrap(PairingLink(url: url))
        XCTAssertEqual(link.code, "KQ7-M2D")
        XCTAssertEqual(link.secret, secret)
        XCTAssertEqual(link.server?.absoluteString, "https://host.example/borgdock")
    }

    func testRejectsLinksWithoutCodeOrSecret() {
        XCTAssertNil(PairingLink(url: URL(string: "borgdock://pair?code=KQ7-M2D")!))
        XCTAssertNil(PairingLink(url: URL(string: "borgdock://pair?secret=AAAA")!))
        XCTAssertNil(PairingLink(url: URL(string: "borgdock://item/1")!))
    }

    func testProofIsHMACOfThePublicKeyWithTheSecret() {
        let secret = Data(repeating: 7, count: 32)
        let publicKey = Data(repeating: 4, count: 65)
        let proof = PairingLink(server: nil, code: "KQ7-M2D", secret: secret).proof(devicePublicKey: publicKey)
        let expected = Data(HMAC<SHA256>.authenticationCode(for: publicKey, using: SymmetricKey(data: secret))).base64EncodedString()
        XCTAssertEqual(proof, PairingProof(code: "KQ7-M2D", proof: expected))
    }

    func testATypedCodeSplitsIntoTheServerCodeAndTheMachinesSecret() throws {
        let link = try XCTUnwrap(PairingLink(typedCode: " abcd-efgh jkmn-pqrs "))
        XCTAssertEqual(link.code, "ABCD-EFGH")
        XCTAssertEqual(link.typedSecret, "JKMNPQRS")
        XCTAssertNil(link.secret)
        // Same vector as server/test/borgdock-typed-pairing.test.ts.
        let publicKey = Data([4] + Array(repeating: 1, count: 64))
        XCTAssertEqual(link.proof(devicePublicKey: publicKey).proof, "rQrqu/u1lOdifKRJYl18TJgHfxmIGEjzcJrQlb77UwQ=")
        XCTAssertEqual(PairingLink(typedCode: "abcd efgh jkmn pqr0")?.typedSecret, "JKMNPQR0")
        XCTAssertEqual(PairingLink(typedCode: "ABCD-EFGH-JKMN-PQRO")?.typedSecret, "JKMNPQR0")
        XCTAssertNil(PairingLink(typedCode: "ABCD-EFGH"))
    }

    func testPairingSendsCodeProofAndKeySigned() async throws {
        StubURLProtocol.respond { _ in (200, #"{"id":"laptop","label":"laptop","kind":"connector","online":true,"lastSeenAt":null,"threads":0,"version":null}"#) }
        let key = P256.Signing.PrivateKey()
        let api = APIClient(baseURL: StubURLProtocol.baseURL, token: "t", session: StubURLProtocol.session(), signer: DeviceRequestSigner(key: .software(key)))
        let machine = try await api.pairMachine(PairMachineRequest(code: "KQ7-M2D", proof: "cHJvb2Y=", devicePublicKey: "a2V5"))
        XCTAssertEqual(machine.label, "laptop")
        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.path, "/api/machines/pair")
        XCTAssertNotNil(request.headers["X-BorgDock-Signature"])
        XCTAssertEqual(request.json as? [String: String], ["code": "KQ7-M2D", "proof": "cHJvb2Y=", "devicePublicKey": "a2V5"])
    }
}

/// POST /api/auth/clerk: the claim-required answer, and the retry with a claim.
final class ClaimFlowTests: XCTestCase {
    func testAnUnclaimedServerAnswersClaimRequired() async {
        StubURLProtocol.respond { _ in (403, #"{"error":"Nobody owns this server yet.","claimRequired":true}"#) }
        do {
            _ = try await StubURLProtocol.client(token: nil).exchangeClerkToken(
                ClerkExchangeRequest(clerkToken: "jwt", deviceName: "iPhone", devicePublicKey: "a2V5")
            )
            XCTFail("expected claimRequired")
        } catch let error as APIError {
            XCTAssertTrue(error.isClaimRequired)
            XCTAssertEqual(error.message, "Nobody owns this server yet.")
        } catch {
            XCTFail("unexpected \(error)")
        }
        let json = StubURLProtocol.requests.first?.json as? [String: Any]
        XCTAssertNil(json?["claim"], "no claim unless the user scanned a code")
    }

    func testTheClaimRetrySendsThePairingProof() async throws {
        StubURLProtocol.respond { _ in (200, #"{"token":"tok","sessionId":"s1","owner":{"clerkUserId":"u","name":"Koen","email":null,"imageUrl":null}}"#) }
        let proof = PairingLink(server: nil, code: "KQ7-M2D", secret: Data(repeating: 1, count: 32)).proof(devicePublicKey: Data(repeating: 4, count: 65))
        let response = try await StubURLProtocol.client(token: nil).exchangeClerkToken(
            ClerkExchangeRequest(clerkToken: "jwt", deviceName: "iPhone", devicePublicKey: "a2V5", claim: proof)
        )
        XCTAssertEqual(response.owner.name, "Koen")
        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertNil(request.headers["Authorization"])
        let claim = (request.json as? [String: Any])?["claim"] as? [String: String]
        XCTAssertEqual(claim, ["code": "KQ7-M2D", "proof": proof.proof])
    }

    func testOnlyARejectedAccountGivesClerkAnotherChoice() {
        XCTAssertTrue(APIError(status: 403, body: Data(#"{"error":"This BorgDock belongs to someone else."}"#.utf8)).rejectsAccount)
        XCTAssertTrue(APIError(status: 401, body: Data(#"{"error":"Expired."}"#.utf8)).rejectsAccount)
        XCTAssertFalse(APIError(status: 403, body: Data(#"{"error":"Nobody owns this server yet.","claimRequired":true}"#.utf8)).rejectsAccount)
        XCTAssertFalse(APIError(status: 429, body: Data(#"{"error":"Too many attempts."}"#.utf8)).rejectsAccount)
        XCTAssertFalse(APIError.network("offline").rejectsAccount)
    }

    func testAMissingSignatureIsItsOwnError() {
        let error = APIError(status: 403, body: Data(#"{"error":"Sign this request.","signatureRequired":true}"#.utf8))
        XCTAssertEqual(error, .signatureRequired("Sign this request."))
        XCTAssertEqual(APIError(status: 403, body: Data(#"{"error":"Not yours."}"#.utf8)), .server(status: 403, message: "Not yours."))
    }
}

/// What the states walk shows, with and without the server's walk fields.
final class WalkDisplayTests: XCTestCase {
    private func item(_ id: Int, state: String, category: StateCategory = .inProgress) -> WorkItemSummary {
        WorkItemSummary(id: id, type: .bug, typeName: "Bug", title: "Item \(id)", state: state, stateCategory: category, workflow: ["New", "Code Review"],
                        sprint: "1", dueDate: nil, priority: 2, tags: [], assignedTo: nil, assignedToMe: true, url: "https://example.invalid/\(id)")
    }

    private func entry(_ id: Int, state: String, bay: Bay, walk: ItemWalk? = nil) -> ItemOverview {
        ItemOverview(item: item(id, state: state), bay: bay, waitingFor: nil, suggestion: nil, pullRequest: nil, threads: [], queuedAt: nil, walk: walk)
    }

    private func overview(_ items: [ItemOverview], walk: Walk? = nil) -> Overview {
        Overview(generatedAt: "2026-10-31T09:00:00Z", items: items, unlinkedThreads: [], worktrees: [],
                 sources: OverviewSources(ado: SourceStatus(ok: true, at: nil, error: nil), t3: SourceStatus(ok: true, at: nil, error: nil)), walk: walk)
    }

    func testLanesFollowTheWalkOrderAndSkipUnknownItems() {
        let walk = Walk(lanes: [
            .init(state: "Code Review", itemIds: [2, 99], tone: .bad, summary: ""),
            .init(state: "Testing Failed", itemIds: [42], tone: .warn, summary: ""),
            .init(state: "New", itemIds: [1], tone: nil, summary: ""),
        ], briefing: .init(needYou: 1, outOfSync: 2, running: 3))
        let lanes = WalkDisplay.lanes(overview([entry(1, state: "New", bay: .idle), entry(2, state: "Code Review", bay: .waiting)], walk: walk))
        XCTAssertEqual(lanes.map(\.title), ["Code Review", "New"])
        XCTAssertEqual(lanes[0].entries.map(\.item.id), [2])
    }

    func testWithoutAWalkLanesComeFromStatesAndVerdictsFromBays() {
        let lanes = WalkDisplay.lanes(overview([
            entry(1, state: "Code Review", bay: .working),
            entry(2, state: "Code Review", bay: .waiting),
            entry(3, state: "New", bay: .idle),
        ]))
        XCTAssertEqual(lanes.map(\.title), ["Code Review", "New"])
        XCTAssertEqual(lanes[0].entries.map(\.item.id), [2, 1], "what needs you first")
        XCTAssertEqual(WalkDisplay.verdict(for: lanes[0].entries[1]), Verdict(label: "Agent on it", tone: .run))
        XCTAssertEqual(lanes[0].tone, .bad)
    }

    func testTheServersVerdictWins() {
        let walk = ItemWalk(verdict: Verdict(label: "CI red", tone: .bad), evidence: [Evidence(label: "#3712 open", tone: nil, kind: .pr)],
                            latest: LatestMessage(by: "Vera · qa-check", text: "e2e fails\n\non the **timeout** path", at: "2026-10-31T09:00:00Z", source: .comment))
        let value = entry(1, state: "Code Review", bay: .idle, walk: walk)
        XCTAssertEqual(WalkDisplay.verdict(for: value).label, "CI red")
        XCTAssertEqual(WalkDisplay.evidence(for: value).map(\.label), ["#3712 open"])
        XCTAssertEqual(WalkDisplay.latest(for: value).map { WalkDisplay.oneLine($0.text) }, "e2e fails on the timeout path")
    }

    func testBriefingLine() {
        XCTAssertEqual(WalkDisplay.briefingParts(.init(needYou: 2, outOfSync: 3, running: 4)).map(\.text), ["2 need you", "3 out of sync", "4 agents running"])
        XCTAssertEqual(WalkDisplay.briefingParts(.init(needYou: 1, outOfSync: 0, running: 1)).map(\.text), ["1 needs you", "0 out of sync", "1 agent running"])
        XCTAssertEqual(WalkDisplay.briefingParts(.init(needYou: 2, outOfSync: 0, running: 0)).first?.tone, .bad)
        XCTAssertEqual(WalkDisplay.briefingParts(.init(needYou: 0, outOfSync: 0, running: 0)).map(\.text), ["Nothing needs you"])
    }

    func testFixOutOfSyncTakesTheDriftedItems() {
        let value = overview([entry(1, state: "New", bay: .drift), entry(2, state: "New", bay: .idle), entry(3, state: "Code Review", bay: .drift)])
        XCTAssertEqual(WalkDisplay.outOfSyncItemIds(value), [1, 3])
        XCTAssertEqual(WalkDisplay.briefing(value).outOfSync, 2)
    }

    func testOverviewDecodesTheWalkFields() throws {
        let json = #"""
        {"generatedAt":"x","items":[{"item":{"id":1,"type":"Bug","typeName":"Bug","title":"T","state":"New","stateCategory":"Proposed","workflow":[],"sprint":"","dueDate":null,"priority":null,"tags":[],"assignedTo":null,"url":"u"},
          "bay":"idle","waitingFor":null,"suggestion":null,"pullRequest":null,"threads":[],"queuedAt":null,
          "walk":{"verdict":{"label":"Not started","tone":"mute"},"evidence":[{"label":"P1","tone":"warn","kind":"priority"}],"latest":null}}],
         "unlinkedThreads":[],"worktrees":[],"sources":{"ado":{"ok":true,"at":null,"error":null},"t3":{"ok":true,"at":null,"error":null}},
         "walk":{"lanes":[{"state":"New","itemIds":[1],"tone":null,"summary":""}],"briefing":{"needYou":0,"outOfSync":0,"running":0}}}
        """#
        let decoded = try JSONDecoder().decode(Overview.self, from: Data(json.utf8))
        XCTAssertEqual(decoded.walk?.lanes.first?.itemIds, [1])
        XCTAssertEqual(decoded.items.first?.walk?.evidence.first?.kind, .priority)
    }
}

/// Activity read state, targets and requests.
final class ActivityTests: XCTestCase {
    private func entry(_ id: String, _ category: ActivityCategory, read: Bool = false) -> ActivityEntry {
        ActivityEntry(id: id, category: category, title: id, detail: "", at: "2026-10-31T09:00:00Z", read: read, tone: .mute, target: .none)
    }

    func testMarkingIdsReadUpdatesTheCounts() {
        let state = ActivityReadState(entries: [entry("a", .ci), entry("b", .review), entry("c", .ci, read: true)], unread: 2, unreadByCategory: ["ci": 1, "review": 1])
        let next = state.marking(.ids(["a", "c"]))
        XCTAssertEqual(next.entries.map(\.read), [true, false, true])
        XCTAssertEqual(next.unread, 1)
        XCTAssertEqual(next.unreadByCategory, ["ci": 0, "review": 1])
    }

    func testMarkAllReadClearsEveryCountEvenForEntriesNotLoaded() {
        let state = ActivityReadState(entries: [entry("a", .ci)], unread: 9, unreadByCategory: ["ci": 4, "merge": 5])
        let next = state.marking(.all)
        XCTAssertEqual(next.unread, 0)
        XCTAssertEqual(next.unreadByCategory, ["ci": 0, "merge": 0])
        XCTAssertTrue(next.entries.allSatisfy(\.read))
    }

    func testMarkReadRequestsEncodeAsTheContractSays() throws {
        let ids = try JSONSerialization.jsonObject(with: JSONEncoder().encode(MarkReadRequest.ids(["a"]))) as? [String: [String]]
        XCTAssertEqual(ids, ["ids": ["a"]])
        let all = try JSONSerialization.jsonObject(with: JSONEncoder().encode(MarkReadRequest.all)) as? [String: Bool]
        XCTAssertEqual(all, ["all": true])
    }

    func testTargetsDecodeAndRoute() throws {
        let json = #"[{"kind":"pr","key":"acme/shop#12"},{"kind":"item","id":5},{"kind":"thread","id":"t","itemId":null},{"kind":"ci","groupId":"g"},{"kind":"none"}]"#
        let targets = try JSONDecoder().decode([ActivityTarget].self, from: Data(json.utf8))
        XCTAssertEqual(targets.map(\.route), [
            .pullRequest(PrKey(owner: "acme", repo: "shop", number: 12)),
            .workItem(ItemRoute(id: 5)),
            .thread("t"),
            .ciGroup("g"),
            nil,
        ])
    }

    func testReadPushesCarryTheirIds() {
        let push = BorgDockPush(userInfo: ["dispatch": ["kind": "read", "ids": ["a", "b"]]])
        XCTAssertEqual(push, .read(ids: ["a", "b"]))
        XCTAssertEqual(BorgDockPush(userInfo: ["dispatch": ["kind": "refresh"]]), .refresh)
        XCTAssertNil(BorgDockPush(userInfo: ["dispatch": ["kind": "question", "itemId": 1]]))
    }

    func testEntriesGroupByDay() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "UTC"))
        let now = try XCTUnwrap(ISODate.parse("2026-10-31T21:10:00Z"))
        let entries = ["2026-10-31T21:02:00Z", "2026-10-31T09:00:00Z", "2026-10-30T20:00:00Z"].enumerated().map { index, at in
            ActivityEntry(id: String(index), category: .ci, title: "", detail: "", at: at, read: false, tone: .bad, target: .none)
        }
        XCTAssertEqual(ActivityDay.group(entries, now: now, calendar: calendar).map(\.title), ["Tonight", "Today", "Yesterday"])
    }

    func testThePageAsksForTheCategoryAndCursor() async throws {
        StubURLProtocol.respond { _ in (200, #"{"entries":[],"unread":0,"unreadByCategory":{},"away":null}"#) }
        _ = try await StubURLProtocol.client().activity(category: .ci, before: "2026-10-31T09:00:00Z", limit: 20)
        let query = try XCTUnwrap(StubURLProtocol.requests.first?.query)
        XCTAssertTrue(query.contains("category=ci"))
        XCTAssertTrue(query.contains("limit=20"))
        XCTAssertTrue(query.contains("before=2026-10-31T09:00:00Z"))
    }
}

/// The launch sheet's defaults and request.
@MainActor
final class LaunchTests: XCTestCase {
    private let targets = LaunchTargets(
        machines: [
            Machine(id: "off", label: "build-vm", kind: .ssh, online: false, lastSeenAt: nil, threads: 0, version: nil),
            Machine(id: "mac", label: "mac-mini", kind: .local, online: true, lastSeenAt: nil, threads: 3, version: nil),
            Machine(id: "ws", label: "workstation", kind: .connector, online: true, lastSeenAt: nil, threads: 1, version: nil),
        ],
        projects: [
            LaunchProject(id: "p-api", machineId: "mac", title: "api", repository: "acme/api", defaultBranch: "main"),
            LaunchProject(id: "w-shop", machineId: "ws", title: "shop", repository: "acme/shop", defaultBranch: "master"),
        ],
        threads: [LaunchThread(id: "t1", machineId: "ws", projectId: "w-shop", title: "T", place: "basket", status: .yourTurn)],
        models: [],
        defaultModel: nil
    )

    func testPicksTheFirstOnlineMachine() {
        XCTAssertEqual(LaunchDefaults.pick(targets: targets, context: LaunchContext()),
                       .init(machineId: "mac", projectId: "p-api", workspace: .newWorktree(branch: nil)))
    }

    func testAPullRequestPicksItsRepository() {
        XCTAssertEqual(LaunchDefaults.pick(targets: targets, context: LaunchContext(prKey: "acme/shop#12")).projectId, "w-shop")
    }

    func testAThreadIsContinued() {
        XCTAssertEqual(LaunchDefaults.pick(targets: targets, context: LaunchContext(threadId: "t1")),
                       .init(machineId: "ws", projectId: "w-shop", workspace: .thread(id: "t1", mode: .continue)))
    }

    func testOnlyAnItemThatHasntStartedMoves() {
        let new = WorkItemSummary(id: 1, type: .bug, typeName: "Bug", title: "T", state: "New", stateCategory: .proposed,
                                  workflow: ["New", "Development In Progress", "Code Review"], sprint: "", dueDate: nil, priority: nil, tags: [],
                                  assignedTo: nil, assignedToMe: true, url: "")
        XCTAssertEqual(LaunchDefaults.moveTarget(for: new), "Development In Progress")
        XCTAssertNil(LaunchDefaults.moveTarget(for: nil))
    }

    func testTheRequestSendsExplicitNulls() throws {
        let request = LaunchRequest(machineId: "mac", projectId: "p", workspace: .worktree(baseBranch: nil), model: nil, effort: nil, planFirst: true,
                                    message: "Go", title: "Go", itemId: nil, moveAdoTo: nil, prKey: nil, ciGroupId: nil)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
        XCTAssertEqual(Set(json.keys), ["machineId", "projectId", "workspace", "model", "effort", "planFirst", "message", "title", "itemId", "moveAdoTo", "prKey", "ciGroupId"])
        XCTAssertTrue(json["itemId"] is NSNull)
        XCTAssertEqual((json["workspace"] as? [String: Any])?["kind"] as? String, "worktree")
        XCTAssertTrue((json["workspace"] as? [String: Any])?["baseBranch"] is NSNull)
        let thread = try JSONSerialization.jsonObject(with: JSONEncoder().encode(LaunchWorkspace.thread(threadId: "t", mode: .beside))) as? [String: String]
        XCTAssertEqual(thread, ["kind": "thread", "threadId": "t", "mode": "beside"])
    }
}

/// Notification categories, and option actions from the content extension.
final class BorgDockNotificationTests: XCTestCase {
    func testOptionActionsAnswerWithThatOption() async throws {
        StubURLProtocol.respond { _ in (200, #"{"ok":true}"#) }
        let push = QuestionPush(itemId: 1, threadId: "t", requestId: "r", questionId: "q",
                                options: [QuestionOption(label: "A", value: "a"), QuestionOption(label: "B", value: "b")], recommended: 0, allowCustomAnswer: false)
        let outcome = await NotificationActionHandler(api: StubURLProtocol.client()).handle(action: "answer.option.1", userText: nil, data: .question(push))
        XCTAssertEqual(outcome, .done("Answer sent to 1"))
        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual((request.json as? [String: Any]).flatMap { $0["answers"] as? [String: String] }, ["q": "b"])
        XCTAssertNotNil(request.headers["X-BorgDock-Signature"], "answers are signed")
        XCTAssertEqual(NotificationCategories.Action.optionIndex("answer.option.12"), 12)
        XCTAssertNil(NotificationCategories.Action.optionIndex("answer.text"))
    }
}
