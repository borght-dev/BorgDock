import XCTest
@testable import BorgDock

final class ChatMarkdownTests: XCTestCase {
    func testATableKeepsItsRowsAndColumns() {
        let text = """
        Updated Developer Notes on all ten.

        | Item | State now | Evidence recorded |
        |---|:--|---|
        | AB#60950 | Testing Failed | QA found the refund rounding off by one cent |
        | AB#61002 | **Ready For QA** | Both pull requests merged |
        Verification: tracker reconciliation only.
        """
        XCTAssertEqual(ChatBlock.parse(text), [
            .paragraph("Updated Developer Notes on all ten."),
            .table(header: ["Item", "State now", "Evidence recorded"], rows: [
                ["AB#60950", "Testing Failed", "QA found the refund rounding off by one cent"],
                ["AB#61002", "**Ready For QA**", "Both pull requests merged"],
            ]),
            .paragraph("Verification: tracker reconciliation only."),
        ])
    }

    func testShortRowsArePaddedAndEscapedPipesStayInTheirCell() {
        let blocks = ChatBlock.parse("| a | b |\n| - | - |\n| x \\| y |\n")
        XCTAssertEqual(blocks, [.table(header: ["a", "b"], rows: [["x | y", ""]])])
    }

    func testPipesWithoutADelimiterRowStayText() {
        XCTAssertEqual(ChatBlock.parse("| not | a table |"), [.paragraph("| not | a table |")])
    }

    func testQuotesAndRules() {
        XCTAssertEqual(ChatBlock.parse("> Waiting on QA\n> since Monday\n\n---\n- item"), [
            .quote("Waiting on QA since Monday"),
            .rule,
            .list(["item"], numbered: false),
        ])
    }

    func testNarrowColumnsKeepTheirWidthAndWideOnesShareTheRest() {
        XCTAssertEqual(TableLayout.share(300, ideal: [80, 180, 500], minimum: 64), [80, 110, 110])
        XCTAssertEqual(TableLayout.share(300, ideal: [200, 200], minimum: 64), [150, 150])
    }
}
