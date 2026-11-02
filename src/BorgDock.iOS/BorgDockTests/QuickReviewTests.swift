import XCTest
@testable import BorgDock

/// The diff parser, the highlighter, reviewed-file persistence and the Undo hold of Quick Review.
@MainActor
final class QuickReviewTests: XCTestCase {
    // MARK: - Diff parser

    private let patch = """
    @@ -32,4 +32,5 @@ export function BasketRecovery
       const basket = useBasket();
    -  useEffect(() => basket.clear(), [failed]);
    +  const timedOut = order.kind === 'timeout';
    +
       return null;
    @@ -80,2 +81,2 @@ describe('checkout timeout')
    -  it('old', () => {});
    +  it('new', () => {});
    \\ No newline at end of file
    """

    func testParsesHunksAndNumbersEachSide() {
        let lines = UnifiedDiff.parse(patch)
        XCTAssertEqual(lines.map(\.kind), [.hunk, .context, .removed, .added, .added, .context, .hunk, .removed, .added, .note])
        XCTAssertEqual(lines[1].oldLine, 32)
        XCTAssertEqual(lines[1].newLine, 32)
        XCTAssertEqual(lines[2].oldLine, 33)
        XCTAssertNil(lines[2].newLine)
        XCTAssertEqual(lines[3].newLine, 33)
        XCTAssertEqual(lines[4].newLine, 34)
        XCTAssertEqual(lines[4].text, "")
        XCTAssertEqual(lines[5].oldLine, 34)
        XCTAssertEqual(lines[5].newLine, 35)
        XCTAssertEqual(lines[7].oldLine, 80)
        XCTAssertEqual(lines[8].newLine, 81)
        XCTAssertEqual(lines[9].text, "No newline at end of file")
    }

    func testCommentAnchorsFollowTheSide() {
        let lines = UnifiedDiff.parse(patch)
        XCTAssertEqual(lines[2].anchor, DiffAnchor(line: 33, side: .left))
        XCTAssertEqual(lines[3].anchor, DiffAnchor(line: 33, side: .right))
        XCTAssertEqual(lines[1].anchor, DiffAnchor(line: 32, side: .right))
        XCTAssertNil(lines[0].anchor)
        XCTAssertEqual(lines[2].number, 33)
        XCTAssertEqual(lines[2].marker, "−")
    }

    func testHunkStartsAcceptSingleLineRanges() {
        XCTAssertEqual(UnifiedDiff.hunkStarts("@@ -1 +1,2 @@")?.0, 1)
        XCTAssertEqual(UnifiedDiff.hunkStarts("@@ -0,0 +1,30 @@")?.1, 1)
        XCTAssertNil(UnifiedDiff.hunkStarts("@@ nonsense"))
    }

    func testIndentForTheHangingWrap() {
        XCTAssertEqual(UnifiedDiff.indent("    return x").columns, 4)
        XCTAssertEqual(String(UnifiedDiff.indent("\tfoo").rest), "foo")
        XCTAssertEqual(UnifiedDiff.indent("").columns, 0)
    }

    // MARK: - Highlighter

    func testHighlightsKeywordsCallsStringsAndTypes() {
        let segments = SyntaxHighlighter.segments("  if (x) return <RetryBanner onRetry={retry('a')} /> // ok", language: SyntaxHighlighter.language(for: "a.tsx"))
        func kind(of text: String) -> SyntaxHighlighter.Kind? { segments.first { $0.text == text }?.kind }
        XCTAssertEqual(kind(of: "if"), .keyword)
        XCTAssertEqual(kind(of: "return"), .keyword)
        XCTAssertEqual(kind(of: "RetryBanner"), .type)
        XCTAssertEqual(kind(of: "retry"), .function)
        XCTAssertEqual(kind(of: "'a'"), .string)
        XCTAssertEqual(kind(of: "// ok"), .comment)
        XCTAssertEqual(segments.map(\.text).joined(), "  if (x) return <RetryBanner onRetry={retry('a')} /> // ok", "no text is lost")
    }

    func testUnterminatedStringsAndPlainFilesDoNotLoseText() {
        let line = "const s = 'open"
        XCTAssertEqual(SyntaxHighlighter.segments(line, language: SyntaxHighlighter.language(for: "x.ts")).map(\.text).joined(), line)
        XCTAssertEqual(SyntaxHighlighter.segments("# Title", language: SyntaxHighlighter.language(for: "README.md")), [.init(text: "# Title", kind: nil)])
        XCTAssertEqual(SyntaxHighlighter.segments("x: 1 # note", language: SyntaxHighlighter.language(for: "a.yml")).last?.kind, .comment)
    }

    // MARK: - Reviewed files

    private func defaults() -> UserDefaults {
        let name = "QuickReviewTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private func file(_ path: String, changed: Bool = false) -> PrFile {
        PrFile(path: path, previousPath: nil, status: .modified, additions: 1, deletions: 0, patch: nil, changedSinceReview: changed)
    }

    func testReviewedFilesPersistPerPullRequestAndHead() {
        let store = ReviewedFiles(defaults: defaults())
        store.save(["a.ts", "b.ts"], prKey: "acme/shop#1", headSha: "aaa")
        XCTAssertEqual(store.saved(prKey: "acme/shop#1", headSha: "aaa"), ["a.ts", "b.ts"])
        XCTAssertNil(store.saved(prKey: "acme/shop#1", headSha: "bbb"), "a new push starts over")
        XCTAssertNil(store.saved(prKey: "acme/shop#2", headSha: "aaa"))

        store.save(["c.ts"], prKey: "acme/shop#1", headSha: "bbb")
        XCTAssertNil(store.saved(prKey: "acme/shop#1", headSha: "aaa"), "one entry per PR")
        XCTAssertEqual(store.saved(prKey: "acme/shop#1", headSha: "bbb"), ["c.ts"])
    }

