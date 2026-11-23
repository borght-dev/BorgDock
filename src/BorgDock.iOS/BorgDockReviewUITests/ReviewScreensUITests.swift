import XCTest

/// BorgDock Review's screens around the overview, on its made-up data (`-BorgDockFixture`): the pull request page, the
/// work item sheet, Quick Review's walk and decision, Settings and the first run. No server and no network.
/// Set TEST_RUNNER_LEDGER_SHOTS to a folder to write the screenshots there as well as attaching them.
final class ReviewScreensUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
        XCUIDevice.shared.appearance = .light
    }

    @MainActor
    private func launch(route: String? = nil, mode: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-BorgDockFixture"]
        if let route { app.launchArguments += ["-BorgDockRoute", route] }
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

    private func any(_ app: XCUIApplication, _ id: String) -> XCUIElement { app.descendants(matching: .any)[id] }

    private func text(_ app: XCUIApplication, containing words: String) -> XCUIElement {
        app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", words)).firstMatch
    }

    // MARK: - A pull request

    @MainActor
    func testThePullRequestPageSaysWhereItStandsWhatItIsForAndWhoReviews() {
        let app = launch(route: "i1/pr/checks/acme/shop/412")
        XCTAssertTrue(app.buttons["pr-review"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["pr-merge"].exists, "Merge is in the bar on someone else's pull request too")
        XCTAssertTrue(app.buttons["pr-track"].exists)
        XCTAssertTrue(app.buttons["pr-track"].label.contains("Your review"), app.buttons["pr-track"].label)
        XCTAssertTrue(app.buttons["pr-work-item-60379"].exists, "the work item is a card under the title")
        XCTAssertTrue(app.buttons["pr-rerun-failed"].exists, "this account's token may rerun")
        XCTAssertFalse(app.buttons["Fix"].exists)
        capture("pr-page")

        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Reviewers'")).firstMatch.tap()
        XCTAssertTrue(any(app, "pr-reviewer-you").waitForExistence(timeout: 10))
        XCTAssertTrue(any(app, "pr-reviewer-tom").label.contains("2 commits since"), any(app, "pr-reviewer-tom").label)
        XCTAssertTrue(any(app, "pr-reviewer-@checkout").exists)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Conversation'")).firstMatch.exists)
        XCTAssertTrue(text(app, containing: "1 thread open").exists)
        capture("pr-reviewers")
    }

    @MainActor
    func testTheWorkItemComesUpAsASheetAndClosesBackOntoThePullRequest() {
        let app = launch(route: "url/borgdock://pr/acme/shop/412")
        let card = app.buttons["pr-work-item-60379"]
        XCTAssertTrue(card.waitForExistence(timeout: 30))
        card.tap()
        XCTAssertTrue(app.buttons["item-close"].waitForExistence(timeout: 15))
        XCTAssertTrue(any(app, "item-who").label.contains("Sprint"), any(app, "item-who").label)
        XCTAssertTrue(app.textFields["item-comment"].exists || any(app, "item-comment").exists, "the comment box is always there")
        XCTAssertFalse(app.buttons["item-move"].exists, "nothing moves an item from here")
        capture("work-item-sheet")
        app.buttons["item-close"].tap()
        XCTAssertTrue(app.buttons["pr-review"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["pr-review"].isHittable, "back where you were reading")
    }

    // MARK: - Quick Review

    @MainActor
    func testAThreadSitsUnderItsLineAndACommentTakesSeveralLines() {
        let app = launch(route: "i1/walk/acme/shop/412/0")
        XCTAssertTrue(any(app, "walk-thread-RT_1").waitForExistence(timeout: 40), "Mira's thread shows under the line it is on")
        XCTAssertTrue(app.staticTexts["walk-file-summary"].label.contains("1 thread"), app.staticTexts["walk-file-summary"].label)
        capture("walk-thread")

        app.buttons["Comment on line 18"].tap()
        XCTAssertTrue(app.buttons["line-draft-save"].waitForExistence(timeout: 10))
        XCTAssertTrue(text(app, containing: "line 18").exists)
        app.buttons["Comment on line 20"].tap()
        XCTAssertTrue(text(app, containing: "lines 18 to 20").waitForExistence(timeout: 5), "a tap on another line takes every line up to it")
        capture("walk-range")
        app.buttons["line-draft-suggest"].tap()
        XCTAssertFalse(app.buttons["line-draft-suggest"].waitForExistence(timeout: 2), "one suggestion a comment")
        app.buttons["line-draft-save"].tap()
        XCTAssertTrue(text(app, containing: "Draft · lines 18 to 20").waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["walk-file-summary"].label.contains("1 draft"), app.staticTexts["walk-file-summary"].label)
    }

    @MainActor
    func testAReReviewReadsWhatChangedSinceYours() {
        let app = launch(route: "i1/walk/acme/shop/409/0")
        XCTAssertTrue(any(app, "rereview-banner").waitForExistence(timeout: 40))
        XCTAssertTrue(text(app, containing: "pushed 2 commits since your review").exists)
        XCTAssertTrue(any(app, "walk-thread-RT_409").exists, "your earlier comment sits on the line that changed in answer to it")
        XCTAssertTrue(text(app, containing: "Changed since").exists)
        XCTAssertTrue(app.staticTexts["walk-caption"].label.contains("of 1"), app.staticTexts["walk-caption"].label)
        capture("walk-rereview")
        app.buttons["All 4 files"].tap()
        let caption = app.staticTexts["walk-caption"]
        let all = NSPredicate(format: "label CONTAINS 'of 3'")
        expectation(for: all, evaluatedWith: caption)
        waitForExpectations(timeout: 10)
    }

    @MainActor
    func testTheDecisionHasAutoMergeAsASwitch() {
        let app = launch(route: "i1/decide/acme/shop/412")
        let approve = app.buttons["decide-approve"]
        if !approve.waitForExistence(timeout: 30) {
            // The sheet opens by itself after the last file; from the top right at any time.
            app.buttons["Done, decide"].tap()
        }
        XCTAssertTrue(approve.waitForExistence(timeout: 15))
        XCTAssertEqual(approve.label, "Approve")
        XCTAssertFalse(app.buttons["Approve & auto-merge"].exists, "auto-merge is a switch, not a fourth button")
        let toggle = app.switches["decide-auto-merge"]
        XCTAssertTrue(toggle.exists)
        XCTAssertEqual(toggle.value as? String, "0", "off until you turn it on")
        capture("decide")
        toggle.switches.firstMatch.exists ? toggle.switches.firstMatch.tap() : toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        XCTAssertEqual(app.buttons["decide-approve"].label, "Approve and merge when ready")
    }

    // MARK: - Settings and the first run

    @MainActor
    func testSettingsLeadWithTheAccountsAndRepositoriesAreGroupedByAccount() {
        let app = launch(route: "sheet/settings")
        XCTAssertTrue(any(app, "account-koen").waitForExistence(timeout: 30))
        XCTAssertTrue(any(app, "account-koen").label.contains("Work"), any(app, "account-koen").label)
        XCTAssertTrue(any(app, "connect-ado").label.contains("Connected"), any(app, "connect-ado").label)
        for gone in ["Machines", "Notifications", "Sign out", "Server"] { XCTAssertFalse(app.staticTexts[gone].exists, gone) }
        XCTAssertTrue(app.switches["settings-read-all"].exists)
        XCTAssertTrue(app.switches["settings-face-id"].exists)
        capture("settings")

        any(app, "settings-repositories").tap()
        XCTAssertTrue(app.switches["repository-acme/shop"].waitForExistence(timeout: 20))
        XCTAssertTrue(any(app, "repositories-account-koen").exists)
        app.swipeUp()
        XCTAssertTrue(app.switches["repositories-involving"].waitForExistence(timeout: 5), "Also read stays")
        capture("repositories")
    }

    @MainActor
    func testTheFirstRunGoesFromATokenToTheOverviewInThreeSteps() {
        let app = launch(mode: "fresh")
        XCTAssertTrue(app.buttons["welcome-connect"].waitForExistence(timeout: 30))
        for step in ["GitHub", "Azure DevOps", "Repositories"] { XCTAssertTrue(app.staticTexts[step].exists, step) }
        capture("welcome")
        app.buttons["welcome-connect"].tap()

        let token = app.secureTextFields["github-token"]
        XCTAssertTrue(token.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["github-add"].exists, "nothing to add before GitHub answered")
        token.tap()
        token.typeText("github_pat_11ACME0000fixture0000token0000review")
        XCTAssertTrue(any(app, "token-who").waitForExistence(timeout: 20), "the token is checked as you paste it")
        XCTAssertTrue(any(app, "token-who").label.contains("16 repositories"), any(app, "token-who").label)
        XCTAssertTrue(text(app, containing: "Expires 20 February 2027").exists)
        capture("github-token")
        app.buttons["account-label-personal"].tap()
        app.buttons["github-add"].tap()

        XCTAssertTrue(app.buttons["ado-skip"].waitForExistence(timeout: 10), "Azure DevOps can wait")
        XCTAssertTrue(app.staticTexts["Step 2 of 3"].exists)
        capture("azure-devops")
        app.buttons["ado-skip"].tap()

        XCTAssertTrue(app.buttons["repositories-finish"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.switches["repository-acme/shop"].waitForExistence(timeout: 30))
        XCTAssertEqual(app.switches["repository-acme/shop"].value as? String, "1", "the repositories you work in start switched on")
        capture("repositories-setup")
        app.buttons["repositories-finish"].tap()
        XCTAssertTrue(app.staticTexts["ledger-subtitle"].waitForExistence(timeout: 30), "and then the overview")
    }

    @MainActor
    func testAnAccountThatCannotBeReadIsNamedOverTheList() {
        let app = launch(mode: "expired")
        let banner = any(app, "ledger-banner")
        XCTAssertTrue(banner.waitForExistence(timeout: 40))
        XCTAssertTrue(text(app, containing: "koen-labs isn't being read.").exists)
        XCTAssertTrue(text(app, containing: "your personal account").exists)
        XCTAssertTrue(app.buttons["ledger-row-acme/shop#412"].exists, "the rest keeps showing")
        capture("ledger-expired-token")
        app.buttons["ledger-banner-action"].tap()
        XCTAssertTrue(any(app, "account-koen-labs").waitForExistence(timeout: 10), "Replace the token leads to the accounts")
    }
}
