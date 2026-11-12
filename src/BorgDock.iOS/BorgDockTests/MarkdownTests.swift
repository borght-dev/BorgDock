import XCTest
@testable import BorgDock

final class MarkdownBlockTests: XCTestCase {
    private func paragraph(_ text: String) -> MarkdownBlock { .paragraph(text) }
    private func item(_ text: String, task: Bool? = nil) -> MarkdownList.Item { MarkdownList.Item(task: task, blocks: [.paragraph(text)]) }

    func testHeadingsAtEveryLevelAndSetextUnderlines() {
        XCTAssertEqual(MarkdownParser.parse("# One\n###### Six ##\nTwo\n---\nAlso one\n==="), [
            .heading(level: 1, text: "One"),
            .heading(level: 6, text: "Six"),
            .heading(level: 2, text: "Two"),
            .heading(level: 1, text: "Also one"),
        ])
        XCTAssertEqual(MarkdownParser.parse("#hashtag"), [paragraph("#hashtag")])
    }

    func testLineBreaksInAParagraphStay() {
        XCTAssertEqual(MarkdownParser.parse("First line\nsecond line\n\nNext"), [paragraph("First line\nsecond line"), paragraph("Next")])
    }

    func testNestedListsAndOrderedStart() {
        let text = """
        - Receipts
          - PDF
          - Email
        - Invoices

        3. three
        4. four
        """
        XCTAssertEqual(MarkdownParser.parse(text), [
            .list(MarkdownList(ordered: false, items: [
                MarkdownList.Item(blocks: [paragraph("Receipts"), .list(MarkdownList(ordered: false, items: [item("PDF"), item("Email")]))]),
                item("Invoices"),
            ])),
            .list(MarkdownList(ordered: true, start: 3, items: [item("three"), item("four")])),
        ])
    }

    func testTaskListItemsKeepTheirBoxes() {
        XCTAssertEqual(MarkdownParser.parse("- [x] Three lines show € 12,40\n- [ ] Invoice export (needs staging)\n- [ ]"), [
            .list(MarkdownList(ordered: false, items: [
                item("Three lines show € 12,40", task: true),
                item("Invoice export (needs staging)", task: false),
                MarkdownList.Item(task: false, blocks: []),
            ])),
        ])
    }

    func testARuleIsNotAListAndAListInterruptsAParagraph() {
        XCTAssertEqual(MarkdownParser.parse("* * *\n\nIntro\n- one"), [.rule, paragraph("Intro"), .list(MarkdownList(ordered: false, items: [item("one")]))])
    }

    func testFencedCodeKeepsItsLinesAndLanguage() {
        XCTAssertEqual(MarkdownParser.parse("```ts\nconst total = 1;\n\n  return total;\n```\nafter"), [
            .code(language: "ts", text: "const total = 1;\n\n  return total;"),
            paragraph("after"),
        ])
    }

    func testQuotesHoldBlocksAndLazyLines() {
        XCTAssertEqual(MarkdownParser.parse("> the receipt can call it too\nlazily\n> - a list\n\nDone"), [
            .quote([paragraph("the receipt can call it too\nlazily"), .list(MarkdownList(ordered: false, items: [item("a list")]))]),
            paragraph("Done"),
        ])
    }

    func testPipeTablesPadShortRowsAndKeepEscapedPipes() {
        XCTAssertEqual(MarkdownParser.parse("| a | b |\n| - | :-: |\n| x \\| y |\n| 1 | 2 | 3 |"), [
            .table(MarkdownTable(header: ["a", "b"], rows: [["x \\| y", ""], ["1", "2"]])),
        ])
        XCTAssertEqual(MarkdownParser.parse("| not | a table |"), [paragraph("| not | a table |")])
    }

    func testHTMLTablesBecomeTables() {
        let html = "<table>\n<tr><th>Basket</th><th>After</th></tr>\n<tr><td>3 × € 4,133</td><td><b>€ 12,40</b></td></tr>\n</table>"
        XCTAssertEqual(MarkdownParser.parse(html), [.table(MarkdownTable(header: ["Basket", "After"], rows: [["3 × € 4,133", "<b>€ 12,40</b>"]]))])
    }

    func testDetailsFoldTheirRenderedContent() {
        let text = """
        <details>
        <summary>The old receipt</summary>

        - rounded per order
        <details><summary>Nested</summary>inner</details>
        </details>
        After
        """
        XCTAssertEqual(MarkdownParser.parse(text), [
            .details(summary: "The old receipt", content: [
                .list(MarkdownList(ordered: false, items: [item("rounded per order")])),
                .details(summary: "Nested", content: [paragraph("inner")]),
            ]),
            paragraph("After"),
        ])
    }

    func testImagesLeaveTheParagraphInOrder() {
        let text = "Before ![Basket](https://example.com/a.png) and <img src=\"/api/x.png\" alt=\"Receipt &amp; PDF\" width=\"300\">\n[![Linked](https://example.com/b.png)](https://example.com/b)"
        XCTAssertEqual(MarkdownParser.parse(text), [
            paragraph("Before  and"),
            .images([
                MarkdownImage(url: "https://example.com/a.png", alt: "Basket"),
                MarkdownImage(url: "/api/x.png", alt: "Receipt & PDF"),
                MarkdownImage(url: "https://example.com/b.png", alt: "Linked", link: "https://example.com/b"),
            ]),
        ])
        XCTAssertEqual(MarkdownParser.parse("<p align=\"center\">\n<img src=\"https://example.com/c.png\">\n</p>"), [.images([MarkdownImage(url: "https://example.com/c.png", alt: "")])])
    }

