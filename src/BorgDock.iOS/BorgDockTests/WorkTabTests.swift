import XCTest
@testable import BorgDock

/// The Work tab's scopes, briefing, rows, folded lanes and search (design/ios-flow, section 07).
final class WorkTabTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private func iso(hoursAgo: Double) -> String { now.addingTimeInterval(-hoursAgo * 3600).formatted(.iso8601) }

    private func item(_ id: Int, state: String = "Code Review", category: StateCategory = .resolved, assignedTo: String? = "Lena Brandt",
                      mine: Bool = false, sprint: String = "23") -> WorkItemSummary {
        WorkItemSummary(id: id, type: .pbi, typeName: "PBI", title: "Item \(id)", state: state, stateCategory: category, workflow: [],
                        sprint: sprint, dueDate: nil, priority: 2, tags: [], assignedTo: assignedTo, assignedToMe: mine, url: "u")
    }

    private func thread(_ status: ThreadStatus) -> ThreadSummary {
        ThreadSummary(id: "t-\(status.rawValue)", title: "Agent", worktree: "w", branch: "b", status: status, createdAt: iso(hoursAgo: 3),
                      lastActivityAt: iso(hoursAgo: 1), model: "m", questionRequestId: nil, questions: [], lastAgentMessage: nil, link: "l", appLink: nil)
    }

    private func entry(_ id: Int, state: String = "Code Review", label: String, tone: Tone, evidence: [Evidence] = [], latest: LatestMessage? = nil,
                       threads: [ThreadSummary] = [], queued: Bool = false) -> WorkEntry {
        let summary = item(id, state: state, mine: true)
        let walk = ItemWalk(verdict: Verdict(label: label, tone: tone), evidence: evidence, latest: latest)
        let overview = ItemOverview(item: summary, bay: .idle, waitingFor: nil, suggestion: nil, pullRequest: nil, threads: threads,
                                    queuedAt: queued ? iso(hoursAgo: 2) : nil, walk: walk)
        return WorkEntry(item: summary, overview: overview)
    }

    private func overview(_ entries: [WorkEntry]) -> Overview {
        Overview(generatedAt: iso(hoursAgo: 0), items: entries.compactMap(\.overview), unlinkedThreads: [], worktrees: [],
                 sources: OverviewSources(ado: SourceStatus(ok: true, at: nil, error: nil), t3: SourceStatus(ok: true, at: nil, error: nil)))
    }

    private func lane(_ entries: [WorkEntry], state: String = "Code Review") -> WorkLane {
        WorkLane(kind: .state(state), title: state, entries: entries)
    }

    // MARK: Scopes

    func testScopesSurviveBeingStored() {
        for scope in [WorkScope.mine, .sprint, .unassigned, .upNext, .query(id: "q-1", name: "Team bugs")] {
            XCTAssertEqual(WorkScope(stored: scope.stored), scope)
        }
        XCTAssertEqual(WorkScope(stored: "something old"), .mine)
        XCTAssertEqual(WorkScope.sprint.title(sprint: "23"), "Sprint 23")
        XCTAssertEqual(WorkScope.unassigned.title(sprint: "23"), "Unassigned")
        XCTAssertEqual(WorkScope.unassigned.longTitle(sprint: "23"), "Unassigned in Sprint 23")
        XCTAssertEqual(SprintName.display("Sprint 23"), "Sprint 23")
    }

    func testEachScopeTakesItsItemsAndKeepsVerdictsForYours() {
        let mine = entry(1, label: "CI red", tone: .bad, queued: true)
        let done = WorkEntry(item: item(2, state: "Done", category: .completed, mine: true), overview: nil)
        let sprint = Sprint(name: "23", path: "Shop\\Sprint 23", startDate: nil, finishDate: nil, items: [
            SprintItem(item: item(1, mine: true), stateChangedAt: nil, finishedAt: nil),
            SprintItem(item: item(3, assignedTo: nil), stateChangedAt: nil, finishedAt: nil),
            SprintItem(item: item(4, state: "Done", category: .completed), stateChangedAt: nil, finishedAt: nil),
        ], generatedAt: "")
        let value = overview([mine])
        XCTAssertEqual(WorkEntries.of(.mine, overview: value, sprint: nil, queryItems: nil)?.map(\.id), [1])
        XCTAssertEqual(WorkEntries.of(.upNext, overview: value, sprint: nil, queryItems: nil)?.map(\.id), [1])
        let inSprint = WorkEntries.of(.sprint, overview: value, sprint: sprint, queryItems: nil)
        XCTAssertEqual(inSprint?.map(\.id), [1, 3], "done items stay out")
        XCTAssertEqual(inSprint?.first?.verdict?.label, "CI red", "your item keeps its verdict")
        XCTAssertNil(inSprint?.last?.verdict)
        XCTAssertEqual(WorkEntries.of(.unassigned, overview: value, sprint: sprint, queryItems: nil)?.map(\.id), [3])
        XCTAssertNil(WorkEntries.of(.sprint, overview: value, sprint: nil, queryItems: nil), "nil until the sprint loads")
        XCTAssertEqual(WorkEntries.of(.query(id: "q", name: "Q"), overview: value, sprint: nil, queryItems: [done.item, item(5)])?.map(\.id), [5])
    }

    // MARK: Briefing and rows

    func testTheBriefingNamesWhatAsksSomethingInItsTone() {
        let entries = [
            entry(1, state: "Testing Failed", label: "Failed QA", tone: .bad),
            entry(2, state: "Testing Failed", label: "Failed QA", tone: .bad),
            entry(3, state: "Needs Human", label: "Answer", tone: .warn),
            entry(4, label: "Agent asks", tone: .bad, threads: [thread(.question)]),
            entry(5, state: "In Progress", label: "Agent on it", tone: .run, threads: [thread(.running)]),
        ]
        let parts = WorkBriefing.parts(entries)
        XCTAssertEqual(parts.map(\.text), ["2 failed QA", "2 questions", "1 running"])
        XCTAssertEqual(parts.map(\.tone), [.bad, .warn, nil])
        XCTAssertEqual(WorkBriefing.parts([entry(6, label: "In review", tone: .mute)]).map(\.text), ["Nothing needs you"])
    }

    func testRowsTakeTwoLinesOnlyWhenTheyAskSomething() {
        let message = LatestMessage(by: "Lena (QA)", text: "still € 0,01 off\non the export", at: iso(hoursAgo: 20), source: .comment)
        let failed = entry(1, state: "Testing Failed", label: "Failed QA", tone: .bad, evidence: [Evidence(label: "#412 merged", tone: .ok, kind: .merged)], latest: message)
        XCTAssertEqual(WorkRowLayout.of(failed, now: now), .twoLines(.message(by: "Lena (QA)", text: "still € 0,01 off on the export")),
                       "QA's message beats the merged PR")
        let ciRed = [Evidence(label: "#401 e2e red", tone: .bad, kind: .pr), Evidence(label: "1 of 2 reviews", tone: nil, kind: .other)]
        XCTAssertEqual(WorkRowLayout.of(entry(2, label: "CI red", tone: .bad, evidence: ciRed, latest: message), now: now), .twoLines(.evidence(ciRed)))
        let quiet = entry(3, label: "Waiting on review", tone: .mute, latest: LatestMessage(by: "You", text: "Ready", at: iso(hoursAgo: 50), source: .comment))
        XCTAssertEqual(WorkRowLayout.of(quiet, now: now), .oneLine(trailing: "waiting on review · 2 d"))
        let notYours = WorkEntry(item: item(4, assignedTo: "Mara Visser"), overview: nil)
        XCTAssertEqual(WorkRowLayout.of(notYours, now: now), .oneLine(trailing: "Mara"))
        XCTAssertEqual(WorkRowLayout.of(WorkEntry(item: item(5, assignedTo: nil), overview: nil), showsState: true, now: now), .oneLine(trailing: "Code Review · Unassigned"))
    }

    func testALongLaneShowsAFewQuietRowsAndCountsTheRest() {
        let asking = entry(1, label: "CI red", tone: .bad)
        let quiet = (2...8).map { entry($0, label: "Waiting on review", tone: .mute) }
        let rows = LaneRows.visible(lane([asking] + quiet), expanded: false)
        XCTAssertEqual(rows.shown.map(\.id), [1, 2, 3])
        XCTAssertEqual(LaneRows.moreLabel(rows.hidden), "5 more waiting on review")
        XCTAssertEqual(LaneRows.visible(lane([asking] + quiet), expanded: true).hidden, [])
        XCTAssertEqual(LaneRows.visible(lane(Array(quiet.prefix(3))), expanded: false).hidden, [], "three quiet rows all show")
        XCTAssertEqual(LaneRows.moreLabel([entry(9, label: "A", tone: .mute), entry(10, label: "B", tone: .mute)]), "2 more")
    }

    func testAFoldedLaneSumsUpWhatAsksAndWhatWaits() {
        let review = lane([
            entry(1, label: "CI red", tone: .bad), entry(2, label: "CI red", tone: .bad), entry(3, label: "Review", tone: .ok),
        ] + (4...9).map { entry($0, label: $0 == 5 ? "Waiting" : "Waiting on review", tone: .mute) })
        let summary = LaneRows.summary(review)
        XCTAssertEqual(summary.map(\.text), ["2 CI red", "7 waiting on review"])
        XCTAssertEqual(summary.map(\.tone), [.bad, nil])
        let running = lane((1...4).map { entry($0, state: "In Progress", label: "Agent on it", tone: .run) }, state: "In Progress")
        XCTAssertEqual(LaneRows.summary(running).map(\.text), ["4 agents running"])
        XCTAssertEqual(LaneRows.summary(lane([WorkEntry(item: item(1), overview: nil)])).map(\.text), ["1 item"])
    }

    // MARK: Folding

    func testLanesThatNeedYouOpenAndTheRestFold() {
        let failed = lane([entry(1, state: "Testing Failed", label: "Failed QA", tone: .bad)], state: "Testing Failed")
        let asking = lane([entry(2, state: "Needs Human", label: "Answer", tone: .warn)], state: "Needs Human")
        let ciRed = lane([entry(3, label: "CI red", tone: .bad)])
        let folds = LaneFolds(stored: "")
        XCTAssertTrue(folds.isOpen(failed))
        XCTAssertTrue(folds.isOpen(asking))
        XCTAssertFalse(folds.isOpen(ciRed), "CI red alone doesn't open Code Review")
    }

    func testAFoldHoldsUntilTheLaneStartsNeedingYou() {
        var folds = LaneFolds(stored: "")
        let quiet = lane([entry(1, label: "CI red", tone: .bad)])
        folds.set(quiet, open: true)
        let restored = LaneFolds(stored: folds.stored)
        XCTAssertTrue(restored.isOpen(quiet))
        let nowAsking = lane([entry(1, label: "CI red", tone: .bad), entry(2, label: "Agent asks", tone: .bad, threads: [thread(.question)])])
        var folded = LaneFolds(stored: "")
        folded.set(quiet, open: false)
        XCTAssertTrue(folded.isOpen(nowAsking), "a new question opens a lane you folded")
    }

    func testLaneColoursFollowTheirState() {
        XCTAssertEqual(LaneHue.of(state: "Testing Failed").hue, .red)
        XCTAssertEqual(LaneHue.of(state: "Needs Human").hue, .yellow)
        XCTAssertEqual(LaneHue.of(state: "Code Review").symbol, "eye")
        XCTAssertEqual(LaneHue.of(state: "Development In Progress").hue, .accent)
        XCTAssertEqual(LaneHue.of(state: "New").hue, .gray)
    }

    // MARK: Search and sprint

    func testSearchTakesANumberOrWords() {
        XCTAssertEqual(WorkSearch.query("AB#61021"), .number(61021))
        XCTAssertEqual(WorkSearch.query(" 61021 "), .number(61021))
        XCTAssertEqual(WorkSearch.query("invoice totals"), .words("invoice totals"))
        XCTAssertNil(WorkSearch.query("in"))
    }

    func testDaysLeftInTheSprint() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let finish = now.addingTimeInterval(6 * 86400).formatted(.iso8601)
        let sprint = Sprint(name: "23", path: "", startDate: nil, finishDate: finish, items: [], generatedAt: "")
        XCTAssertEqual(SprintName.left(sprint, now: now, calendar: calendar), "6 d left")
        let ended = Sprint(name: "22", path: "", startDate: nil, finishDate: now.addingTimeInterval(-86400).formatted(.iso8601), items: [], generatedAt: "")
        XCTAssertNil(SprintName.left(ended, now: now, calendar: calendar))
    }
}
