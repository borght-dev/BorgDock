import XCTest
@testable import BorgDock

/// A read of the list that fails outright: the list on screen is old, and stays called old until a read succeeds.
final class ListFailureTests: XCTestCase {
    override func setUp() {
        GitHubFake.reset()
    }

    func testAFailedReadStandsUntilTheNextOneSucceeds() async throws {
        let world = GitHubWorld()
        world.install()
        let service = world.service()
        let first = try await service.focus(fresh: false)
        XCTAssertFalse(first.pullRequests.isEmpty)

        // Pull to refresh without a connection.
        GitHubFake.onGraphql("FocusSearch") { _ in .status(502, message: "Server Error") }
        do {
            _ = try await service.focus(fresh: true)
            XCTFail("a read that reached nothing is a failure")
        } catch {}
        let searches = GitHubFake.operations("FocusSearch").count

        // The next poll comes within the minute the first answer is good for: it must not hand that answer back as fresh.
        do {
            _ = try await service.focus(fresh: false)
            XCTFail("the list is older than it looks")
        } catch {
            XCTAssertEqual(GitHubFake.operations("FocusSearch").count, searches, "and GitHub isn't asked again for it")
        }

        world.install()
        let again = try await service.focus(fresh: true)
        XCTAssertFalse(again.pullRequests.isEmpty)
        _ = try await service.focus(fresh: false)
        await world.settle()
    }
}
