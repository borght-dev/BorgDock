import XCTest

/// BorgDock Review's pull request list on its made-up data (`-BorgDockFixture`): no server and no network.
/// Set TEST_RUNNER_LEDGER_SHOTS to a folder to write the screenshots there as well as attaching them.
final class PullRequestsUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    private func launch(mode: String? = nil) -> XCUIApplication {
        XCUIDevice.shared.appearance = .light
        let app = XCUIApplication()
        app.launchArguments = ["-BorgDockFixture"]
        if let mode { app.launchArguments += ["-BorgDockFixtureMode", mode] }
        app.launch()
        return app
    }

    @MainActor
    private func capture(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let folder = ProcessInfo.processInfo.environment["LEDGER_SHOTS"] {
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name).png"))
        }
    }

    @MainActor
    func testHomeCanFilterGroupSortAndSaveAView() {
        let app = launch()
        let filter = app.buttons["prs-filter-sheet"]
        XCTAssertTrue(filter.waitForExistence(timeout: 15))
        capture("review-list-home")
        filter.tap()
        app.buttons["prs-filter-field-is"].tap()
        let draft = app.buttons["prs-filter-value-draft"]
        XCTAssertTrue(draft.waitForExistence(timeout: 5))
        draft.tap()
        capture("review-list-filter")
        let showResults = app.buttons["prs-filter-show"]
        showResults.tap()
        XCTAssertTrue(showResults.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["pr-row-acme/shop#411"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["pr-row-acme/shop#412"].exists)

        let display = app.buttons["prs-display"]
        display.tap()
        app.buttons["prs-display-group"].tap()
        app.buttons["Repository"].tap()
        app.buttons["prs-display-sort"].tap()
        app.buttons["Title"].tap()
        app.buttons["prs-display-dir-desc"].tap()
        capture("review-list-display")
        app.buttons["Close"].tap()
        XCTAssertTrue(app.buttons["prs-group-repo:acme/shop"].waitForExistence(timeout: 5))
        capture("review-list-grouped")

        display.tap()
        app.buttons["prs-display-group"].tap()
        app.buttons["No grouping"].tap()
        app.buttons["Close"].tap()
        let rateLimit = app.buttons["pr-row-acme/api#88"]
        let coupons = app.buttons["pr-row-acme/shop#411"]
        XCTAssertTrue(rateLimit.waitForExistence(timeout: 5))
        XCTAssertLessThan(rateLimit.frame.minY, coupons.frame.minY)

        app.buttons["prs-save-view"].tap()
        let name = app.textFields["prs-save-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.typeText("Draft queue")
        app.buttons["prs-save-confirm"].tap()
        let saved = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Draft queue'")).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 5))
        filter.tap()
        app.buttons["prs-filter-clear"].tap()
        app.buttons["prs-filter-show"].tap()
        let revert = app.buttons["prs-view-revert"]
        XCTAssertTrue(revert.waitForExistence(timeout: 5))
        revert.tap()
        XCTAssertTrue(coupons.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["pr-row-acme/shop#412"].exists)
    }

    @MainActor
    func testSettingsOpenFromTheList() {
        let app = launch()
        let settings = app.buttons["open-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 15))
        settings.tap()
        XCTAssertTrue(app.descendants(matching: .any)["account-koen"].waitForExistence(timeout: 10))
    }

    @MainActor
    func testOfflineRefreshKeepsTheListAndShowsItsStatus() {
        let app = launch(mode: "offline")
        let request = app.buttons["pr-row-acme/shop#412"]
        XCTAssertTrue(request.waitForExistence(timeout: 15))
        app.swipeDown()
        let offline = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'No connection.'")).firstMatch
        XCTAssertTrue(offline.waitForExistence(timeout: 15))
        XCTAssertTrue(request.exists)
    }
}
