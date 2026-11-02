import XCTest
@testable import BorgDock

/// The vault's rules: references found in note text, BorgDock's marker blocks, the daily note, quick captures,
/// task ticks, and never writing over text you haven't read.
final class NotesTests: XCTestCase {
    private var folder: URL!
    private var vault: Vault!
    private let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    override func setUpWithError() throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("vault-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        vault = Vault(root: folder)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: folder)
    }

    // MARK: Reference chips

    func testFindsWorkItemsAndPullRequestsInText() {
        let refs = NoteText.refs(in: "Merged shop#3690 and borght-dev/BorgDock#106; AB#61002 moved. See ab#7 too.")
        XCTAssertEqual(refs, [
            .pullRequest(owner: nil, repo: "shop", number: 3690),
            .pullRequest(owner: "borght-dev", repo: "BorgDock", number: 106),
            .item(id: 61002),
            .item(id: 7),
        ])
    }

    func testIgnoresReferencesInsideCodeAndAfterWordCharacters() {
        XCTAssertEqual(NoteText.refs(in: "`shop#1` and #3712 alone and AB#12x and xAB#5"), [.pullRequest(owner: nil, repo: "xAB", number: 5)], "as on the desktop, xAB#5 reads as a repository")
    }

    func testReadsAddressesAsReferences() {
        let refs = NoteText.refs(in: "https://github.com/shop/shop/pull/3712 and https://dev.azure.com/acme/Shop/_workitems/edit/61044.")
        XCTAssertEqual(refs, [.pullRequest(owner: "shop", repo: "shop", number: 3712), .item(id: 61044)])
    }

    func testReadsThreadAndWorkstreamLinks() {
        let spans = NoteText.spans("[Fix it](t3code://threads/env-1/thread%201) for [Checkout](borgdock://workstreams/ws-1)")
        XCTAssertEqual(spans.first, .ref(.thread(environmentId: "env-1", threadId: "thread 1", label: "Fix it")))
        XCTAssertEqual(spans.last, .ref(.workstream(id: "ws-1", label: "Checkout")))
    }

    func testSplitsALineIntoTextChipsAndWikilinks() {
        XCTAssertEqual(NoteText.spans("Read [[Offline basket decisions|the notes]] on AB#1 now"), [
            .text("Read "),
            .wikilink(target: "Offline basket decisions", label: "the notes"),
            .text(" on "),
            .ref(.item(id: 1)),
            .text(" now"),
        ])
    }

    func testResolveKeysFollowTheContract() {
        XCTAssertEqual(NoteRef.pullRequest(owner: "Shop", repo: "Shop", number: 12).resolveKey, "gh:github.com/shop/shop#12")
        XCTAssertEqual(NoteRef.pullRequest(owner: nil, repo: "shop", number: 12).resolveKey, "shop#12")
        XCTAssertEqual(NoteRef.item(id: 61044).resolveKey, "AB#61044")
        XCTAssertEqual(NoteRef.thread(environmentId: "e", threadId: "t", label: "").resolveKey, "t3:e/t")
    }

    // MARK: Blocks and markers

    func testFoldsTheHeadingAboveBorgDocksBlockIntoIt() {
        let text = """
        # Friday 30 October

        ## Since yesterday
        <!-- borgdock:since 2026-10-30 -->
        - Merged shop#3690
        <!-- /borgdock:since 2026-10-30 -->

        - [x] Done thing
        - [ ] Open thing
        """
        let blocks = NoteText.blocks(text)
        XCTAssertEqual(blocks[1], .borgdock(id: "since 2026-10-30", title: "Since yesterday", lines: ["- Merged shop#3690"], line: 3))
        XCTAssertEqual(NoteText.tasks(text).map(\.text), ["Done thing", "Open thing"])
    }

    func testANewDailyNoteGetsTheDigestBetweenMarkers() {
        let date = utc.date(from: DateComponents(year: 2026, month: 10, day: 30, hour: 9))!
        let digest = Digest(since: "", lines: [Digest.Line(text: "Merged shop#3690", refs: ["shop#3690"]), Digest.Line(text: "CI broke", refs: ["shop#3712"])])
        let text = NoteEdits.dailyText(date: date, digest: digest, template: nil, calendar: utc)
        XCTAssertEqual(text, """
        # Friday 30 October

        ## Since yesterday
        <!-- borgdock:since 2026-10-30 -->
        - Merged shop#3690
        - shop#3712 · CI broke
        <!-- /borgdock:since 2026-10-30 -->

        """)
        XCTAssertTrue(NoteEdits.hasMarkerBlock(text, id: "since 2026-10-30"))
    }

    func testANewDailyNoteWithoutNewsHasNoBlock() {
        let date = utc.date(from: DateComponents(year: 2026, month: 10, day: 30, hour: 9))!
        XCTAssertFalse(NoteEdits.dailyText(date: date, digest: nil, template: nil, calendar: utc).contains("borgdock:"))
    }

