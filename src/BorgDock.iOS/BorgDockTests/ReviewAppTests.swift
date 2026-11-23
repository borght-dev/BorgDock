import XCTest
@testable import BorgDock

/// The rules behind BorgDock Review's screens (design/review-app/mockups.html) that aren't the Ledger's: who reviews a
/// pull request, where its threads sit in the walk, comments on several lines, and the order a work item reads in.
final class ReviewAppTests: XCTestCase {
    private let now = samplePRNow

    // MARK: - Reviewers

    private func detail(
        mine: Bool = false, requestedFromYou: Bool = false, requested: [String] = [], teams: [String] = [], reviews: [[String: Any]] = [],
        requestedAt: Double? = nil
    ) throws -> PrDetail {
        var extra: [String: Any] = [
            "requestedReviewerLogins": requested, "requestedTeams": teams, "latestReviews": reviews,
            "author": ["login": "priya", "name": "Priya Shah", "avatarUrl": NSNull()],
        ]
        if let requestedAt { extra["reviewRequestedAt"] = sampleISO(hoursAgo: requestedAt) }
        let summary = try samplePR(412, author: "priya", mine: mine, bucket: requestedFromYou ? "you" : "wait", extra: extra)
        let people = requested.map { Person(login: $0, name: $0 == "tom" ? "Tom Berg" : nil, avatarUrl: nil) }
        return PrDetail(
            summary: summary, body: "", commits: 6,
            reviews: reviews.map { PrReview(author: Person(login: $0["login"] as? String ?? "", name: $0["name"] as? String, avatarUrl: nil), state: .approved, at: sampleISO(hoursAgo: 48), body: "") },
            requestedReviewers: people, requestedFromYou: requestedFromYou, checkRuns: [], proofImages: [], allowedMergeMethods: [.squash],
            defaultMergeMethod: .squash, deleteBranchOnMerge: true, viewerCanMerge: true, workItems: [], threads: []
        )
    }

    func testYouComeFirstThenTheAnswersThenWhoIsStillAsked() throws {
        let detail = try detail(
            requestedFromYou: true, requested: ["koen", "sam"], teams: ["checkout"],
            reviews: [["login": "tom", "name": "Tom Berg", "state": "approved", "commitSha": "c1", "submittedAt": sampleISO(hoursAgo: 48), "commitsSince": 2]],
            requestedAt: 4 * 24
        )
        let rows = PrReviewers.rows(detail, myLogins: ["koen"], now: now)
        XCTAssertEqual(rows.map(\.name), ["You", "Tom Berg", "sam", "@checkout"])
        XCTAssertEqual(rows.map(\.status), [.yours, .approved, .waiting, .waiting])
        XCTAssertEqual(rows[0].detail, "Asked by Priya, 4 d ago")
        XCTAssertEqual(rows[1].detail, "2 d ago · 2 commits since")
        XCTAssertTrue(rows[3].isTeam)
        XCTAssertFalse(rows[0].isTeam)
        XCTAssertEqual(PrReviewers.summary(rows), "1 of 4 approved")
    }

    func testAReviewThroughYourTeamSaysSo() throws {
        let detail = try detail(requestedFromYou: true, teams: ["acme/checkout"], requestedAt: 3)
        let rows = PrReviewers.rows(detail, myLogins: ["koen"], myTeams: ["checkout"], now: now)
        XCTAssertEqual(rows.first?.detail, "Asked through @checkout, 3 h ago")
        XCTAssertEqual(rows.map(\.id), ["you", "@checkout"])
    }

    func testChangesRequestedLeadsTheSummaryAndTheAuthorIsNoReviewer() throws {
        let detail = try detail(mine: true, reviews: [
            ["login": "ines", "state": "changes_requested", "commitSha": "c1", "submittedAt": sampleISO(hoursAgo: 5)],
            ["login": "priya", "state": "commented", "commitSha": "c1", "submittedAt": sampleISO(hoursAgo: 2)],
        ])
        let rows = PrReviewers.rows(detail, myLogins: ["koen"], now: now)
        XCTAssertEqual(rows.map(\.id), ["ines"], "the author's own comments are not a review")
        XCTAssertEqual(PrReviewers.summary(rows), "Changes requested")
        XCTAssertEqual(PrReviewers.summary([]), "")
    }

