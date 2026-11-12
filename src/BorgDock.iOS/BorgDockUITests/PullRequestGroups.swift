import XCTest

/// The pull request list remembers folded groups between launches; tests start from a known state. The bar's button
/// says Fold all until every group is folded, then Unfold all.
extension XCUIApplication {
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

    @MainActor
    private func foldAllButton() -> XCUIElement {
        let button = buttons["prs-fold-all"]
        XCTAssertTrue(button.waitForExistence(timeout: 15))
        return button
    }
}
