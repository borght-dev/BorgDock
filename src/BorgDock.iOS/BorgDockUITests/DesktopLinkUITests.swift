import XCTest

/// Screenshots of linking a desktop and of the approval's Live Activity. Runs against the sample server
/// (`PORT=8802 node e2e/ui-fixture.mjs`); set TEST_RUNNER_W2_SHOTS to a folder (and TEST_RUNNER_W2_SUFFIX to
/// light or dark) to write the PNGs there as well as attaching them.
final class DesktopLinkUITests: XCTestCase {
    private let server = "http://localhost:8802"

    @MainActor
    private func launch(_ route: String? = nil, signedIn: Bool = true, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-BorgDockServer", server] + extra
        if signedIn { app.launchArguments += ["-BorgDockToken", "sample-token-for-fixture-only-123"] }
        if let route { app.launchArguments += ["-BorgDockRoute", route] }
        app.launch()
        return app
    }

    private static func preview(_ path: String) async throws {
        _ = try await URLSession.shared.data(from: URL(string: "http://localhost:8802/preview/\(path)")!)
    }

    @MainActor
    private func capture(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        let environment = ProcessInfo.processInfo.environment
        if let folder = environment["W2_SHOTS"] {
            let suffix = environment["W2_SUFFIX"].map { "-\($0)" } ?? ""
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: folder).appendingPathComponent("\(name)\(suffix).png"))
        }
    }

    @MainActor
    private func scroll(_ app: XCUIApplication, until element: XCUIElement, times: Int = 6) {
        for _ in 0..<times where !(element.exists && element.isHittable) {
            app.swipeUp(velocity: .slow)
        }
    }

    @MainActor
    func testLinkingADesktopWithATypedCode() async throws {
        try await Self.preview("desktop-on")
        let app = launch("sheet/desktop")
        XCTAssertTrue(app.staticTexts["Link a desktop"].waitForExistence(timeout: 15))
        sleep(1)
        capture("link-sheet")
        let field = app.textFields["pairing-code"]
        field.tap()
        field.typeText("kq7m 2dx4")
        app.buttons["Link"].tap()
        XCTAssertTrue(app.staticTexts["Linked Home laptop"].waitForExistence(timeout: 10))
        sleep(1)
        capture("link-sheet-linked")
        try await Self.preview("desktop-on")
    }

    @MainActor
    func testConnectYourWorkWithoutADesktop() async throws {
        try await Self.preview("desktop-off")
        let app = launch("signin/connect", signedIn: false)
        XCTAssertTrue(app.staticTexts["Connect your work"].waitForExistence(timeout: 15))
        let row = app.staticTexts["Not signed in"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        scroll(app, until: row)
        sleep(1)
        capture("connect-unlinked")
        try await Self.preview("desktop-on")
    }

    @MainActor
    func testConnectYourWorkWithALinkedDesktop() async throws {
        try await Self.preview("desktop-on")
        let app = launch("signin/connect", signedIn: false)
        let row = app.staticTexts["Work laptop"]
        XCTAssertTrue(row.waitForExistence(timeout: 15))
        scroll(app, until: app.staticTexts["Link a desktop"])
        sleep(1)
        capture("connect-linked")
    }

    @MainActor
    func testSettingsShowsTheDesktopAndQuietAtDesk() async throws {
        try await Self.preview("desktop-on")
        var app = launch("sheet/settings")
        XCTAssertTrue(app.staticTexts["Work laptop"].waitForExistence(timeout: 15))
        scroll(app, until: app.staticTexts["Link a desktop"])
        sleep(1)
        capture("settings-desktop")
        scroll(app, until: app.staticTexts["You're at your desk now"], times: 8)
        sleep(1)
        capture("settings-quiet")
        scroll(app, until: app.buttons["sign-out"], times: 8)
        sleep(1)
        capture("settings-devices")
        app.terminate()

        try await Self.preview("desktop-off")
        app = launch("sheet/settings")
        XCTAssertTrue(app.staticTexts["Not signed in"].waitForExistence(timeout: 15))
        scroll(app, until: app.staticTexts["Needs a linked desktop"], times: 8)
        sleep(1)
        capture("settings-quiet-unlinked")
        try await Self.preview("desktop-on")
    }

    @MainActor
    func testTheApprovalGallery() {
        _ = launch(extra: ["-BorgDockGallery", "approval"])
        sleep(3)
        capture("approval-gallery")
    }

    /// The real activity: approve in Quick Review (a 14-second hold), leave the app, the island counts down, and its
    /// Undo takes the approval back.
    @MainActor
    func testTheApprovalMovesToTheIslandWhenYouLeave() {
        let app = launch("i1/approving")
        XCTAssertTrue(app.staticTexts["Approving #3712…"].waitForExistence(timeout: 15))
        XCUIDevice.shared.press(.home)
        sleep(2)
        capture("approval-island-compact")
        // Touch and hold the island to expand it.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.028)).press(forDuration: 1.2)
        sleep(1)
        capture("approval-island-expanded")
        // Undo in the island runs UndoApprovalIntent in the app: the hold and its toast are gone.
        springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.158)).tap()
        sleep(1)
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 5))
        XCTAssertFalse(app.staticTexts["Approving #3712…"].waitForExistence(timeout: 2), "Undo took the approval back")
    }
}
