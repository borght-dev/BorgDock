import XCTest
@testable import BorgDock

final class PrPageTests: XCTestCase {
    private let priya = Person(login: "priya", name: "Priya Shah", avatarUrl: nil)
    private let codesmith = Person(login: "codesmith[bot]", name: nil, avatarUrl: nil)

    func testChecksLeadOnlyWhileOneFails() {
        XCTAssertEqual(PrPageSection.order(failing: true, hasProof: true), [.checks, .proof, .description, .comments, .files])
        XCTAssertEqual(PrPageSection.order(failing: false, hasProof: true), [.proof, .description, .checks, .comments, .files])
        XCTAssertEqual(PrPageSection.order(failing: false, hasProof: false), [.description, .checks, .comments, .files])
    }

    func testJumpChipsCountProofCommentsAndFiles() {
        let items = PrPageSection.jumpItems(PrPageSection.order(failing: true, hasProof: true), proof: 3, comments: 8, files: 52)
        XCTAssertEqual(items.map(\.title), ["Checks", "Proof", "Description", "Comments", "Files"])
        XCTAssertEqual(items.map(\.count), [nil, 3, nil, 8, 52])
    }

    func testTheSectionOnScreenIsTheLastOneUnderTheBar() {
        let sections: [PrPageSection] = [.checks, .proof, .description]
        let tops: [PrPageSection: CGFloat] = [.checks: 300, .proof: 700, .description: 900]
        XCTAssertEqual(PrPageSection.visible(sections, tops: tops, line: 100), .checks)
        XCTAssertEqual(PrPageSection.visible(sections, tops: tops, line: 750), .proof)
        XCTAssertEqual(PrPageSection.visible(sections, tops: tops, line: 2000), .description)
    }

    func testShortTitlesDropTheScopeAndTheTrailingClause() {
        XCTAssertEqual(PrTitle.short("Checkout: round totals per line instead of per order"), "Round totals per line")
        XCTAssertEqual(PrTitle.short("feat(cart): keep the basket"), "Keep the basket")
        XCTAssertEqual(PrTitle.short("Use it instead of that"), "Use it instead of that")
    }

    func testChecksLabel() {
        let failing = [run(1, .failure), run(2, .failure)] + (3...24).map { run($0, .success) }
        XCTAssertEqual(ChecksLabel.text(failing), "2 of 24 failing")
        XCTAssertEqual(ChecksLabel.text([run(1, .pending), run(2, .success)]), "1 running")
        XCTAssertEqual(ChecksLabel.text([run(1, .success)]), "1 passed")
    }

    func testCheckDurationsInWholeMinutes() {
        XCTAssertEqual(CheckDuration.text(45), "45 s")
        XCTAssertEqual(CheckDuration.text(252), "4 min")
        XCTAssertEqual(CheckDuration.text(61), "1 min")
        XCTAssertEqual(CheckDuration.text(3900), "1 h 5 min")
        XCTAssertEqual(CheckDuration.text(nil), "")
    }

    func testLogLinesColourExpectedReceivedAndDimRuleIds() {
        XCTAssertEqual(LogLine.tone("  Expected: \"€ 12,40\""), .expected)
        XCTAssertEqual(LogLine.tone("Received: \"€ 12,39\""), .received)
        XCTAssertEqual(LogLine.tone("+ added"), .received)
        let segments = LogLine.segments("src/cart/total.ts:14:7 lint/style/useConst")
        XCTAssertEqual(segments.map(\.text), ["src/cart/total.ts:14:7", " lint/style/useConst"])
        XCTAssertEqual(segments.map(\.tone), [.plain, .dim])
    }

    func testAFailureIsThePRsSpecWhenItChangesTheFile() {
        let failure = CheckFailure(step: "Run Playwright tests", summary: nil, snippet: "Expected: 1", location: "checkout.spec.ts:88",
                                   newInThisPr: true, alsoOnBase: nil, groupId: nil)
        let files = [PrFile(path: "tests/e2e/checkout.spec.ts", previousPath: nil, status: .modified, additions: 1, deletions: 0, patch: nil, changedSinceReview: false)]
        XCTAssertTrue(FailureFacts.changesSpec(failure, files: files))
        XCTAssertFalse(FailureFacts.changesSpec(failure, files: []))
        let lint = CheckFailure(step: "biome lint", summary: nil, snippet: "src/cart/total.ts:14:7 lint/style/useConst", location: nil,
                                newInThisPr: false, alsoOnBase: nil, groupId: nil)
        XCTAssertNil(FailureFacts.specFile(lint))
    }

