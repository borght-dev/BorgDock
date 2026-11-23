import XCTest

/// BorgDock Review's overview, the Ledger, on its made-up data (`-BorgDockFixture`): no server and no network.
/// Set TEST_RUNNER_LEDGER_SHOTS to a folder to write the screenshots there as well as attaching them.
final class LedgerUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    private func launch(mode: String? = nil, route: String = "ledger/fold", dark: Bool = false) -> XCUIApplication {
        XCUIDevice.shared.appearance = dark ? .dark : .light
        let app = XCUIApplication()
        app.launchArguments = ["-BorgDockFixture", "-BorgDockRoute", route]
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

    private func row(_ app: XCUIApplication, _ key: String) -> XCUIElement { app.buttons["ledger-row-\(key)"] }

    // MARK: - The screen

    @MainActor
    func testEverythingThatInvolvesYouIsOnTheFirstScreen() {
        let app = launch()
        XCTAssertTrue(row(app, "acme/shop#412").waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["ledger-subtitle"].label.prefix(14), "16 involve you")
        for title in ["To review", "Yours, needs you", "Ready to merge", "Waiting on others", "Also open in your repositories"] {
            XCTAssertTrue(app.staticTexts[title].exists, title)
        }
        // Longest wait first, and the folded sections keep their rows to themselves.
        XCTAssertLessThan(row(app, "acme/shop#412").frame.minY, row(app, "acme/payments#88").frame.minY)
        XCTAssertLessThan(row(app, "acme/payments#88").frame.minY, row(app, "acme/shop#415").frame.minY)
        XCTAssertTrue(row(app, "acme/shop#419").isHittable, "your own failing pull request is on the first screen")
        XCTAssertTrue(app.buttons["ledger-merge-acme/shop#398"].isHittable)
        XCTAssertFalse(row(app, "acme/shop#407").exists, "Waiting on others starts folded")
        capture("ledger-overview")
    }

    @MainActor
    func testDarkOverview() {
        let app = launch(dark: true)
        XCTAssertTrue(row(app, "acme/shop#412").waitForExistence(timeout: 15))
        capture("ledger-overview-dark")
        XCUIDevice.shared.appearance = .light
    }

    @MainActor
    func testFoldedSectionsOpenAndTheListEndsWithWhatWasRead() {
        let app = launch()
        let waiting = app.buttons["ledger-section-waiting"]
        XCTAssertTrue(waiting.waitForExistence(timeout: 15))
        waiting.tap()
        // The section opens at the bottom edge of the screen: its rows come into view with a scroll.
        app.swipeUp()
        XCTAssertTrue(row(app, "acme/shop#407").waitForExistence(timeout: 5))
        let alsoOpen = app.buttons["ledger-section-alsoOpen"]
        for _ in 0..<4 where !alsoOpen.isHittable { app.swipeUp() }
        alsoOpen.tap()
        app.swipeUp()
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["ledger-footer"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["ledger-footer"].label.contains("7 repositories on 1 account"))
        XCTAssertTrue(row(app, "acme/payments#84").exists, "the dependency bot's pull request")
        capture("ledger-end")
    }

    // MARK: - Acting on a row

    @MainActor
    func testStartReviewWalksToReviewFromTheTop() {
        let app = launch()
        let start = app.buttons["ledger-start-review"]
        XCTAssertTrue(start.waitForExistence(timeout: 15))
        start.tap()
        XCTAssertTrue(app.buttons["brief-start"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Keep the basket on timeout'")).firstMatch.exists, "the longest wait is first")
    }

    @MainActor
    func testATapOpensThePullRequest() {
        let app = launch()
        XCTAssertTrue(row(app, "acme/payments#88").waitForExistence(timeout: 15))
        row(app, "acme/payments#88").tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Refunds for split payments'")).firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["ledger-start-review"].isHittable)
    }

    @MainActor
    func testSwipeRightReviewsAndSwipeLeftOnlySnoozes() {
        let app = launch()
        let ready = row(app, "acme/shop#398")
        XCTAssertTrue(ready.waitForExistence(timeout: 15))
        ready.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: ready.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.5)))
        XCTAssertTrue(app.buttons["Snooze"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Merge…"].exists)
        capture("ledger-swipe-snooze")
        app.buttons["Snooze"].tap()
        XCTAssertTrue(ready.waitForNonExistence(timeout: 10), "a snoozed row leaves the overview")

        let asked = row(app, "acme/payments#88")
        asked.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: asked.coordinate(withNormalizedOffset: CGVector(dx: 0.6, dy: 0.5)))
        XCTAssertTrue(app.buttons["Review"].waitForExistence(timeout: 5))
        capture("ledger-swipe-review")
    }

