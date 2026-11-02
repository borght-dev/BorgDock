import XCTest

final class VisualParityTests: XCTestCase {
    @MainActor
    private func launch(_ route: String? = nil, signedIn: Bool = true) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-BorgDockServer", "http://127.0.0.1:8796"]
        if signedIn { app.launchArguments += ["-BorgDockToken", "visual-fixture"] }
        if let route { app.launchArguments += ["-BorgDockRoute", route] }
        app.launch()
        return app
    }

    @MainActor
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    @MainActor
    func testQueueNavigationAndScreens() {
        let app = launch()
        let first = app.buttons["review-item-56908"]
        XCTAssertTrue(first.waitForExistence(timeout: 15))
        capture("ios-queue")
        app.buttons["work-view-picker"].tap()
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Out of sync (2)")).firstMatch.tap()
        XCTAssertTrue(app.buttons["review-item-59658"].waitForExistence(timeout: 5))
        capture("ios-drift-queue")
        app.buttons["review-item-59658"].tap()
        XCTAssertTrue(app.staticTexts["WORK ITEM"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["detail-back"].isHittable)
        capture("ios-drift-detail")
        app.buttons["detail-back"].tap()
        XCTAssertTrue(app.buttons["work-view-picker"].waitForExistence(timeout: 5))
        app.buttons["app-tab-Browse ADO"].tap()
        XCTAssertTrue(app.textFields.firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Dispatch"].isHittable)
        capture("ios-browse")
        app.buttons["app-tab-Settings"].tap()
        XCTAssertTrue(app.staticTexts["Notifications on this device"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Dispatch"].isHittable)
        capture("ios-settings")
    }

    @MainActor
    func testDetailAndStartSheet() {
        let app = launch("item/56908")
        XCTAssertTrue(app.staticTexts["Agent update"].waitForExistence(timeout: 15))
        capture("ios-detail")
        app.swipeUp()
        capture("ios-detail-actions")
        app.terminate()
        let start = launch("start/60100")
        XCTAssertTrue(start.buttons["Start in background"].waitForExistence(timeout: 15))
        capture("ios-start")
        start.buttons["Cancel"].tap()
        XCTAssertTrue(start.buttons["work-view-picker"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testQuestionAndEmptyQueue() async throws {
        _ = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:8796/preview/question")!)
        let app = launch("item/60000")
        XCTAssertTrue(app.buttons["Something else"].waitForExistence(timeout: 15))
        capture("ios-question")
        app.buttons["Something else"].tap()
        let answer = app.textFields["Your answer"]
        XCTAssertTrue(answer.waitForExistence(timeout: 5))
        answer.tap()
        answer.typeText("Replay both environments")
        app.swipeUp()
        let send = app.buttons["Send answer"]
        XCTAssertTrue(send.waitForExistence(timeout: 5))
        XCTAssertTrue(send.isEnabled)
        send.tap()
        let (data, _) = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:8796/preview/writes")!)
        let writes = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [[String: Any]])
        let write = try XCTUnwrap(writes.first { ($0["path"] as? String)?.hasSuffix("/answers") == true })
        let body = try XCTUnwrap(write["body"] as? [String: Any])
        let answers = try XCTUnwrap(body["answers"] as? [String: String])
        XCTAssertEqual(answers["validation"], "Replay both environments")
        app.terminate()
        _ = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:8796/preview/empty")!)
        let empty = launch()
        XCTAssertTrue(empty.staticTexts["You're all caught up"].waitForExistence(timeout: 15))
        capture("ios-empty")
        empty.terminate()
        _ = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:8796/preview/reset")!)
    }

    @MainActor
    func testSignIn() {
        let app = launch(signedIn: false)
        XCTAssertTrue(app.buttons["Sign in with passkey"].waitForExistence(timeout: 10))
        capture("ios-sign-in")
    }
}
