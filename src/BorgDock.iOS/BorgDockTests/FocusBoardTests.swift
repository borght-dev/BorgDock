import XCTest
@testable import BorgDock

/// Focus: the review queue, the agents, your turn, ready to merge and what waits on others.
final class FocusBoardTests: XCTestCase {
    private let me: Set<String> = ["koen"]

    private func thread(_ id: String, _ status: ThreadStatus, minutesAgo: Double = 5, title: String = "Agent", branch: String? = nil) -> ThreadSummary {
        ThreadSummary(
            id: id, title: title, worktree: "M1", branch: branch, status: status, createdAt: sampleISO(hoursAgo: 5),
            lastActivityAt: sampleISO(hoursAgo: minutesAgo / 60), model: "m", questionRequestId: nil, questions: [],
            lastAgentMessage: nil, link: "https://example.invalid/\(id)", appLink: nil
        )
    }

    private func review(_ number: Int, author: String = "sanne", hoursAgo: Double, files: Int = 4, lines: Int = 200) throws -> PrSummary {
        try samplePR(number, author: author, bucket: "you", extra: [
            "createdAt": sampleISO(hoursAgo: hoursAgo), "changedFiles": files, "additions": lines, "deletions": 0,
        ])
    }

    func testTheQueueIsOthersReviewsOldestFirstAndYourTurnAddsYours() throws {
        let prs = [
            try review(1, hoursAgo: 10),
            try samplePR(2, mine: true, bucket: "you", failed: 1),
            try review(3, author: "sam", hoursAgo: 75),
            try samplePR(4, bucket: "ready"),
            try samplePR(5, mine: true),
            try samplePR(6),
        ]
        let board = FocusBoard(pullRequests: prs, threads: [], myLogins: me)
        XCTAssertEqual(board.reviews.map(\.number), [3, 1])
        XCTAssertEqual(board.yourTurn.map(\.number), [3, 1, 2])
        XCTAssertEqual(board.readyToMerge.map(\.number), [4])
        XCTAssertEqual(board.waitingOnOthers.map(\.number), [5], "a teammate's pull request you never touched isn't waiting on anyone you know")
        XCTAssertEqual(board.reviewAuthors.map(\.login), ["sam", "sanne"])
    }

    func testTheQueueCardSaysHowLongAndHowMuchReading() throws {
        let prs = [
            try review(1, hoursAgo: 74, files: 21, lines: 700),
            try review(2, author: "tom", hoursAgo: 20, files: 8, lines: 180),
            try review(3, author: "tom", hoursAgo: 5, files: 2, lines: 40),
            try review(4, author: "ines", hoursAgo: 2, files: 1, lines: 60),
        ]
        let board = FocusBoard(pullRequests: prs, threads: [], myLogins: me)
        XCTAssertEqual(board.reviewsTitle, "4 reviews wait for you")
        XCTAssertEqual(board.reviewsDetail(now: samplePRNow), "Oldest 3 days · 29 files, 2 small PRs")
        XCTAssertEqual(board.reviewAuthors.map(\.login), ["sanne", "tom", "ines"])

        let one = FocusBoard(pullRequests: [try review(5, hoursAgo: 1.5, files: 1, lines: 10)], threads: [], myLogins: me)
        XCTAssertEqual(one.reviewsTitle, "1 review waits for you")
        XCTAssertEqual(one.reviewsDetail(now: samplePRNow), "Oldest 1 hour · 1 small PR")
        let none = FocusBoard(pullRequests: [], threads: [], myLogins: me)
        XCTAssertEqual(none.reviewsTitle, "No reviews wait for you")
        XCTAssertEqual(none.reviewsDetail(now: samplePRNow), "")
    }

    func testAgentsAreTheOnesRunningOrAskingYouAskingFirst() {
        let threads = [
            thread("run-old", .running, minutesAgo: 30),
            thread("question", .question, minutesAgo: 18),
            thread("your-turn", .yourTurn, minutesAgo: 1),
            thread("failed", .failed, minutesAgo: 2),
            thread("settled", .settled, minutesAgo: 1),
            thread("run-new", .running, minutesAgo: 4),
            thread("plan", .plan, minutesAgo: 60),
        ]
        let board = FocusBoard(pullRequests: [], threads: threads, myLogins: me)
        XCTAssertEqual(board.agents.map(\.id), ["question", "plan", "run-new", "run-old"])
        XCTAssertEqual(board.agentsSummary, "2 running · 2 ask you")
        XCTAssertEqual(board.shownAgents.map(\.id), ["question", "plan", "run-new"])
        XCTAssertEqual(board.moreAgents, "1 more running")
        XCTAssertEqual(FocusBoard(pullRequests: [], threads: [thread("q", .question)], myLogins: me).agentsSummary, "1 asks you")
    }

