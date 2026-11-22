import XCTest
@testable import BorgDock

/// The cases of the server's `test/ado-markdown.test.ts`, input for input: both sides turn ADO's HTML into the same
/// markdown. Add a case on both sides.
final class AdoMarkdownTests: XCTestCase {
    private func md(_ html: String) -> String {
        AdoMarkdown.from(html: html) { $0.hasPrefix("https://") ? $0 : nil }
    }

    func testDivsAndParagraphsBecomeParagraphsBrIsAHardBreakEmptyLinesGo() {
        XCTAssertEqual(
            md("<div>Open the basket.</div><div><br></div><div>Pay with iDEAL.<br>Wait for the receipt.</div><p>&nbsp;</p>"),
            "Open the basket.\n\nPay with iDEAL.  \nWait for the receipt."
        )
    }

    func testHeadingsBoldItalicUnderlineStrikeAndInlineCode() {
        XCTAssertEqual(
            md("<h2>Steps</h2><div><b>Bold</b> <i>italic</i> <u>under</u> <s>gone</s> <code>orderTotal()</code></div>"),
            "## Steps\n\n**Bold** *italic* **under** ~~gone~~ `orderTotal()`"
        )
        XCTAssertEqual(md("<div>a<b> b </b>c</div>"), "a **b** c", "spaces stay outside the markers")
        XCTAssertEqual(md("<div><b>outer <strong>inner</strong></b></div>"), "**outer inner**", "bold inside bold is bold once")
    }

