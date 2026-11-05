import XCTest
@testable import BorgDock

/// The Work tab's sort: states in your order, or grouped by status.
final class WorkSortTests: XCTestCase {
    private func entry(_ id: Int, state: String, tone: Tone) -> ItemOverview {
        let item = WorkItemSummary(id: id, type: .pbi, typeName: "Product Backlog Item", title: "Item \(id)", state: state, stateCategory: .inProgress,
                                   workflow: ["New", "Code Review"], sprint: "1", dueDate: nil, priority: 2, tags: [], assignedTo: nil,
                                   assignedToMe: true, url: "https://example.invalid/\(id)")
        let walk = ItemWalk(verdict: Verdict(label: "Verdict \(id)", tone: tone), evidence: [], latest: nil)
        return ItemOverview(item: item, bay: .idle, waitingFor: nil, suggestion: nil, pullRequest: nil, threads: [], queuedAt: nil, walk: walk)
    }

    /// Walk order: Testing Failed, Code Review, Development In Progress, New.
    private var overview: Overview {
        let items = [
            entry(1, state: "Testing Failed", tone: .bad),
            entry(2, state: "Code Review", tone: .ok),
            entry(3, state: "Code Review", tone: .bad),
            entry(4, state: "Development In Progress", tone: .run),
            entry(5, state: "New", tone: .mute),
        ]
        let walk = Walk(lanes: [
            .init(state: "Testing Failed", itemIds: [1], tone: .bad, summary: ""),
            .init(state: "Code Review", itemIds: [3, 2], tone: .bad, summary: ""),
            .init(state: "Development In Progress", itemIds: [4], tone: .run, summary: ""),
            .init(state: "Needs Human", itemIds: [], tone: nil, summary: ""),
            .init(state: "New", itemIds: [5], tone: .mute, summary: ""),
        ], briefing: .init(needYou: 2, outOfSync: 0, running: 1))
        return Overview(generatedAt: "2026-11-05T09:00:00Z", items: items, unlinkedThreads: [], worktrees: [],
                        sources: OverviewSources(ado: SourceStatus(ok: true, at: nil, error: nil), t3: SourceStatus(ok: true, at: nil, error: nil)), walk: walk)
    }

    func testWithoutAnOrderTheWalkOrderHolds() {
        XCTAssertEqual(WalkDisplay.lanes(overview, grouping: .state, order: []).map(\.title), ["Testing Failed", "Code Review", "Development In Progress", "New"])
    }

    func testYourStatesComeFirstAndTheRestKeepTheirWalkOrder() {
        let lanes = WalkDisplay.lanes(overview, grouping: .state, order: ["New", "Code Review", "Gone"])
        XCTAssertEqual(lanes.map(\.title), ["New", "Code Review", "Testing Failed", "Development In Progress"])
    }

    func testByStatusGroupsMostUrgentFirstAndKeepsYourStateOrderInside() {
        let lanes = WalkDisplay.lanes(overview, grouping: .status, order: ["Code Review"])
        XCTAssertEqual(lanes.map(\.title), ["Needs you", "Ready", "Running", "Quiet"])
        XCTAssertEqual(lanes[0].entries.map(\.item.id), [3, 1], "Code Review placed first, then Testing Failed")
        XCTAssertEqual(lanes.map(\.tone), [.bad, .ok, .run, .mute])
    }

    func testTheSavedOrderSurvivesAndTheSheetListsEveryState() {
        let saved = LaneOrder.decode(LaneOrder.encode(["New", "Code Review"]))
        XCTAssertEqual(saved, ["New", "Code Review"])
        XCTAssertEqual(LaneOrder.decode(""), [])
        XCTAssertEqual(LaneOrder.states(saved: saved, overview: overview),
                       ["New", "Code Review", "Testing Failed", "Development In Progress", "Needs Human"], "empty walk lanes can be placed too")
        XCTAssertEqual(LaneOrder.states(saved: saved, overview: nil), saved)
    }
}