    func testAnAgentRowNamesItsPullRequestElseItsItem() throws {
        let pr = try samplePR(412, title: "Checkout: round totals per line")
        XCTAssertEqual(FocusBoard.subject(of: thread("a", .running, title: "Fix the failing e2e test"), pullRequest: pr, item: nil), "#412 Checkout: round totals per line")
        XCTAssertEqual(FocusBoard.subject(of: thread("b", .question, title: "checkout: round totals per line"), pullRequest: pr, item: nil), "#412", "the title already says what it is")
        let item = WorkItemSummary(
            id: 61021, type: .bug, typeName: "Bug", title: "Basket empties", state: "New", stateCategory: .proposed, workflow: [],
            sprint: "", dueDate: nil, priority: nil, tags: [], assignedTo: nil, assignedToMe: true, url: ""
        )
        XCTAssertEqual(FocusBoard.subject(of: thread("c", .running, title: "Fix it"), pullRequest: nil, item: item), "AB#61021 Basket empties")
        XCTAssertNil(FocusBoard.subject(of: thread("d", .running), pullRequest: nil, item: nil))
    }

    func testWaitingOnOthersSaysHowManyAndTheOldest() throws {
        let prs = [
            try samplePR(1, mine: true, extra: ["createdAt": sampleISO(hoursAgo: 100)]),
            try samplePR(2, extra: ["reviewedHeadSha": "old", "createdAt": sampleISO(hoursAgo: 3)]),
        ]
        XCTAssertEqual(FocusBoard(pullRequests: prs, threads: [], myLogins: me).waitingDetail(now: samplePRNow), "2 pull requests · oldest 4 days")
    }

    func testWhyItIsYourTurn() throws {
        let review = try samplePR(1, bucket: "you", extra: ["changedFiles": 8, "reason": ["text": "Sam asked for your review 3 days ago.", "tone": "warn", "icon": "review"]])
        XCTAssertEqual(FocusWhy(review), FocusWhy(text: "Review requested · 8 files", systemImage: "eye", emphasis: .accent))
        let again = try samplePR(2, bucket: "you", extra: ["changedFiles": 1, "reason": ["text": "Tom asked you to look again.", "tone": "warn", "icon": "rerun"]])
        XCTAssertEqual(FocusWhy(again), FocusWhy(text: "Re-review · 1 file", systemImage: "arrow.counterclockwise", emphasis: .tone(.warn)))
        let failing = try samplePR(3, mine: true, bucket: "you", failed: 2, extra: ["reason": ["text": "Your PR, 2 checks failing.", "tone": "bad", "icon": "failing"]])
        XCTAssertEqual(FocusWhy(failing), FocusWhy(text: "Your PR, 2 checks failing", systemImage: "xmark.circle", emphasis: .tone(.bad)))
    }

    func testAReadyRowSaysWhoApprovedAndHowTheChecksAre() throws {
        let tom = try samplePR(9, author: "tompeeters")
        let names = ReadyLine.firstNames([tom])
        let byTom = try samplePR(401, mine: true, bucket: "ready", extra: ["approvedBy": ["tompeeters"]])
        XCTAssertEqual(ReadyLine.text(byTom, firstNames: names, myLogins: me), "shop #401 · approved by Tompeeters · checks pass")
        let byYou = try samplePR(91, repo: "payments", bucket: "ready", extra: ["approvedBy": ["koen"], "autoMerge": true])
        XCTAssertEqual(ReadyLine.text(byYou, firstNames: names, myLogins: me), "payments #91 · approved by you · checks pass · auto-merge on")
        let three = try samplePR(5, bucket: "ready", extra: ["approvedBy": ["a", "b", "c"], "checks": ["total": 2, "passed": 1, "failed": 0, "pending": 1, "skipped": 0, "segments": []]])
        XCTAssertEqual(ReadyLine.text(three, firstNames: [:], myLogins: me), "shop #5 · approved by a and 2 others · checks running")
    }

