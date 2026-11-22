import XCTest

/// Quick Review's next (design/ios-pr-list/mockups.html, section 05): Review on a row reviews that pull request alone,
/// the long-press author run leaves out what can't merge and lets in a red pull request that isn't red by its own doing,
/// and the end card offers what's next. Runs against the sample server (`PORT=8801 node e2e/ui-fixture.mjs`);
/// TEST_RUNNER_FIXTURE_URL points it at another port, TEST_RUNNER_I1_SHOTS at a folder to write the PNGs to as well.
final class QuickReviewNextUITests: XCTestCase {
    private static let server = ProcessInfo.processInfo.environment["FIXTURE_URL"] ?? "http://localhost:8801"

    @MainActor
    private func launch(_ route: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-BorgDockServer", Self.server, "-BorgDockToken", "sample-token-for-fixture-only-123", "-BorgDockRoute", route]
        app.launchArguments += XCUIApplication.freshPullRequestList
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
    private func row(_ key: String, in app: XCUIApplication) -> XCUIElement {
        let row = app.buttons["pr-row-\(key)"]
        for _ in 0..<10 where !row.waitForExistence(timeout: 1) || !row.isHittable { app.swipeUp() }
        XCTAssertTrue(row.isHittable, "\(key) in view")
        return row
    }

    @MainActor
    private func waitForTitle(_ title: String, in app: XCUIApplication) {
        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 20), "the title says \(title)")
    }

    @MainActor
    func testTheListMarksARedPullRequestThatIsNotRedByItsOwnDoing() {
        XCUIDevice.shared.appearance = .light
        let app = launch("prs/query/author:priyashah")
        app.unfoldEveryPullRequestGroup()
        let marker = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "not this PR")).firstMatch
        XCTAssertTrue(marker.waitForExistence(timeout: 20), "#370 fails the build master fails too")
        sleep(1)
        capture("list-not-this-pr")
    }

    @MainActor
    func testLongPressRunsTheAuthorsPullRequestsAndTheEndCardListsWhatItLeftOut() {
        XCUIDevice.shared.appearance = .light
        let app = launch("tab/prs")
        app.unfoldEveryPullRequestGroup()
        let card = row("acme/shop#412", in: app)
        sleep(1)
        card.press(forDuration: 1.2)
        let run = app.buttons["Review Priya Shah's PRs, oldest first"]
        XCTAssertTrue(run.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Review"].exists, "Review reviews this one alone")
        sleep(1)
        capture("author-run-menu")
        run.tap()

        // #412 first, then the rest oldest first: #352, #370 (red, but master fails the same build) and #84 (its E2E
        // report clears it). #361 (changes requested) and #418 (conflicts) stay out.
        waitForTitle("Review · 1 of 4", in: app)
        app.buttons["review-skip"].firstMatch.tap()
        waitForTitle("Review · 2 of 4", in: app)
        app.buttons["review-skip"].firstMatch.tap()
        waitForTitle("Review · 3 of 4", in: app)
        let bypass = app.descendants(matching: .any)["review-bypass"]
        XCTAssertTrue(bypass.waitForExistence(timeout: 20))
        XCTAssertTrue(bypass.label.contains("also fails on master"), bypass.label)
        sleep(1)
        capture("cleared-by-shared-failure")
        app.buttons["review-skip"].firstMatch.tap()
        waitForTitle("Review · 4 of 4", in: app)
        XCTAssertTrue(bypass.waitForExistence(timeout: 20))
        XCTAssertTrue(bypass.label.contains("1 E2E test failed, none in specs this PR touches"), bypass.label)
        sleep(1)
        capture("cleared-by-e2e-report")
        app.buttons["review-skip"].firstMatch.tap()

        XCTAssertTrue(app.descendants(matching: .any)["review-end-held"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Left out of this run · 2 PRs"].exists)
        XCTAssertTrue(app.staticTexts["Changes requested"].exists)
        XCTAssertTrue(app.staticTexts["Has merge conflicts"].exists)
        sleep(1)
        capture("end-card-run")
    }

    @MainActor
    func testReviewOnARowReviewsItAloneAndTheEndCardOffersWhatsNext() {
        XCUIDevice.shared.appearance = .light
        let app = launch("tab/prs")
        app.unfoldEveryPullRequestGroup()
        let card = row("acme/shop#352", in: app)
        sleep(1)
        card.press(forDuration: 1.2)
        let review = app.buttons["Review"]
        XCTAssertTrue(review.waitForExistence(timeout: 5))
        review.tap()
        waitForTitle("Review #352", in: app)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Up next")).firstMatch.exists, "one pull request, no queue")
        app.buttons["review-skip"].firstMatch.tap()

        XCTAssertTrue(app.descendants(matching: .any)["review-end"].waitForExistence(timeout: 20))
        let author = app.buttons["review-end-author"]
        XCTAssertTrue(author.waitForExistence(timeout: 5), "Priya's next pull request")
        XCTAssertTrue(app.buttons["review-end-next"].exists, "the next by priority from someone else")
        sleep(1)
        capture("end-card-single")

        // Next from Priya starts her run: her next pull request opens.
        author.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Review")).firstMatch.waitForExistence(timeout: 20))
        XCTAssertFalse(app.descendants(matching: .any)["review-end"].waitForExistence(timeout: 2))
    }

    @MainActor
    func testTheEndCardOfARunWithDecisions() {
        XCUIDevice.shared.appearance = .light
        let app = launch("review/end")
        XCTAssertTrue(app.descendants(matching: .any)["review-end-held"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts["Approved"].exists)
        XCTAssertTrue(app.staticTexts["Commented"].exists)
        XCTAssertTrue(app.buttons["review-end-author"].exists)
        sleep(2)
        capture("end-card")
        app.swipeUp()
        sleep(1)
        capture("end-card-next")
    }
}
