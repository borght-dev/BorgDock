import XCTest
@testable import BorgDock

final class PackageSmokeTests: XCTestCase {
    func testAPullRequestKeyParses() {
        XCTAssertEqual(PrKey(key: "acme/shop#12"), PrKey(owner: "acme", repo: "shop", number: 12))
    }
}