    func testTheDigestStartsAtThePreviousDailyNoteAtMostAWeekBack() {
        let today = utc.date(from: DateComponents(year: 2026, month: 10, day: 30, hour: 9))!
        let since = NoteEdits.digestSince(paths: ["Daily/2026-10-28.md", "Daily/2026-10-30.md", "Ideas.md"], today: today, calendar: utc)
        XCTAssertEqual(since, utc.date(from: DateComponents(year: 2026, month: 10, day: 28)))
        let old = NoteEdits.digestSince(paths: ["Daily/2026-09-01.md"], today: today, calendar: utc)
        XCTAssertEqual(old, today.addingTimeInterval(-7 * 24 * 3600))
        XCTAssertEqual(NoteEdits.digestSince(paths: [], today: today, calendar: utc), today.addingTimeInterval(-24 * 3600))
    }

    func testACaptureLandsUnderCapturedWithItsLink() {
        let at = utc.date(from: DateComponents(year: 2026, month: 10, day: 30, hour: 14, minute: 5))!
        let context = CaptureContext(kind: .pr, key: "shop/shop#3712", title: "", at: at)
        let lines = NoteEdits.captureLines("Tom: keep the basket\nAdd 3DS", at: at, context: context, calendar: utc)
        XCTAssertEqual(lines, ["- 14:05 Tom: keep the basket · shop/shop#3712", "  Add 3DS"])
        let note = "# Today\n\n## Captured\n- 09:00 First\n\n## Ideas\nOne\n"
        XCTAssertEqual(NoteEdits.withCapture(note, lines: lines), "# Today\n\n## Captured\n- 09:00 First\n- 14:05 Tom: keep the basket · shop/shop#3712\n  Add 3DS\n\n## Ideas\nOne\n")
        XCTAssertEqual(NoteEdits.withCapture("# Today\n", lines: ["- x"]), "# Today\n\n## Captured\n- x\n")
    }

    func testTicksTheTaskEvenWhenItMoved() {
        let text = "Intro\n- [ ] Ask Tom\r\n- [ ] Read notes"
        XCTAssertEqual(NoteEdits.setTask(text.replacingOccurrences(of: "\r\n", with: "\n"), line: 5, task: "Read notes", done: true), "Intro\n- [ ] Ask Tom\n- [x] Read notes")
        XCTAssertNil(NoteEdits.setTask("- [x] Done", line: 0, task: "Done", done: true))
    }

    func testTitlesBecomeSafeUniqueFileNames() {
        XCTAssertEqual(NoteEdits.safeTitle("a/b: c?"), "a b c")
        XCTAssertEqual(NoteEdits.uniquePath(folder: "", title: "Ideas", taken: ["ideas.md", "Ideas 2.md"]), "Ideas 3.md")
    }

    // MARK: The vault on disk

    func testNeverWritesOverTextItHasntRead() throws {
        try vault.create("Note.md", text: "one")
        XCTAssertEqual(try vault.write("Note.md", text: "mine", base: "one"), .written("mine"))
        // Another device changed it after we read "one".
        try Data("theirs".utf8).write(to: folder.appendingPathComponent("Note.md"))
        XCTAssertEqual(try vault.write("Note.md", text: "mine again", base: "mine"), .conflict(current: "theirs"))
        XCTAssertEqual(try vault.read("Note.md"), "theirs")
        XCTAssertThrowsError(try vault.create("Note.md", text: "new"))
    }

    func testUpdateAppliesTheChangeToTheFreshText() throws {
        try vault.create("Daily/2026-10-30.md", text: "# Day\n")
        try Data("# Day\n\nAdded elsewhere\n".utf8).write(to: folder.appendingPathComponent("Daily/2026-10-30.md"))
        let result = try vault.update("Daily/2026-10-30.md") { NoteEdits.withCapture($0 ?? "", lines: ["- x"]) }
        XCTAssertEqual(result, "# Day\n\nAdded elsewhere\n\n## Captured\n- x\n")
    }

    func testRefusesPathsOutsideTheVault() {
        XCTAssertThrowsError(try vault.url(for: "../escape.md"))
        XCTAssertThrowsError(try vault.url(for: ".obsidian/x.md"))
        XCTAssertThrowsError(try vault.url(for: "notes.txt"))
    }

    func testListsMarkdownNotesOnly() throws {
        try vault.create("A.md", text: "")
        try vault.create("Daily/2026-10-30.md", text: "")
        try FileManager.default.createDirectory(at: folder.appendingPathComponent(".trash"), withIntermediateDirectories: true)
        try Data().write(to: folder.appendingPathComponent(".trash/Old.md"))
        try Data().write(to: folder.appendingPathComponent("image.png"))
        XCTAssertEqual(Set(vault.list().map(\.path)), ["A.md", "Daily/2026-10-30.md"])
    }
}
