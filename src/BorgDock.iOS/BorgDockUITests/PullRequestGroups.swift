import XCTest

/// The pull request list remembers folded groups between launches; tests start from a known state. The bar's button
/// says Fold all until every group is folded, then Unfold all.
extension XCUIApplication {
    /// Launch arguments that start the list on All without filters or a saved view: the list keeps them between
    /// launches, and the app reads them once at start.
    static let freshPullRequestList = ["-prs.view", "all", "-prs.query", "", "-prs.activeView", ""]

    @MainActor
    func foldEveryPullRequestGroup() {
        let button = foldAllButton()
        if button.label == "Fold all" { button.tap() }
    }

    /// Folding first opens every group on the second tap, even when only some were folded.
    @MainActor
    func unfoldEveryPullRequestGroup() {
        foldEveryPullRequestGroup()
        foldAllButton().tap()
        sleep(1)
    }

    /// Display → Group by: the list's grouping is kept between launches, so a test that needs one picks it.
    @MainActor
    func groupPullRequests(by grouping: String) {
        let display = buttons["prs-display"]
        XCTAssertTrue(display.waitForExistence(timeout: 15))
        display.tap()
        let menu = buttons["prs-display-group"]
        XCTAssertTrue(menu.waitForExistence(timeout: 5))
        menu.tap()
        let option = buttons[grouping]
        XCTAssertTrue(option.waitForExistence(timeout: 5))
        option.tap()
        buttons["Close"].tap()
        sleep(1)
    }

    @MainActor
    private func foldAllButton() -> XCUIElement {
        let button = buttons["prs-fold-all"]
        XCTAssertTrue(button.waitForExistence(timeout: 15))
        return button
    }
}