    func testReReviewStartsOnTheChangedFiles() {
        let store = ReviewedFiles(defaults: defaults())
        let files = PrFiles(headSha: "new", reviewedHeadSha: "old", files: [file("a.ts"), file("b.ts", changed: true), file("c.ts")])
        XCTAssertTrue(ReviewedFiles.isReReview(files))
        XCTAssertEqual(store.initial(prKey: "k", files: files), ["a.ts", "c.ts"])

        store.save(["a.ts", "b.ts", "gone.ts"], prKey: "k", headSha: "new")
        XCTAssertEqual(store.initial(prKey: "k", files: files), ["a.ts", "b.ts"], "saved state wins, minus files no longer in the PR")
    }

    func testFirstReviewStartsEmpty() {
        let files = PrFiles(headSha: "h", reviewedHeadSha: nil, files: [file("a.ts")])
        XCTAssertFalse(ReviewedFiles.isReReview(files))
        XCTAssertEqual(ReviewedFiles(defaults: defaults()).initial(prKey: "k", files: files), [])
        let same = PrFiles(headSha: "h", reviewedHeadSha: "h", files: [file("a.ts", changed: true)])
        XCTAssertFalse(ReviewedFiles.isReReview(same), "reviewed this very head")
    }

    // MARK: - Undo hold

    private let key = PrKey(owner: "acme", repo: "shop", number: 3712)

    func testApprovalIsSentOnlyAfterTheHold() async throws {
        let hold = ApprovalHold()
        var sent = 0
        hold.hold(key, label: "Approving", duration: .milliseconds(150), send: { sent += 1 }, onUndo: {}, onFailure: { _ in })
        XCTAssertTrue(hold.isHeld(key))
        try await Task.sleep(for: .milliseconds(60))
        XCTAssertEqual(sent, 0, "nothing posts during the Undo window")
        try await Task.sleep(for: .milliseconds(250))
        XCTAssertEqual(sent, 1)
        XCTAssertNil(hold.current)
    }

    func testTheApprovalIsSentFromATaskThatIsNotCancelled() async throws {
        // URLSession fails a cancelled task's request, so a send from a cancelled task never reaches GitHub.
        let hold = ApprovalHold()
        var sentWhileCancelled: Bool?
        hold.hold(key, label: "Approving", duration: .milliseconds(50), send: { sentWhileCancelled = Task.isCancelled }, onUndo: {}, onFailure: { _ in })
        try await Task.sleep(for: .milliseconds(200))
        XCTAssertEqual(sentWhileCancelled, false)
    }

    func testUndoCancelsTheSendAndBringsThePullRequestBack() async throws {
        let hold = ApprovalHold()
        var sent = 0
        var undone = 0
        hold.hold(key, label: "Approving", duration: .milliseconds(100), send: { sent += 1 }, onUndo: { undone += 1 }, onFailure: { _ in })
        XCTAssertTrue(hold.undo())
        try await Task.sleep(for: .milliseconds(250))
        XCTAssertEqual(sent, 0)
        XCTAssertEqual(undone, 1)
        XCTAssertFalse(hold.undo(), "nothing left to undo")
    }

    func testApprovingAgainReplacesTheEarlierHold() async throws {
        let hold = ApprovalHold()
        var sent: [String] = []
        hold.hold(key, label: "first", duration: .milliseconds(100), send: { sent.append("first") }, onUndo: {}, onFailure: { _ in })
        hold.hold(key, label: "second", duration: .milliseconds(100), send: { sent.append("second") }, onUndo: {}, onFailure: { _ in })
        XCTAssertEqual(hold.pending.count, 1)
        try await Task.sleep(for: .milliseconds(300))
        XCTAssertEqual(sent, ["second"])
    }

    func testARefusedApprovalReportsItsError() async throws {
        let hold = ApprovalHold()
        var failure: String?
        hold.hold(key, label: "Approving", duration: .milliseconds(50), send: { throw APIError.network("refused") }, onUndo: {}, onFailure: { failure = "\($0)" })
        try await Task.sleep(for: .milliseconds(200))
        XCTAssertNotNil(failure)
    }

    // MARK: - Drafts

    func testDraftSendsLineCommentsInFileAndLineOrder() {
        var draft = ReviewDraft(body: "Looks good")
        draft.set("second", path: "b.ts", anchor: DiffAnchor(line: 9, side: .right))
        draft.set("first", path: "a.ts", anchor: DiffAnchor(line: 41, side: .right))
        draft.set("old", path: "a.ts", anchor: DiffAnchor(line: 3, side: .left))
        XCTAssertEqual(draft.lineComments.map(\.body), ["old", "first", "second"])
        XCTAssertEqual(draft.lineComments.first?.side, .left)
        draft.set("  ", path: "b.ts", anchor: DiffAnchor(line: 9, side: .right))
        XCTAssertEqual(draft.lineComments.count, 2, "an empty comment removes the draft")
        XCTAssertNil(draft.comments["b.ts"])
    }
}
