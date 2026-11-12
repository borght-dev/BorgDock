import XCTest

/// Quick Review's walk against the sample server (`PORT=8812 node e2e/ui-fixture.mjs`): Mark reviewed moves on, and
/// the page always shows the file the title names (mockup section 09, F1).
final class ReviewWalkUITests: XCTestCase {
    private static let server = "http://localhost:8812"

    private static func setFaceID(_ on: Bool) async throws {
        var request = URLRequest(url: URL(string: "\(server)/api/preferences")!)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(#"{"faceIdForActions":\#(on)}"#.utf8)
        _ = try await URLSession.shared.data(for: request)
    }

    @MainActor
    private func launch(_ route: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-BorgDockServer", Self.server, "-BorgDockToken", "fixture", "-BorgDockRoute", route]
        app.launch()
        return app
    }

    @MainActor
    func testMarkReviewedKeepsThePageAndTheTitleOnTheSameFile() {
        let app = launch("review/walk/412/0")
        let title = app.descendants(matching: .any)["walk-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 20))
        let expected = ["src/cart/line.ts", "src/cart/money.ts", "src/cart/basket.ts", "src/cart/total.ts", "src/invoice/export.ts", "src/invoice/pdf.ts"]
        for (index, path) in expected.enumerated() {
            XCTAssertTrue(app.scrollViews["walk-page-\(path)"].waitForExistence(timeout: 5), "the page shows \(path)")
            XCTAssertEqual(title.value as? String, path, "the title names the page")
            XCTAssertEqual(app.staticTexts["walk-caption"].label.hasPrefix("File \(index + 1) of 12"), true)
            if index < expected.count - 1 { app.buttons["walk-mark"].tap() }
        }
    }

    @MainActor
    func testAResumedWalkOpensOnTheFirstFileItNamesAndSwipesMove() {
        let app = launch("review/walk/412/3")
        XCTAssertTrue(app.scrollViews["walk-page-src/cart/total.ts"].waitForExistence(timeout: 20))
        let title = app.descendants(matching: .any)["walk-title"]
        XCTAssertEqual(title.value as? String, "src/cart/total.ts")
        app.swipeLeft()
        XCTAssertTrue(app.scrollViews["walk-page-src/invoice/export.ts"].waitForExistence(timeout: 5), "a swipe moves to the next file")
        XCTAssertEqual(title.value as? String, "src/invoice/export.ts")
        XCTAssertFalse(app.navigationBars["total.ts:14"].exists, "swiping across a draft doesn't open it")
        app.swipeRight()
        XCTAssertTrue(app.scrollViews["walk-page-src/cart/total.ts"].waitForExistence(timeout: 5))
        app.buttons["Edit your draft on line 14"].tap()
        XCTAssertTrue(app.navigationBars["total.ts:14"].waitForExistence(timeout: 5), "a tap still opens the draft")
    }

    /// Approve moves on to the next pull request's brief at once; going back shows the decision, and once the Undo
    /// runs out GitHub's state (mockup section 06).
    @MainActor
    func testApproveMovesOnAndBackShowsTheDecision() async throws {
        // The fixture asks for Face ID before an approval; the simulator can't answer it.
        try await Self.setFaceID(false)
        addTeardownBlock { try? await Self.setFaceID(true) }
        let app = launch("review/walk/412/11")
        XCTAssertTrue(app.scrollViews["walk-page-docs/rounding.md"].waitForExistence(timeout: 20))
        app.buttons["walk-mark"].tap()
        XCTAssertTrue(app.scrollViews["walk-page-step-tests"].waitForExistence(timeout: 5))
        app.buttons["walk-mark"].tap()
        XCTAssertTrue(app.scrollViews["walk-page-step-generated"].waitForExistence(timeout: 5))
        app.buttons["walk-mark"].tap()
        let approve = app.buttons["Approve"]
        XCTAssertTrue(approve.waitForExistence(timeout: 5), "the last Mark reviewed opens the decision")
        approve.tap()
        XCTAssertTrue(app.buttons["brief-start"].waitForExistence(timeout: 10), "the next pull request opens on its brief")
        XCTAssertTrue(app.staticTexts["Webhook retries back off exponentially"].exists)
        XCTAssertTrue(app.staticTexts["Approving #412"].exists)
        app.buttons["Previous pull request"].tap()
        XCTAssertTrue(app.staticTexts["Your review"].waitForExistence(timeout: 5), "back shows the decision")
        let track = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", ", Approved")).firstMatch
        XCTAssertTrue(track.waitForExistence(timeout: 15), "after it posts, the track reads GitHub's state")
    }
}
