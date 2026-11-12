import XCTest
@testable import BorgDock

/// A work item's page: which section leads, the workflow track, Activity and the details grid (design/ios-flow, section 08).
final class ItemPageTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private func iso(hoursAgo: Double) -> String { now.addingTimeInterval(-hoursAgo * 3600).formatted(.iso8601) }
    private let workflow = ["New", "Development In Progress", "Plan Review", "Code Review", "Testing", "Testing Failed", "Needs Human", "Done"]

    private func item(state: String, tags: [String] = [], sprint: String = "23") -> WorkItemSummary {
        WorkItemSummary(id: 61021, type: .bug, typeName: "Bug", title: "Totals off by a cent", state: state, stateCategory: .inProgress,
                        workflow: workflow, sprint: sprint, dueDate: nil, priority: 2, tags: tags, assignedTo: "Koen van der Borght",
                        assignedToMe: true, url: "u")
    }

    private func event(_ hoursAgo: Double, _ kind: ItemHistoryEvent.Kind, from: String? = nil, to: String? = nil, by: String = "Lena (QA)", pr: Int? = nil) -> ItemHistoryEvent {
        ItemHistoryEvent(at: iso(hoursAgo: hoursAgo), by: by, kind: kind, from: from, to: to, pullRequest: pr)
    }

    // MARK: Section order

    func testWhatDecidesTheNextStepLeads() {
        let all = Set(ItemSection.allCases)
        XCTAssertEqual(ItemLayout.lead(state: "Testing Failed", agentAsks: false, available: all), .qaNotes)
        XCTAssertEqual(ItemLayout.lead(state: "Code Review", agentAsks: false, available: all), .pullRequests)
        XCTAssertEqual(ItemLayout.lead(state: "Code Review", agentAsks: true, available: all), .agents)
        XCTAssertEqual(ItemLayout.lead(state: "Needs Human", agentAsks: false, available: all), .agents)
        XCTAssertEqual(ItemLayout.lead(state: "New", agentAsks: false, available: all), .description)
        XCTAssertEqual(ItemLayout.lead(state: "New", agentAsks: false, available: [.reproSteps, .details]), .reproSteps)
        XCTAssertEqual(ItemLayout.lead(state: "Testing Failed", agentAsks: false, available: [.reproSteps, .details]), .reproSteps, "no QA notes: the text leads")
    }

    func testTheRestFollowsInAFixedOrder() {
        let available: Set<ItemSection> = [.qaNotes, .pullRequests, .agents, .reproSteps, .acceptance, .details, .developerNotes, .activity]
        XCTAssertEqual(ItemLayout.sections(state: "Testing Failed", agentAsks: false, available: available),
                       [.qaNotes, .pullRequests, .agents, .reproSteps, .acceptance, .details, .developerNotes, .activity])
        XCTAssertEqual(ItemLayout.sections(state: "Code Review", agentAsks: false, available: available).prefix(3), [.pullRequests, .qaNotes, .agents])
    }

    func testJumpChipsNameTheTextAsDescription() {
        let jumps = ItemLayout.jumps([.qaNotes, .pullRequests, .agents, .reproSteps, .acceptance, .details, .developerNotes, .activity], activityCount: 6)
        XCTAssertEqual(jumps.map(\.title), ["QA notes", "Description", "Acceptance", "Details", "Activity"])
        XCTAssertEqual(jumps.map(\.id), ["qaNotes", "reproSteps", "acceptance", "details", "activity"])
        XCTAssertEqual(jumps.last?.count, 6)
    }

    // MARK: Workflow track

    func testAFailedItemSitsWhereItFailedWithItsReturnsCounted() {
        let history = [
            event(24, .state, from: "Testing", to: "Testing Failed"),
            event(72, .state, from: "Code Review", to: "Testing", by: "Koen van der Borght"),
            event(150, .state, from: "Testing", to: "Testing Failed"),
        ]
        let track = WorkflowTrack.of(item(state: "Testing Failed"), history: history, now: now)
        XCTAssertEqual(track.steps.map(\.label), ["New", "Dev", "Plan", "Review", "Testing", "Done"])
        XCTAssertEqual(track.steps.map(\.mark), [.done, .done, .done, .done, .failed, .todo])
        XCTAssertEqual(track.note, "Back from QA twice · in Testing Failed for 1 day")
    }

    func testAnItemOnItsPathIsCurrentAndWithoutHistoryHasNoNote() {
        let track = WorkflowTrack.of(item(state: "Code Review"), history: [], now: now)
        XCTAssertEqual(track.steps.map(\.mark), [.done, .done, .done, .current, .todo, .todo])
        XCTAssertNil(track.note)
        XCTAssertEqual(WorkflowTrack.of(item(state: "Code Review"), history: [event(5, .state, from: "Dev", to: "Code Review")], now: now).note,
                       "In Code Review for 5 hours")
        XCTAssertEqual(WorkflowTrack.times(3), "3 times")
    }

    func testAFailedStateWithoutHistoryFindsItsStepByName() {
        let track = WorkflowTrack.of(item(state: "Testing Failed"), history: [], now: now)
        XCTAssertEqual(track.steps[4].mark, .failed)
    }

    // MARK: Activity

    func testActivityJoinsCommentsAndChangesNewestFirst() {
        let comments = [
            ItemComment(id: 1, by: "Koen van der Borght", at: iso(hoursAgo: 96), text: "Fix is in #412"),
            ItemComment(id: 2, by: "Lena (QA)", at: iso(hoursAgo: 23), text: "Basket is fine now"),
        ]
        let history = [event(24, .state, from: "Testing", to: "Testing Failed"), event(97, .pullRequest, by: "Priya", pr: 412)]
        let all = ItemActivity.entries(comments: comments, history: history, filter: .all, me: "Koen van der Borght")
        XCTAssertEqual(all.map(\.at), [iso(hoursAgo: 23), iso(hoursAgo: 24), iso(hoursAgo: 96), iso(hoursAgo: 97)])
        XCTAssertEqual(ItemActivity.entries(comments: comments, history: history, filter: .comments, me: nil).count, 2)
        XCTAssertEqual(ItemActivity.entries(comments: comments, history: history, filter: .changes, me: nil).count, 2)
        if case .comment(_, let author) = all[2] {
            XCTAssertEqual(author.name, "You")
            XCTAssertTrue(author.isYou)
        } else {
            XCTFail("the oldest comment is yours")
        }
    }

    func testChangesReadAsSentences() {
        let me = "Koen van der Borght"
        XCTAssertEqual(ItemActivity.title(event(1, .state, from: "Testing", to: "Testing Failed"), me: me), "Testing → Testing Failed")
        XCTAssertEqual(ItemActivity.actor(event(1, .state, from: "Testing", to: "Testing Failed"), me: me), "Lena")
        XCTAssertEqual(ItemActivity.actor(event(1, .state, from: "Code Review", to: "Testing", by: me), me: me), "you")
        XCTAssertEqual(ItemActivity.title(event(1, .pullRequest, pr: 412), me: me), "PR #412 linked")
        XCTAssertEqual(ItemActivity.title(event(1, .assigned, to: me), me: me), "Assigned to you")
        XCTAssertEqual(ItemActivity.title(event(1, .assigned, to: "Mara Visser"), me: me), "Assigned to Mara Visser")
        XCTAssertEqual(ItemActivity.title(event(1, .created), me: me), "Created")
        XCTAssertEqual(ItemActivity.hue(event(1, .state, to: "Testing Failed")), .red)
        XCTAssertEqual(ItemActivity.hue(event(1, .pullRequest)), .green)
    }

    func testAVeraCommentShowsAsVerasWithItsKind() {
        let comment = ItemComment(by: "Koen van der Borght", at: iso(hoursAgo: 26), text: "plain",
                                  markdown: "Vera · test report — 14 checks passed, 1 failed: `invoice totals round per line`.")
        let author = CommentAuthor.of(comment, me: "Koen van der Borght")
        XCTAssertEqual(author.name, "Vera")
        XCTAssertEqual(author.veraKind, "test report")
        XCTAssertFalse(author.isYou)
        XCTAssertEqual(author.body, "14 checks passed, 1 failed: `invoice totals round per line`.")
        XCTAssertEqual(CommentAuthor.vera("**Vera · qa-check** — Back to you.")?.kind, "qa-check")
        XCTAssertNil(CommentAuthor.vera("Vera said hi — twice"))
        XCTAssertEqual(CommentAuthor.displayName("Lena (QA)").name, "Lena")
        XCTAssertEqual(CommentAuthor.displayName("Lena (QA)").role, "QA")
        XCTAssertNil(CommentAuthor.displayName("Mara Visser").role)
    }

    // MARK: Details, pull requests, rich text

    func testTheDetailsGridPairsCellsAndSpansTheWideOnes() {
        var detail = ItemDetail(item: item(state: "Testing Failed", tags: ["invoice", "rounding"]), description: "", acceptanceCriteria: "", reproSteps: "", qaNotes: "", comments: [])
        detail.effort = 3
        detail.parent = ItemParent(id: 60990, title: "Checkout totals", typeName: "Epic")
        let finish = now.addingTimeInterval(6 * 86400 + 3600).formatted(.iso8601)
        let sprint = Sprint(name: "23", path: "", startDate: nil, finishDate: finish, items: [], generatedAt: "")
        let cells = ItemDetailCell.cells(detail.item, detail: detail, sprint: sprint, now: now)
        XCTAssertEqual(cells.map(\.label), ["Assigned to", "Sprint", "Priority", "Effort", "Parent", "Tags"])
        XCTAssertEqual(cells[1].value, .text("Sprint 23 · 6 d left"))
        XCTAssertEqual(cells[3].value, .text("3"))
        XCTAssertEqual(ItemDetailCell.rows(cells).map { $0.map(\.label) }, [["Assigned to", "Sprint"], ["Priority", "Effort"], ["Parent"], ["Tags"]])
        let odd = ItemDetailCell.cells(item(state: "New", sprint: ""), detail: nil, sprint: nil, now: now)
        XCTAssertEqual(odd.map(\.wide), [false, false, true], "an odd one out spans the row")
        XCTAssertEqual(odd[1].value, .text("None"))
    }

    func testALinkedPullRequestOutsideFocusStillShowsItsChecks() {
        let pr = ItemPullRequest(number: 412, url: "https://github.com/acme/shop/pull/412", branch: nil, state: .open, title: "Round per line", isDraft: false,
                                 checks: "failure", repository: "acme/shop", own: true, shared: false, author: "Priya", updatedAt: nil)
        XCTAssertEqual(ItemPullRequestTrack.steps(pr).map(\.mark), [.failed, .open, .open])
        XCTAssertEqual(ItemPullRequestTrack.repositoryName(pr), "shop")
    }

    func testRichTextLiftsImagesOutOfTheMarkdown() {
        let blocks = RichText.blocks("Totals:\n\n1. One\n2. Two\n\n![invoice-export.png](/api/items/1/attachments/a?sig=s)\n\nAfter.")
        XCTAssertEqual(blocks, [
            .markdown("Totals:\n\n1. One\n2. Two"),
            .image(alt: "invoice-export.png", url: "/api/items/1/attachments/a?sig=s"),
            .markdown("After."),
        ])
        XCTAssertEqual(RichText.blocks(#"<img src="/a.png" alt="shot">"#), [.image(alt: "shot", url: "/a.png")])
    }
}
