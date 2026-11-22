import XCTest

/// The desktop's query on the phone: a qualifier typed in search becomes a chip, the chip's × drops it, Save view
/// makes a pill. Runs against the sample server (`PORT=8801 node e2e/ui-fixture.mjs`); set I1_SHOTS to a folder to
/// write the PNGs there as well.
final class PrListFiltersUITests: XCTestCase {
    @MainActor
    private func launch(_ route: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-BorgDockServer", "http://localhost:8801", "-BorgDockToken", "sample-token-for-fixture-only-123", "-BorgDockRoute", route]
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
    func testATypedQualifierBecomesAChipAndAView() {
        XCUIDevice.shared.appearance = .light
        let app = launch("tab/prs")
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 15))
        search.tap()
        search.typeText("author:")
        let suggestion = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Priya Shah")).firstMatch
        XCTAssertTrue(suggestion.waitForExistence(timeout: 5), "after author: search suggests the authors")
        sleep(1)
        capture("prs-typing-filter")
        search.typeText("priyashah ")
        let chip = app.descendants(matching: .any)["prs-chip-0"]
        XCTAssertTrue(chip.waitForExistence(timeout: 5), "the qualifier became a chip")
        XCTAssertFalse((search.value as? String ?? "").contains("priyashah"), "and left the field")
        sleep(1)
        capture("prs-chip")

        app.buttons["prs-save-view"].tap()
        let name = app.textFields["prs-save-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.typeText("Priya's")
        capture("prs-save-view")
        app.buttons["prs-save-confirm"].tap()
        let pill = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Priya's")).firstMatch
        XCTAssertTrue(pill.waitForExistence(timeout: 5), "a pill for the new view")

        app.buttons["prs-filter-all"].tap()
        XCTAssertFalse(chip.waitForExistence(timeout: 2), "a built-in tab drops the view's query")
        sleep(1)
        capture("prs-back-to-all")
    }
}