    @MainActor
    func testLongPressOnSomeoneElsesOffersTheReviewAndTheWorkItem() {
        let app = launch()
        let asked = row(app, "acme/storefront#382")
        XCTAssertTrue(asked.waitForExistence(timeout: 15))
        asked.press(forDuration: 1.2)
        XCTAssertTrue(app.buttons["Review this pull request"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Review Tom's 2, oldest first"].exists)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Open AB#61040'")).firstMatch.exists)
        for title in ["Snooze until tomorrow", "Copy link", "Open on GitHub"] { XCTAssertTrue(app.buttons[title].exists, title) }
        XCTAssertFalse(app.buttons["Fix with Claude"].exists)
        sleep(1)
        capture("ledger-menu-theirs")
    }

    @MainActor
    func testLongPressOnYourOwnRedOneOffersTheRerun() {
        let app = launch()
        let failing = row(app, "acme/shop#419")
        XCTAssertTrue(failing.waitForExistence(timeout: 15))
        failing.press(forDuration: 1.2)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'Rerun 2 failed checks'")).firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Review this pull request"].exists)
        sleep(1)
        capture("ledger-menu-yours")
    }

    @MainActor
    func testMergeOnARowOpensTheMergeSheet() {
        let app = launch()
        let merge = app.buttons["ledger-merge-acme/shop#398"]
        XCTAssertTrue(merge.waitForExistence(timeout: 15))
        merge.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Merge #398'")).firstMatch.waitForExistence(timeout: 10), "it never merges on the tap")
    }

    // MARK: - Finding one

    @MainActor
    func testSearchKeepsTheSectionsAndFindsWhatMergedThisWeek() {
        let app = launch()
        let search = app.buttons["ledger-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 15))
        XCTAssertTrue(row(app, "acme/shop#412").waitForExistence(timeout: 15))
        search.tap()
        let field = app.textFields["ledger-search-field"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.typeText("refund")
        XCTAssertTrue(row(app, "acme/payments#88").waitForExistence(timeout: 5))
        XCTAssertTrue(row(app, "acme/payments#85").exists)
        XCTAssertTrue(row(app, "acme/shop#390").waitForExistence(timeout: 10), "merged this week")
        XCTAssertFalse(row(app, "acme/shop#412").exists)
        XCTAssertTrue(app.staticTexts["Also open"].exists)
        XCTAssertTrue(app.staticTexts["Merged this week"].exists)
        capture("ledger-search")

        app.buttons["ledger-filter-merged"].tap()
        XCTAssertTrue(row(app, "acme/payments#88").waitForNonExistence(timeout: 5))
        XCTAssertTrue(row(app, "acme/shop#390").exists)

        app.buttons["ledger-search-cancel"].tap()
        XCTAssertTrue(app.buttons["ledger-start-review"].waitForExistence(timeout: 5))
    }

    // MARK: - More, less, nothing

    @MainActor
    func testNothingToReviewKeepsTheSectionAndSaysSo() {
        let app = launch(mode: "quiet")
        XCTAssertTrue(app.staticTexts["Nothing waits for your review"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["ledger-start-review"].exists)
        XCTAssertTrue(row(app, "acme/shop#419").exists)
        capture("ledger-nothing-to-review")
    }

    @MainActor
    func testNothingAtAllIsSaidOnce() {
        let app = launch(mode: "clear")
        XCTAssertTrue(app.staticTexts["All clear"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["ledger-subtitle"].label.prefix(20), "Nothing involves you")
        XCTAssertTrue(app.buttons["ledger-section-alsoOpen"].exists, "the rest of your repositories stays reachable")
        capture("ledger-all-clear")
    }

    @MainActor
    func testTheFirstReadShowsWhereTheRowsWillBe() {
        let app = launch(mode: "slow")
        XCTAssertTrue(app.staticTexts["Reading your repositories…"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["To review"].exists)
        capture("ledger-first-read")
    }

    @MainActor
    func testWithoutAConnectionTheLastListStaysAndSaysSo() {
        let app = launch(mode: "offline")
        XCTAssertTrue(row(app, "acme/shop#412").waitForExistence(timeout: 15))
        // Pull down, far enough to let go into a refresh: the next read fails.
        let first = row(app, "acme/shop#412")
        first.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: first.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 11)))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'No connection.'")).firstMatch.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["ledger-subtitle"].label.contains("read at"))
        XCTAssertFalse(app.buttons["ledger-start-review"].isEnabled, "reviewing needs GitHub")
        XCTAssertFalse(app.buttons["ledger-merge-acme/shop#398"].exists, "so does merging")
        sleep(4)
        capture("ledger-offline")
    }
}
