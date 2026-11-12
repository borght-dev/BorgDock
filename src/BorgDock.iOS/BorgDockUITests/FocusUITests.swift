import XCTest

/// Screenshots of Focus, Sprint, Work and Pull requests in both appearances. Runs against the sample server
/// (`PORT=8801 node e2e/ui-fixture.mjs`); set TEST_RUNNER_I1_SHOTS to a folder to write the PNGs there as well.
final class FocusUITests: XCTestCase {
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
    func testFocusSprintWorkAndPullRequests() {
        XCUIDevice.shared.appearance = .dark
        let app = launch("tab/today")
        XCTAssertTrue(app.buttons["focus-start-review"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Your turn"].waitForExistence(timeout: 10))
        sleep(2)
        capture("focus")

        let sprint = app.buttons["focus-sprint"]
        for _ in 0..<4 where !sprint.isHittable { app.swipeUp() }
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
        tab(app, "Focus")
        capture("focus-light")
        tab(app, "Sprint")
        app.swipeDown()
        sleep(1)
        capture("sprint-light")
        XCUIDevice.shared.appearance = .dark
    }

    /// An agent row opens the pull request its branch belongs to; the folded and open groups, Display and Repositories.
    @MainActor
    func testAgentRowOpensItsPullRequestAndTheListFolds() {
        XCUIDevice.shared.appearance = .light
        let app = launch("tab/today")
        let agent = app.descendants(matching: .any)["focus-agent-sample-70412"]
        XCTAssertTrue(agent.waitForExistence(timeout: 15))
        agent.tap()
        XCTAssertTrue(app.navigationBars.buttons.firstMatch.waitForExistence(timeout: 10))
        sleep(2)
        capture("focus-agent-opens-pr")
        app.navigationBars.buttons.firstMatch.tap()

        tab(app, "Pull requests")
        app.foldEveryPullRequestGroup()
        let priya = app.buttons["prs-group-author:priyashah"]
        XCTAssertTrue(priya.waitForExistence(timeout: 5))
        priya.tap()
        XCTAssertTrue(app.buttons["prs-review-all-author:priyashah"].waitForExistence(timeout: 5))
        sleep(1)
        capture("prs-one-group-open")

        app.buttons["prs-display"].tap()
        XCTAssertTrue(app.buttons["prs-sort-smallest"].waitForExistence(timeout: 5))
        capture("prs-display")
        app.buttons["Close"].tap()
        sleep(1)

        app.buttons["prs-repositories"].tap()
        XCTAssertTrue(app.staticTexts["Also read"].waitForExistence(timeout: 10))
        capture("prs-repositories")
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