    func testLinksKeepTheirTargetUnsafeOrEmptyOnesKeepOnlyTheirText() {
        XCTAssertEqual(md(#"<div>See <a href="https://example.com/runbook">the runbook</a>.</div>"#), "See [the runbook](https://example.com/runbook).")
        XCTAssertEqual(md(#"<a href="javascript:alert(1)">click</a>"#), "click")
        XCTAssertEqual(md(#"<a href="https://example.com/a b">space</a>"#), "[space](<https://example.com/a b>)")
    }

    func testListsOrderedWithTheirStartNestedBothWaysAdoWritesThem() {
        XCTAssertEqual(md("<ul><li>Basket</li><li>Receipt<ul><li>PDF</li><li>Email</li></ul></li></ul>"), "- Basket\n- Receipt\n  - PDF\n  - Email")
        XCTAssertEqual(md("<ol><li>Add three lines</li><ol><li>each € 4,133</li></ol><li>Check out</li></ol>"), "1. Add three lines\n   1. each € 4,133\n2. Check out")
        XCTAssertEqual(md(#"<ol start="3"><li>Third</li><li>Fourth</li></ol>"#), "3. Third\n4. Fourth")
        XCTAssertEqual(md("<ul><li>one<li>two</ul>"), "- one\n- two", "an unclosed li closes at the next")
    }

    func testTablesTheFirstRowIsTheHeaderCellsEscapePipesAndKeepTheirLines() {
        let html = "<table><tbody><tr><td><b>Where</b></td><td>Expected</td><td>Actual</td></tr><tr><td>Basket</td><td>€ 12,40</td><td>€ 12,40</td></tr>"
            + "<tr><td>Invoice</td><td>€ 12,40</td><td><div>€ 12,39</div><div>a | b</div></td></tr></tbody></table>"
        XCTAssertEqual(md(html), [
            "| **Where** | Expected | Actual |",
            "| --- | --- | --- |",
            "| Basket | € 12,40 | € 12,40 |",
            "| Invoice | € 12,40 | € 12,39<br>a \\| b |",
        ].joined(separator: "\n"))
        XCTAssertEqual(md("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td></tr></table>"), "| A | B |\n| --- | --- |\n| 1 |  |", "short rows are padded")
    }

    func testQuotesCodeBlocksAndRules() {
        XCTAssertEqual(md("<blockquote><div>Line one</div><div>Line two</div></blockquote>"), "> Line one\n>\n> Line two")
        XCTAssertEqual(md("<pre>const a = 1;\n  return a;</pre>"), "```\nconst a = 1;\n  return a;\n```")
        XCTAssertEqual(md("<div>above</div><hr><div>below</div>"), "above\n\n---\n\nbelow")
    }

    func testImagesGoWhereTheResolverSaysTheRestOfTheTextStays() {
        let signed = AdoMarkdown.from(
            html: #"<div>Before:<br><img src="https://dev.azure.com/acme/0f1e/_apis/wit/attachments/1b4e28ba-2fa1-11d2-883f-0016d3cca427?fileName=invoice.png" alt="invoice"></div><img src="data:image/png;base64,AAAA">"#
        ) { $0.contains("/_apis/wit/attachments/") ? "/api/items/61021/attachments/1b4e28ba-2fa1-11d2-883f-0016d3cca427?name=invoice.png&exp=1&sig=x" : nil }
        XCTAssertEqual(signed, "Before:  \n![invoice](/api/items/61021/attachments/1b4e28ba-2fa1-11d2-883f-0016d3cca427?name=invoice.png&exp=1&sig=x)")
    }

    func testEntitiesDecodeAndTextThatWouldReadAsMarkdownStaysText() {
        XCTAssertEqual(md("<div>Tom &amp; Jerry &lt;3 &quot;quotes&quot; &#8364; &#x20AC; &rsquo;</div>"), "Tom & Jerry \\<3 \"quotes\" € € ’")
        XCTAssertEqual(
            md("<div># not a heading</div><div>1. not a list</div><div>- nor this</div><div>*stars* and [brackets] and `ticks`</div>"),
            "\\# not a heading\n\n1\\. not a list\n\n\\- nor this\n\n\\*stars\\* and \\[brackets\\] and \\`ticks\\`"
        )
        XCTAssertEqual(md("<div>snake_case stays, _leading goes</div>"), "snake_case stays, \\_leading goes")
    }

    func testCommentsScriptsAndStylesAreDroppedASpanAroundBlocksKeepsTheirLines() {
        XCTAssertEqual(md("<!-- note --><style>.a{}</style><script>x()</script><div>Kept</div>"), "Kept")
        XCTAssertEqual(md(#"<span style="color:red"><div>first</div><div>second</div></span>"#), "first\n\nsecond")
        XCTAssertEqual(md(""), "")
        XCTAssertEqual(md("plain text only"), "plain text only")
    }

    // MARK: Only here

    func testWithoutAResolverOnlyHttpsImagesStay() {
        let html = #"<img src="https://example.com/a.png" alt="a"><img src="http://example.com/b.png"><img src="data:image/png;base64,AAAA"><img src="/relative.png">"#
        XCTAssertEqual(AdoMarkdown.from(html: html), "![a](https://example.com/a.png)")
        XCTAssertEqual(AdoMarkdown.from(html: nil), "")
    }

    func testAWindowsLineEndSplitsLikeAnyOther() {
        XCTAssertEqual(md("<pre>first\r\nsecond</pre>"), "```\nfirst\r\nsecond\n```")
        XCTAssertEqual(md("<blockquote><pre>a\r\nb</pre></blockquote>"), "> ```\n> a\r\n> b\n> ```", "Swift reads \\r\\n as one character; the quote still marks both lines")
    }

    func testPlainTextKeepsOneLinePerBlockAndABulletPerListItem() {
        XCTAssertEqual(AdoHtml.text("<div>Totals are off by a cent.<br><img src=\"https://example.com/a.png\"></div>"), "Totals are off by a cent.")
        XCTAssertEqual(AdoHtml.text("<ul><li>one</li><li>two</li></ul>"), "• one\n• two")
        XCTAssertEqual(AdoHtml.text("<p>Tom &amp; Jerry&nbsp;&lt;3 &#39;quoted&#39; &#8364;</p><p></p><p></p><p>Next</p>"), "Tom & Jerry <3 'quoted' €\n\nNext")
        XCTAssertEqual(AdoHtml.text(nil), "")
    }
}
