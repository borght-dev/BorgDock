import XCTest

/// The Work tab and a work item against the sample server (`PORT=8801 node e2e/ui-fixture.mjs`, or set
/// TEST_RUNNER_FIXTURE_SERVER to another address). Set TEST_RUNNER_I1_SHOTS to a folder to keep the PNGs.
final class WorkUITests: XCTestCase {
    @MainActor
    private func launch(_ route: String) -> XCUIApplication {
        let server = ProcessInfo.processInfo.environment["FIXTURE_SERVER"] ?? "http://localhost:8801"
        let app = XCUIApplication()
        app.launchArguments = ["-BorgDockServer", server, "-BorgDockToken", "sample-token-for-fixture-only-123", "-BorgDockRoute", route]
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
        if let folder = ProcessInfo.processInfo.environment["I1_SHOTS"] {
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name).png"))
        }
    }

    @MainActor
    func testLanesFoldSwipeAndScopes() {
        XCUIDevice.shared.appearance = .light
        let app = launch("tab/work")
        XCTAssertTrue(app.buttons["walk-item-61021"].waitForExistence(timeout: 20), "Testing Failed opens by default")
        capture("work")

        let codeReview = app.buttons["folded-Code Review"]
        if codeReview.exists { codeReview.tap() }
        let row = app.buttons["walk-item-61055"]
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.swipeLeft()
        XCTAssertTrue(app.buttons["Up next"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Agent"].exists)
        capture("work-swipe")
        app.buttons["Up next"].tap()

        app.swipeUp()
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Agents without an item"].waitForExistence(timeout: 5))
        capture("work-bottom")

        app.swipeDown()
        app.swipeDown()
        app.buttons["work-show"].tap()
        XCTAssertTrue(app.buttons["work-lane-order"].waitForExistence(timeout: 5))
        sleep(2)
        capture("work-show")
        app.buttons["Verdict"].tap()
        app.buttons["Close"].tap()
        XCTAssertTrue(app.buttons["lane-Needs you"].waitForExistence(timeout: 5))
        capture("work-by-verdict")
        app.buttons["work-show"].tap()
        app.buttons["State"].tap()
        app.buttons["Close"].tap()
    }

    @MainActor
    func testAnItemPostsAComment() {
        XCUIDevice.shared.appearance = .light
        let app = launch("item/61021/activity")
        let field = app.descendants(matching: .any)["item-comment"]
        XCTAssertTrue(field.waitForExistence(timeout: 20), "the reply box shows while Activity is on screen")
        field.tap()
        field.typeText("Rounding per line is in the export too.")
        app.buttons["Send comment"].tap()
        XCTAssertTrue(app.staticTexts["Rounding per line is in the export too."].waitForExistence(timeout: 10))
        capture("item-commented")
    }
}
