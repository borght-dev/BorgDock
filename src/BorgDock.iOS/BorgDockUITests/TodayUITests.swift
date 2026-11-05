import XCTest

/// Screenshots of Today, Sprint, Work and Pull requests in both appearances. Runs against the sample server
/// (`PORT=8801 node e2e/ui-fixture.mjs`); set TEST_RUNNER_I1_SHOTS to a folder to write the PNGs there as well.
final class TodayUITests: XCTestCase {
    @MainActor
    private func launch(_ route: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-BorgDockServer", "http://localhost:8801", "-BorgDockToken", "sample-token-for-fixture-only-123", "-BorgDockRoute", route]
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

    /// The tab bar shrinks while a list scrolls; a swipe down brings its buttons back.
    @MainActor
    private func tab(_ app: XCUIApplication, _ title: String) {
        if !app.tabBars.buttons[title].waitForExistence(timeout: 2) {
            app.swipeDown()
            sleep(1)
        }
        let button = app.tabBars.buttons[title].exists ? app.tabBars.buttons[title] : app.buttons[title]
        button.tap()
        sleep(2)
    }

    @MainActor
    func testTodaySprintWorkAndPullRequests() {
        XCUIDevice.shared.appearance = .dark
        let app = launch("tab/today")
        let sprint = app.buttons["today-sprint"]
        XCTAssertTrue(sprint.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Up next"].waitForExistence(timeout: 10))
        sleep(2)
        capture("today")

        sprint.tap()
        XCTAssertTrue(app.staticTexts["items to go"].waitForExistence(timeout: 10))
        sleep(1)
        capture("sprint")
        app.swipeUp()
        sleep(1)
        capture("sprint-scrolled")
        app.buttons["sprint-watch-In review 2+ days"].tap()
        sleep(1)
        capture("sprint-list")
        app.navigationBars.buttons.firstMatch.tap()
        sleep(1)

        tab(app, "Work")
        capture("work")
        tab(app, "Pull requests")
        capture("prs")

        XCUIDevice.shared.appearance = .light
        sleep(1)
        capture("prs-light")
        tab(app, "Work")
        capture("work-light")
        tab(app, "Today")
        capture("today-light")
        tab(app, "Sprint")
        app.swipeDown()
        sleep(1)
        capture("sprint-light")
        XCUIDevice.shared.appearance = .dark
    }

    @MainActor
    func testWorkSortsByStatusAndByYourLaneOrder() {
        XCUIDevice.shared.appearance = .dark
        let app = launch("tab/work")
        let sort = app.buttons["work-sort"]
        XCTAssertTrue(sort.waitForExistence(timeout: 15))
        sort.tap()
        app.buttons["By status"].tap()
        sleep(2)
        capture("work-by-status")
        sort.tap()
        app.buttons["Lane order…"].tap()
        XCTAssertTrue(app.buttons["lane-order-done"].waitForExistence(timeout: 5))
        sleep(1)
        capture("work-lane-order")
        app.buttons["lane-order-done"].tap()
        sort.tap()
        app.buttons["By state"].tap()
    }
}