    func testThePageGetsAReviewersSectionOnlyWhenThereAreSome() {
        XCTAssertEqual(PrPageSection.order(failing: true, hasProof: true, hasReviewers: true), [.checks, .proof, .description, .reviewers, .comments, .files])
        XCTAssertEqual(PrPageSection.order(failing: false, hasProof: false, hasReviewers: true), [.description, .checks, .reviewers, .comments, .files])
        let items = PrPageSection.jumpItems([.reviewers, .comments], proof: 0, comments: 8, files: 0, reviewers: 3, conversation: true)
        XCTAssertEqual(items.map(\.title), ["Reviewers", "Conversation"])
        XCTAssertEqual(items.map(\.count), [3, 8])
        XCTAssertEqual(PrThreadsLabel.text(open: 1, total: 8), "1 thread open")
        XCTAssertEqual(PrThreadsLabel.text(open: 0, total: 8), "8")
        XCTAssertNil(PrThreadsLabel.text(open: 0, total: 0))
    }

    func testWhatChangedCountsFilesByHowTheyAreRead() {
        func file(_ path: String, _ kind: PrFileCategory) -> PrFile {
            PrFile(path: path, previousPath: nil, status: .modified, additions: 1, deletions: 0, patch: nil, changedSinceReview: false, category: kind)
        }
        let parts = PrChangeMix.parts([file("a.ts", .source), file("b.ts", .source), file("a.test.ts", .tests), file("bun.lock", .generated)])
        XCTAssertEqual(parts, [.init(count: 2, label: "source"), .init(count: 1, label: "tests"), .init(count: 1, label: "generated")])
    }

    // MARK: - Threads in the walk

    private let patch = """
    @@ -8,5 +8,7 @@ export function orderTotal
     import { Money } from '../money';
    -export function orderTotal(lines: Line[]) {
    +export function lineTotal(line: Line) {
    +  return Money.round(line.qty * line.price);
    +}
     const zero = Money.zero;
    """

    private func thread(_ id: String, path: String = "src/cart/total.ts", line: Int?, side: DiffSide? = nil) -> ReviewThread {
        ReviewThread(id: id, path: path, line: line, diffHunk: nil, isResolved: false, comments: [], side: side)
    }

    func testAThreadSitsUnderItsLineOnItsSide() {
        let lines = UnifiedDiff.parse(patch)
        let placed = WalkThreads.place(
            [thread("new", line: 10), thread("old", line: 9, side: .left), thread("gone", line: 80), thread("other", path: "README.md", line: 9), thread("file", line: nil)],
            path: "src/cart/total.ts", lines: lines
        )
        let added = lines.first { $0.anchor == DiffAnchor(line: 10, side: .right) }
        let removed = lines.first { $0.anchor == DiffAnchor(line: 9, side: .left) }
        XCTAssertEqual(placed.byLine[added?.id ?? -1]?.map(\.id), ["new"])
        XCTAssertEqual(placed.byLine[removed?.id ?? -1]?.map(\.id), ["old"])
        XCTAssertEqual(placed.elsewhere.map(\.id), ["gone", "file"], "a line this diff doesn't show still gets its thread, on top")
        XCTAssertEqual(placed.count, 4)
        XCTAssertEqual(WalkThreads.summary(threads: 1, drafts: 1), "1 thread, 1 draft")
        XCTAssertEqual(WalkThreads.summary(threads: 0, drafts: 2), "2 drafts")
        XCTAssertEqual(WalkThreads.summary(threads: 0, drafts: 0), "")
    }

    // MARK: - A comment on several lines

