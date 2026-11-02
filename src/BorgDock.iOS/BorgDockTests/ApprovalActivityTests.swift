import XCTest
@testable import BorgDock

/// The approval's Live Activity: started with the hold, ended when the review posts, is undone, replaced or
/// refused; Undo from the island and its link take back that one approval.
@MainActor
final class ApprovalActivityTests: XCTestCase {
    private final class RecordingPresenter: ApprovalHoldPresenter {
        var events: [String] = []
        var held: [ApprovalHold.Pending] = []

        func held(_ pending: ApprovalHold.Pending) {
            held.append(pending)
            events.append("held \(pending.key.number)")
        }

        func ended(_ id: UUID, outcome: ApprovalHold.Outcome) {
            let number = held.first { $0.id == id }?.key.number ?? 0
            events.append("ended \(number) \(outcome)")
        }
    }

    private let key = PrKey(owner: "acme", repo: "shop", number: 3712)
    private let other = PrKey(owner: "acme", repo: "shop", number: 3715)

    func testTheActivityStartsWithTheHoldAndEndsWhenTheReviewPosts() async throws {
        let presenter = RecordingPresenter()
        let hold = ApprovalHold(presenter: presenter)
        var sent = 0
        hold.hold(key, label: "Approving #3712…", title: "Checkout: keep the basket", duration: .milliseconds(100), send: { sent += 1 }, onUndo: {}, onFailure: { _ in })

        XCTAssertEqual(presenter.events, ["held 3712"])
        let pending = try XCTUnwrap(presenter.held.first)
        XCTAssertEqual(pending.title, "Checkout: keep the basket")
        XCTAssertEqual(pending.postsAt.timeIntervalSince(pending.startedAt), 0.1, accuracy: 0.001)
        try await Task.sleep(for: .milliseconds(300))
        XCTAssertEqual(sent, 1)
        XCTAssertEqual(presenter.events, ["held 3712", "ended 3712 posted"])
    }

    func testTheActivityStaysUntilTheSendIsDone() async throws {
        let presenter = RecordingPresenter()
        let hold = ApprovalHold(presenter: presenter)
        hold.hold(key, label: "Approving", duration: .milliseconds(50), send: { try await Task.sleep(for: .milliseconds(200)) }, onUndo: {}, onFailure: { _ in })
        try await Task.sleep(for: .milliseconds(120))
        XCTAssertNil(hold.current, "the hold is over")
        XCTAssertEqual(presenter.events, ["held 3712"], "still posting")
        try await Task.sleep(for: .milliseconds(300))
        XCTAssertEqual(presenter.events, ["held 3712", "ended 3712 posted"])
    }

    func testUndoEndsTheActivity() async throws {
        let presenter = RecordingPresenter()
        let hold = ApprovalHold(presenter: presenter)
        var sent = 0
        hold.hold(key, label: "Approving", duration: .milliseconds(100), send: { sent += 1 }, onUndo: {}, onFailure: { _ in })
        XCTAssertTrue(hold.undo())
        try await Task.sleep(for: .milliseconds(250))
        XCTAssertEqual(sent, 0)
        XCTAssertEqual(presenter.events, ["held 3712", "ended 3712 undone"])
    }

    func testApprovingAgainEndsTheEarlierActivity() {
        let presenter = RecordingPresenter()
        let hold = ApprovalHold(presenter: presenter)
        hold.hold(key, label: "first", duration: .seconds(5), send: {}, onUndo: {}, onFailure: { _ in })
        hold.hold(key, label: "second", duration: .seconds(5), send: {}, onUndo: {}, onFailure: { _ in })
        XCTAssertEqual(presenter.events, ["held 3712", "ended 3712 replaced", "held 3712"])
        hold.undo()
    }

    func testARefusedApprovalEndsTheActivity() async throws {
        let presenter = RecordingPresenter()
        let hold = ApprovalHold(presenter: presenter)
        hold.hold(key, label: "Approving", duration: .milliseconds(50), send: { throw APIError.network("refused") }, onUndo: {}, onFailure: { _ in })
        try await Task.sleep(for: .milliseconds(200))
        XCTAssertEqual(presenter.events, ["held 3712", "ended 3712 failed"])
    }

    func testUndoFromTheIslandTakesBackThatApprovalOnly() async throws {
        let presenter = RecordingPresenter()
        let hold = ApprovalHold(presenter: presenter)
        var undone: [Int] = []
        hold.hold(key, label: "a", duration: .seconds(5), send: {}, onUndo: { undone.append(3712) }, onFailure: { _ in })
        hold.hold(other, label: "b", duration: .seconds(5), send: {}, onUndo: { undone.append(3715) }, onFailure: { _ in })
        let first = try XCTUnwrap(presenter.held.first)

        XCTAssertTrue(hold.undo(holdId: first.id.uuidString))
        XCTAssertEqual(undone, [3712])
        XCTAssertEqual(hold.pending.map(\.key), [other], "the newer approval still waits")
        XCTAssertFalse(hold.undo(holdId: first.id.uuidString), "already undone")
        XCTAssertFalse(hold.undo(holdId: "not-a-uuid"))
        hold.undo()
    }

    func testTheUndoIntentReachesTheApp() async throws {
        let hold = ApprovalHold()
        var undone = false
        hold.hold(key, label: "a", duration: .seconds(5), send: {}, onUndo: { undone = true }, onFailure: { _ in })
        let id = try XCTUnwrap(hold.current?.id.uuidString)
        ApprovalUndoer.handler = { hold.undo(holdId: $0) }
        defer { ApprovalUndoer.handler = nil }

        try await ApprovalUndoer.undo(id)
        XCTAssertTrue(undone)
        do {
            try await ApprovalUndoer.undo(id)
            XCTFail("a second undo has nothing to take back")
        } catch ApprovalUndoer.UndoError.alreadyPosted {}
    }

    // MARK: The compact island's link

    func testTheUndoLinkCarriesTheHoldId() throws {
        let url = ApprovalUndoLink.url(holdId: "6F1C2A4E-1B7C-4E5B-9E2F-0D6A7C3B9A10")
        XCTAssertEqual(url.absoluteString, "borgdock://approval/6F1C2A4E-1B7C-4E5B-9E2F-0D6A7C3B9A10/undo")
        XCTAssertEqual(ApprovalUndoLink.holdId(from: url), "6F1C2A4E-1B7C-4E5B-9E2F-0D6A7C3B9A10")
        XCTAssertNil(ApprovalUndoLink.holdId(from: try XCTUnwrap(URL(string: "borgdock://approval/abc"))))
        XCTAssertNil(ApprovalUndoLink.holdId(from: try XCTUnwrap(URL(string: "borgdock://pr/acme/shop/3712"))))
    }

    func testTheUndoLinkUndoesTheHeldApproval() throws {
        let model = AppModel(serverURL: StubURLProtocol.baseURL, token: "test-token", session: StubURLProtocol.session())
        var undone = false
        model.focus.hold.hold(key, label: "a", duration: .seconds(5), send: {}, onUndo: { undone = true }, onFailure: { _ in })
        let id = try XCTUnwrap(model.focus.hold.current?.id.uuidString)
        model.open(ApprovalUndoLink.url(holdId: id))
        XCTAssertTrue(undone)
        XCTAssertNil(model.focus.hold.current)
    }
}