    func testBoldLinesReadAsHeadingsOnlyForChat() {
        XCTAssertEqual(MarkdownParser.parse("**What I did**", options: MarkdownParser.Options(boldLinesAsHeadings: true)), [.heading(level: 4, text: "What I did")])
        XCTAssertEqual(MarkdownParser.parse("**What I did**"), [paragraph("**What I did**")])
    }
}

final class MarkdownCleanupTests: XCTestCase {
    func testCommentsAndBotFootersGo() {
        let body = "Review summary\n<!-- hidden -->\n<!-- codesmith:footer -->\n[![Autofix](https://example.com/b.svg)](https://example.com)\n<!-- /codesmith:footer -->\nEnd"
        let result = MarkdownCleanup.clean(body)
        XCTAssertEqual(result.text, "Review summary\n\n\nEnd")
        XCTAssertTrue(result.removedFooter)
    }

    func testAFooterNeedsItsOwnClosingMarker() {
        let body = "<!-- codesmith:footer -->kept<!-- /other:footer -->"
        XCTAssertEqual(MarkdownCleanup.clean(body).text, "kept")
        XCTAssertFalse(MarkdownCleanup.clean(body).removedFooter)
    }

    func testLinkedImagesAtMostFortyHighAreBadges() {
        let body = "<a href=\"https://example.com\"><img src=\"https://example.com/badge.svg\" height=\"20\"></a> <a href=\"https://example.com/full\"><img src=\"https://example.com/shot.png\" height=\"400\"></a> <img src=\"https://example.com/icon.png\" height=\"16\">"
        let result = MarkdownCleanup.clean(body)
        XCTAssertEqual(result.removedBadges, 1)
        XCTAssertFalse(result.text.contains("badge.svg"))
        XCTAssertTrue(result.text.contains("shot.png"))
        XCTAssertTrue(result.text.contains("icon.png"), "An image that isn't linked isn't a badge")
    }
}

final class MarkdownInlineTests: XCTestCase {
    private func texts(_ pieces: [InlinePiece]) -> [String] {
        pieces.map { piece in
            switch piece {
            case .text(let text): String(text.characters)
            case .code(let code): "`\(code)`"
            case .workItem(let id): "[AB#\(id)]"
            }
        }
    }

    func testCodeAndWorkItemsBecomeTheirOwnPieces() {
        XCTAssertEqual(texts(MarkdownInline.pieces("`lineTotal()` replaces it, see AB#61021.")), ["`lineTotal()`", " replaces it, see ", "[AB#61021]", "."])
    }

    func testInlineHTMLBecomesMarkdown() {
        XCTAssertEqual(MarkdownInline.markdownFromHTML("<b>Nit:</b> <code>a &lt; b</code><br>next <a href=\"https://example.com\">link</a> <sub>x</sub>"),
                       "**Nit:** `a < b`\nnext [link](https://example.com) x")
        XCTAssertEqual(MarkdownInline.markdownFromHTML("`<div>` stays"), "`<div>` stays")
    }

    func testBoldItalicStrikeAndLinks() throws {
        let pieces = MarkdownInline.pieces("**bold** *it* ~~old~~ [site](https://example.com)")
        guard case .text(let text) = try XCTUnwrap(pieces.first) else { return XCTFail("Expected text") }
        let intents = text.runs.compactMap(\.inlinePresentationIntent)
        XCTAssertTrue(intents.contains(.stronglyEmphasized))
        XCTAssertTrue(intents.contains(.emphasized))
        XCTAssertTrue(intents.contains(.strikethrough))
        XCTAssertEqual(text.runs.compactMap(\.link), [URL(string: "https://example.com")!])
    }

    func testMentionsAreBoldButAddressesAreNot() throws {
        guard case .text(let text) = try XCTUnwrap(MarkdownInline.pieces("thanks @priya-shah, mail me@example.com").first) else { return XCTFail("Expected text") }
        let bold = text.runs.filter { $0.inlinePresentationIntent?.contains(.stronglyEmphasized) == true }.map { String(text[$0.range].characters) }
        XCTAssertEqual(bold, ["@priya-shah"])
    }

    func testBareURLsAreLinked() throws {
        guard case .text(let text) = try XCTUnwrap(MarkdownInline.pieces("See https://example.com/run/2214.").first) else { return XCTFail("Expected text") }
        XCTAssertEqual(text.runs.compactMap(\.link), [URL(string: "https://example.com/run/2214")!])
    }

    func testLinksOpenInTheAppOrInSafari() {
        XCTAssertEqual(MarkdownLinks.destination(URL(string: "borgdock://item/61021")!), .workItem(61021))
        XCTAssertEqual(MarkdownLinks.destination(URL(string: "https://github.com/acme/shop/pull/412/files")!), .pullRequest(PrKey(owner: "acme", repo: "shop", number: 412)))
        XCTAssertEqual(MarkdownLinks.destination(URL(string: "https://github.com/acme/shop/issues/9")!), .external(URL(string: "https://github.com/acme/shop/issues/9")!))
        XCTAssertEqual(MarkdownLinks.destination(URL(string: "borgdock://tab/prs")!), .app(URL(string: "borgdock://tab/prs")!))
    }
}