    func testADraftRemembersItsFirstLineAndCoversEveryLineBetween() {
        var draft = ReviewDraft()
        let end = DiffAnchor(line: 17, side: .right)
        draft.set("One expression.", path: "src/cart/total.ts", anchor: end, startLine: 15)
        XCTAssertEqual(draft.lineComments, [ReviewLineComment(path: "src/cart/total.ts", line: 17, side: .right, body: "One expression.", startLine: 15)])
        XCTAssertEqual(draft.lineComments.first?.lines, "15 to 17")
        XCTAssertTrue(draft.covers(path: "src/cart/total.ts", anchor: DiffAnchor(line: 16, side: .right)))
        XCTAssertFalse(draft.covers(path: "src/cart/total.ts", anchor: DiffAnchor(line: 16, side: .left)))
        XCTAssertFalse(draft.covers(path: "src/cart/total.ts", anchor: DiffAnchor(line: 18, side: .right)))

        draft.set("One line.", path: "src/cart/total.ts", anchor: DiffAnchor(line: 30, side: .right), startLine: 30)
        XCTAssertNil(draft.startLine(path: "src/cart/total.ts", anchor: DiffAnchor(line: 30, side: .right)), "one line has no first line")
        XCTAssertEqual(draft.lineComments.last?.lines, "30")

        draft.set("", path: "src/cart/total.ts", anchor: end)
        XCTAssertEqual(draft.lineComments.map(\.line), [30], "an empty comment removes the draft and its lines")
        XCTAssertTrue(draft.starts.isEmpty)
    }

    func testACommentOnOneLineIsSentWithoutAStartLine() throws {
        let one = try JSONSerialization.jsonObject(with: JSONEncoder().encode(ReviewLineComment(path: "a.ts", line: 3, side: .right, body: "x"))) as? [String: Any]
        XCTAssertNil(one?["startLine"], "an older server never sees the new field")
        let several = try JSONSerialization.jsonObject(with: JSONEncoder().encode(ReviewLineComment(path: "a.ts", line: 5, side: .right, body: "x", startLine: 3))) as? [String: Any]
        XCTAssertEqual(several?["startLine"] as? Int, 3)
    }

    @MainActor
    func testACommentGrowsToAnotherLineOfItsHunkAndNoFurther() throws {
        let twoHunks = patch + "\n@@ -40,2 +42,2 @@ export function receiptLines\n-    total: line.qty * line.price,\n+    total: lineTotal(line),"
        let file = PrFile(path: "src/cart/total.ts", previousPath: nil, status: .modified, additions: 4, deletions: 2, patch: twoHunks, changedSinceReview: false)
        let session = ReviewSession(key: PrKey(owner: "acme", repo: "shop", number: 412), storage: ReviewedFiles(defaults: UserDefaults(suiteName: "review-app-tests")!))
        let lines = session.lines(file)
        func line(_ number: Int, _ side: DiffSide = .right) throws -> DiffLine { try XCTUnwrap(lines.first { $0.anchor == DiffAnchor(line: number, side: side) }) }

        let start = try XCTUnwrap(session.draftTarget(for: try line(9), in: file, draft: ReviewDraft()))
        XCTAssertNil(start.startLine)
        XCTAssertNil(start.saved)

        let grown = try XCTUnwrap(session.extended(start, to: try line(11), in: file))
        XCTAssertEqual(grown.startLine, 9)
        XCTAssertEqual(grown.anchor, DiffAnchor(line: 11, side: .right))
        XCTAssertEqual(grown.code, "export function lineTotal(line: Line) {\n  return Money.round(line.qty * line.price);\n}")
        XCTAssertTrue(grown.covers(DiffAnchor(line: 10, side: .right)))

        XCTAssertNil(session.extended(start, to: try line(42), in: file), "GitHub refuses a comment across two hunks")
        XCTAssertNil(session.extended(start, to: try line(9, .left), in: file), "and across the two sides")

        var draft = ReviewDraft()
        draft.set("Nit", path: file.path, anchor: grown.anchor, startLine: grown.startLine)
        let reopened = try XCTUnwrap(session.draftTarget(for: try line(10), in: file, draft: draft))
        XCTAssertEqual(reopened.saved, grown.anchor, "a tap inside a draft's lines opens that draft")
        XCTAssertEqual(reopened.startLine, 9)
    }

