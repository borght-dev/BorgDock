import XCTest

/// The pull request page's taps on acme/shop #412: a `<details>` fold, a bot's folded summary, the Comments chip that
/// swaps the bottom bar for the reply box, and an AB# chip in the description. Runs against the sample server
/// (`PORT=8801 node e2e/ui-fixture.mjs`); TEST_RUNNER_FIXTURE_URL points it at another port, TEST_RUNNER_I1_SHOTS to a
/// folder writes the opened states there.
final class PullRequestPageUITests: XCTestCase {
    @MainActor
    func testFoldsOpenTheCommentsBringTheReplyBoxAndAChipOpensTheItem() {
        let app = XCUIApplication()
        let server = ProcessInfo.processInfo.environment["FIXTURE_URL"] ?? "http://localhost:8801"
        app.launchArguments = ["-BorgDockServer", server, "-BorgDockToken", "fixture", "-BorgDockRoute", "i1/pr/description/acme/shop/412"]
        app.launch()

        let details = app.buttons["The old receipt"]
        XCTAssertTrue(details.waitForExistence(timeout: 20))
        details.tap()
        XCTAssertTrue(app.staticTexts["3 × 4,133 = 12,399 → € 12,39"].waitForExistence(timeout: 5))
        capture("pr-details-open")

        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Comments'")).firstMatch.tap()
        XCTAssertTrue(app.buttons["Send"].waitForExistence(timeout: 5), "The Comments chip shows the reply box")

        let fold = app.buttons.matching(NSPredicate(format: "label CONTAINS 'review summary'")).firstMatch
        XCTAssertTrue(fold.waitForExistence(timeout: 5))
        fold.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'and the basket now share'")).firstMatch.waitForExistence(timeout: 5))
        capture("pr-bot-summary-open")

        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Description'")).firstMatch.tap()
        let chip = app.links.matching(NSPredicate(format: "label CONTAINS 'AB#61021'")).firstMatch
        XCTAssertTrue(chip.waitForExistence(timeout: 5))
        chip.tap()
        XCTAssertTrue(app.buttons["Start review"].waitForNonExistence(timeout: 5), "The chip opens the work item")
    }

    @MainActor
    private func capture(_ name: String) {
        sleep(1)
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let folder = ProcessInfo.processInfo.environment["I1_SHOTS"] {
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name).png"))
        }
    }
}
