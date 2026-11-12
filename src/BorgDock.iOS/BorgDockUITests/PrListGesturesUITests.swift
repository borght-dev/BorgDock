import XCTest

/// Screenshots of what only a gesture shows in the pull request list: the touch-and-hold menu and the swipe actions.
/// Runs against the sample server (`PORT=8801 node e2e/ui-fixture.mjs`); set TEST_RUNNER_I1_SHOTS to a folder to
/// write the PNGs there as well as attaching them.
final class PrListGesturesUITests: XCTestCase {
    @MainActor
    private func launch(_ route: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-BorgDockServer", "http://localhost:8801", "-BorgDockToken", "sample-token-for-fixture-only-123"]
        if let route { app.launchArguments += ["-BorgDockRoute", route] }
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
        let environment = ProcessInfo.processInfo.environment
        if let folder = environment["I1_SHOTS"] {
            let suffix = environment["I1_SUFFIX"].map { "-\($0)" } ?? ""
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name)\(suffix).png"))
        }
    }

    @MainActor
    func testTouchAndHoldShowsTheRowActions() {
        let app = launch("tab/prs")
        app.unfoldEveryPullRequestGroup()
        let card = app.buttons["pr-row-acme/shop#3712"]
        for _ in 0..<8 where !card.waitForExistence(timeout: 1) || !card.isHittable { app.swipeUp() }
        XCTAssertTrue(card.isHittable)
        sleep(1)
        card.press(forDuration: 1.2)
        XCTAssertTrue(app.buttons["Fix with Claude"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Rerun failed checks"].exists)
        XCTAssertFalse(app.buttons["Merge…"].exists, "failing checks: no merge")
        sleep(1)
        capture("context-menu")
    }

    @MainActor
    func testSwipesRevealSnoozeMergeAndReview() {
        let app = launch("tab/prs")
        app.unfoldEveryPullRequestGroup()
        let ready = app.buttons["pr-row-acme/shop#3698"]
        XCTAssertTrue(ready.waitForExistence(timeout: 15))
        for _ in 0..<4 where !ready.isHittable { app.swipeUp() }
        ready.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: ready.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)))
        XCTAssertTrue(app.buttons["Merge"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Snooze"].exists)
        sleep(1)
        capture("swipe-trailing")
        ready.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5)).tap()

        let other = app.buttons["pr-row-borght-dev/BorgDock#104"]
        for _ in 0..<4 where !other.isHittable { app.swipeUp() }
        other.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: other.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.5)))
        XCTAssertTrue(app.buttons["Review"].waitForExistence(timeout: 5))
        sleep(1)
        capture("swipe-leading")
    }
}