    func testASuggestionPutsTheLinesInTheBoxOnce() {
        let text = ReviewSuggestion.adding("const a = 1;", to: "Use const.")
        XCTAssertEqual(text, "Use const.\n\n```suggestion\nconst a = 1;\n```")
        XCTAssertTrue(ReviewSuggestion.has(text))
        XCTAssertEqual(ReviewSuggestion.adding("x", to: "  "), "```suggestion\nx\n```")
    }

    // MARK: - The walk's steps and the work item's order

    func testAKindThatIsNotAStepIsReadFileByFileAfterTheSource() {
        func file(_ path: String, _ kind: PrFileCategory) -> PrFile {
            PrFile(path: path, previousPath: nil, status: .modified, additions: 1, deletions: 0, patch: nil, changedSinceReview: false, category: kind)
        }
        let files = [file("src/a.ts", .source), file("src/a.test.ts", .tests), file("bun.lock", .generated)]
        XCTAssertEqual(ReviewWalk(files).steps, [.file("src/a.ts"), .step(.tests), .step(.generated)])
        XCTAssertEqual(ReviewWalk(files, steps: [.generated]).steps, [.file("src/a.ts"), .file("src/a.test.ts"), .step(.generated)])
        XCTAssertEqual(ReviewWalk(files, steps: []).steps, [.file("src/a.ts"), .file("src/a.test.ts"), .file("bun.lock")])
        XCTAssertEqual(ReviewPreferences.Steps.both.groups, [.tests, .generated])
        XCTAssertTrue(ReviewPreferences.Steps.none.groups.isEmpty)
    }

    func testAWorkItemReadsInAFixedOrderWithoutAgents() {
        let available: Set<ItemSection> = [.activity, .details, .pullRequests, .agents, .qaNotes, .acceptance, .reproSteps, .description]
        let sections = ItemLayout.readingSections(available: available)
        XCTAssertEqual(sections, [.description, .reproSteps, .acceptance, .qaNotes, .pullRequests, .details, .activity])
        let jumps = ItemLayout.readingJumps(sections, pullRequests: 2, discussion: 4)
        XCTAssertEqual(jumps.map(\.title), ["Description", "Repro steps", "Acceptance", "Pull requests", "Discussion"])
        XCTAssertEqual(jumps.map(\.count), [nil, nil, nil, 2, 4])
    }

    func testAnAccountSaysWhenItsTokenRunsOut() {
        var account = DirectCredentials.GitHub(login: "kv-labs", token: "t", label: "Personal")
        XCTAssertNil(account.expiryWarning(now: now), "a token that doesn't expire warns of nothing")
        account.expiresAt = now.addingTimeInterval(6.5 * 86_400)
        XCTAssertEqual(account.expiryWarning(now: now), "Token expires in 6 days")
        account.expiresAt = now.addingTimeInterval(40 * 86_400)
        XCTAssertNil(account.expiryWarning(now: now))
        account.expiresAt = now.addingTimeInterval(-3600)
        XCTAssertEqual(account.expiryWarning(now: now), "Token expired")
        XCTAssertEqual(account.shownLabel, "Personal")
        XCTAssertEqual(AccountLabel.parse("Client").0, .other)
        XCTAssertEqual(AccountLabel.parse("Client").1, "Client")
        XCTAssertEqual(AccountLabel.parse(nil).0, .work)
    }

    func testTheNeedsLineNamesEachReasonOnce() {
        XCTAssertEqual(ReviewEndSummary.needs([.failing, .changesRequested, .commented, .failing]), "Failing checks, changes asked, a comment")
    }
}