    func testCommentsJoinReviewSummariesInTimeOrderAndCountEverything() {
        let thread = ReviewThread(id: "t", path: "src/cart/total.ts", line: 14, diffHunk: nil, isResolved: false,
                                  comments: [comment("c1", at: "2026-11-12T08:00:00Z"), comment("c2", at: "2026-11-12T09:00:00Z")])
        let resolved = ReviewThread(id: "r", path: nil, line: nil, diffHunk: nil, isResolved: true, comments: [comment("c3", at: "2026-11-11T08:00:00Z")])
        let conversation = PrConversation(threads: [thread, resolved], comments: [comment("c4", at: "2026-11-12T10:00:00Z")])
        let reviews = [
            PrReview(author: codesmith, state: .commented, at: "2026-11-12T07:00:00Z", body: "Summary"),
            PrReview(author: priya, state: .approved, at: "2026-11-12T11:00:00Z", body: " "),
        ]
        let comments = PrComments(conversation: conversation, reviews: reviews)
        XCTAssertEqual(comments.open.map(\.id), ["t"])
        XCTAssertEqual(comments.resolved.map(\.id), ["r"])
        XCTAssertEqual(comments.entries.map(\.body), ["Summary", "Body c4"])
        XCTAssertEqual(comments.count, 5)
    }

    func testBotSummariesFoldWithWhatWasHidden() {
        let body = "Three notes:\n- one\n- two\n- three\n<!-- codesmith:footer -->\n<a href=\"https://example.com\"><img src=\"https://example.com/b.svg\" height=\"20\"></a>\n<!-- /codesmith:footer -->"
        XCTAssertEqual(CommentPresentation.of(author: codesmith, body: body, isReview: true),
                       .folded(BotFold(name: "codesmith", kind: "review summary", subtitle: "3 notes · footer hidden")))
        XCTAssertEqual(CommentPresentation.of(author: codesmith, body: "Deployed.", isReview: false), .plain)
        XCTAssertEqual(CommentPresentation.of(author: priya, body: String(repeating: "long ", count: 100), isReview: false), .plain)
    }

    func testTheE2EReportTakesItsTitleAndCountsFailedRows() {
        let body = "## E2E Test Results\n\n### Failed Tests\n| Test | Error |\n|---|---|\n| checkout.spec.ts › totals | Expected \"€ 12,40\" |\n\nRun #2214 · 311 passed"
        guard case .e2eReport(let failed, let rest) = CommentPresentation.of(author: codesmith, body: body, isReview: false) else { return XCTFail("Expected a report") }
        XCTAssertEqual(failed, 1)
        XCTAssertFalse(rest.contains("E2E Test Results"))
        XCTAssertFalse(rest.contains("Failed Tests"))
        XCTAssertTrue(rest.hasSuffix("Run #2214 · 311 passed"))
    }

    func testBotsByAppSuffixOrToolName() {
        XCTAssertTrue(BotAuthor.isBot("renovate[bot]"))
        XCTAssertTrue(BotAuthor.isBot("codesmith"))
        XCTAssertFalse(BotAuthor.isBot("priya"))
        XCTAssertEqual(BotAuthor.name("github-actions[bot]"), "github-actions")
    }

    private func run(_ id: Int, _ state: CheckState) -> CheckRun {
        CheckRun(id: id, name: "job \(id)", workflow: nil, state: state, startedAt: nil, completedAt: nil, durationSeconds: nil,
                 url: "https://example.com", runId: nil, jobId: nil, failure: nil)
    }

    private func comment(_ id: String, at: String) -> PrComment {
        PrComment(id: id, author: priya, body: "Body \(id)", at: at, reactions: [])
    }
}