    func testAgesInWordsAndTheSyncLine() {
        XCTAssertEqual(LongAge.text(sampleISO(hoursAgo: 0.2), now: samplePRNow), "12 minutes")
        XCTAssertEqual(LongAge.text(sampleISO(hoursAgo: 1), now: samplePRNow), "1 hour")
        XCTAssertEqual(LongAge.text(sampleISO(hoursAgo: 49), now: samplePRNow), "2 days")
        XCTAssertEqual(FocusSubtitle.sync(syncedAt: samplePRNow.addingTimeInterval(-20), isLoading: false, failed: false, now: samplePRNow), "synced just now")
        XCTAssertEqual(FocusSubtitle.sync(syncedAt: samplePRNow.addingTimeInterval(-300), isLoading: true, failed: false, now: samplePRNow), "synced 5 min ago")
        XCTAssertEqual(FocusSubtitle.sync(syncedAt: nil, isLoading: true, failed: false, now: samplePRNow), "syncing…")
        XCTAssertEqual(FocusSubtitle.sync(syncedAt: nil, isLoading: false, failed: true, now: samplePRNow), "not synced")
    }
}

/// Settings → Pull requests → Repositories: the banner, the rows and the footer.
final class RepositoriesCopyTests: XCTestCase {
    private func repositories(source: String = "desktop", desktop: String? = nil, cutOff: Bool = false, rows: [[String: Any]] = []) throws -> PrRepositories {
        let json: [String: Any] = [
            "source": source, "desktopName": desktop ?? NSNull(), "updatedAt": NSNull(), "repositories": rows,
            "includeInvolving": true, "includeTeamRequests": false, "polledAt": sampleISO(hoursAgo: 30.0 / 3600), "cutOff": cutOff,
        ]
        return try JSONDecoder().decode(PrRepositories.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private func row(_ name: String, open: Int, ok: Bool = true) -> [String: Any] {
        ["name": name, "open": open, "polledAt": sampleISO(hoursAgo: 20.0 / 3600), "ok": ok, "error": ok ? NSNull() : "Not Found"]
    }

    func testTheBannerSaysWhoDecidesTheRepositories() throws {
        XCTAssertEqual(RepositoriesCopy.source(try repositories()).detail, "BorgDock on your desktop shares the repositories it watches. Add or remove them there.")
        XCTAssertEqual(RepositoriesCopy.source(try repositories(desktop: "the studio PC")).detail.prefix(30), "BorgDock on the studio PC shar")
        XCTAssertEqual(RepositoriesCopy.source(try repositories(source: "config")).title, "From the server's settings.")
        let none = RepositoriesCopy.source(try repositories(source: "none"))
        XCTAssertEqual(none.title, "No repositories yet.")
        XCTAssertTrue(none.warns)
    }

    func testRowsPutFailedReadsFirstThenTheBusiest() throws {
        let read = try repositories(rows: [row("acme/infra", open: 9), row("acme/shop", open: 41), row("acme/old", open: 0, ok: false), row("acme/admin", open: 9)])
        let ordered = RepositoriesCopy.ordered(read.repositories)
        XCTAssertEqual(ordered.map(\.name), ["acme/old", "acme/shop", "acme/admin", "acme/infra"])
        XCTAssertEqual(RepositoriesCopy.line(ordered[1], now: samplePRNow), "41 open · read 20 s ago")
        XCTAssertEqual(RepositoriesCopy.line(ordered[0], now: samplePRNow), "Not Found")
    }

    func testTheFooterSaysWhetherAnythingWasCutOff() throws {
        XCTAssertEqual(RepositoriesCopy.headline(try repositories(), now: samplePRNow), "Read 30 s ago, nothing cut off.")
        XCTAssertEqual(RepositoriesCopy.headline(try repositories(cutOff: true), now: samplePRNow), "Read 30 s ago, some results cut off.")
        XCTAssertTrue(RepositoriesCopy.detail(try repositories(cutOff: true)).contains("1,000 results"))
    }
}
