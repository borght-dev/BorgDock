import XCTest
@testable import BorgDock

/// Pull to refresh on every screen, against the stub server: which requests fire, and that nothing comes from cache.
@MainActor
final class RefreshTests: XCTestCase {
    private var overviewJSON: String!
    private var itemJSON: String!

    override func setUp() async throws {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "overview", withExtension: "json"))
        overviewJSON = try String(contentsOf: url, encoding: .utf8)
        let overview = try JSONDecoder().decode(Overview.self, from: Data(overviewJSON.utf8))
        let item = try XCTUnwrap(overview.items.first { $0.item.id == 59657 }).item
        let itemData = try JSONEncoder().encode(item)
        itemJSON = """
        {"item":\(String(decoding: itemData, as: UTF8.self)),"description":"D","acceptanceCriteria":"A","reproSteps":"",
         "qaNotes":"Check the order confirmation email on staging.","comments":[]}
        """
    }

    private func model() -> AppModel {
        AppModel(serverURL: StubURLProtocol.baseURL, token: "test-token", session: StubURLProtocol.session())
    }

    private func calls() -> [String] {
        StubURLProtocol.requests.map { "\($0.method) \($0.path)" + ($0.query.map { "?\($0)" } ?? "") }
    }

    // MARK: My work

    func testMyWorkPullAsksTheServerToReadADOAndT3Now() throws {
        let expectation = expectation(description: "refreshed")
        let overviewJSON = self.overviewJSON!
        StubURLProtocol.respond { _ in (200, overviewJSON) }
        let model = model()
        Task {
            await model.refreshFromSources()
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 5)

        XCTAssertEqual(calls(), ["POST /api/refresh"])
        XCTAssertEqual((StubURLProtocol.requests.first?.json as? [String: Any])?.count, 0, "the body is {}")
        XCTAssertEqual(model.overview?.items.count, 26)
    }

    func testThePollStaysOnTheCheapCachedRead() async {
        let overviewJSON = self.overviewJSON!
        StubURLProtocol.respond { _ in (200, overviewJSON) }
        await model().refreshOverview()
        XCTAssertEqual(calls(), ["GET /api/overview"])
    }

    func testAFailedPullKeepsTheOverviewAndShowsAToast() async {
        let overviewJSON = self.overviewJSON!
        StubURLProtocol.respond { _ in (200, overviewJSON) }
        let model = model()
        await model.refreshFromSources()

        StubURLProtocol.respond { _ in (502, #"{"error":"Azure DevOps: timed out"}"#) }
        await model.refreshFromSources()

        XCTAssertEqual(model.overview?.items.count, 26, "the old overview stays on screen")
        XCTAssertNil(model.overviewError)
        XCTAssertEqual(model.toasts.current?.message, "Azure DevOps: timed out")
        XCTAssertEqual(model.toasts.current?.isError, true)
    }

    // MARK: Item detail

    func testItemPullFetchesFreshSourcesAndTheItemTogether() async throws {
        let overviewJSON = self.overviewJSON!
        let itemJSON = self.itemJSON!
        StubURLProtocol.respond { request in request.path == "/api/refresh" ? (200, overviewJSON) : (200, itemJSON) }
        let detail = await model().refreshItem(59657)

        XCTAssertEqual(Set(calls()), ["POST /api/refresh", "GET /api/items/59657"])
        XCTAssertEqual(detail?.qaNotes, "Check the order confirmation email on staging.")
    }

    // MARK: Browse

    func testBrowsePullReloadsQueriesAndTheQueryEveryTime() async {
        StubURLProtocol.respond(cacheable: true) { request in
            request.path == "/api/browse/queries"
                ? (200, #"[{"id":"sprint","name":"Current sprint, whole team","group":"Dispatch"}]"#)
                : (200, #"{"items":[],"truncated":false}"#)
        }
        let model = model()
        let first = await model.reloadBrowse(query: "sprint", search: nil)
        let second = await model.reloadBrowse(query: "sprint", search: nil)

        XCTAssertEqual(first.queries?.count, 1)
        XCTAssertNotNil(second.result)
        XCTAssertEqual(calls().sorted(), [
            "GET /api/browse/queries", "GET /api/browse/queries", "GET /api/browse?query=sprint", "GET /api/browse?query=sprint",
        ])
        XCTAssertTrue(StubURLProtocol.requests.allSatisfy { $0.cachePolicy == .reloadIgnoringLocalCacheData })
    }

    func testBrowseSearchPullRunsTheSearchAgain() async {
        StubURLProtocol.respond { request in
            request.path == "/api/browse/queries" ? (200, "[]") : (200, #"{"items":[],"truncated":false}"#)
        }
        _ = await model().reloadBrowse(query: "sprint", search: "logout")
        XCTAssertTrue(calls().contains("GET /api/browse?search=logout"))
    }

    // MARK: Settings

    func testSettingsPullReloadsSessionsPreferencesAndConfig() async throws {
        let configURL = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "config", withExtension: "json"))
        let configJSON = try String(contentsOf: configURL, encoding: .utf8)
        StubURLProtocol.respond { request in
            switch request.path {
            case "/api/config": (200, configJSON)
            case "/api/auth/sessions": (200, "[]")
            default: (200, #"{"waiting":true,"drift":false,"finished":true}"#)
            }
        }
        let model = model()
        let fresh = await model.reloadSettings()

        XCTAssertEqual(Set(calls()), ["GET /api/auth/sessions", "GET /api/preferences/notifications", "GET /api/config"])
        XCTAssertEqual(fresh.preferences?.drift, false)
        XCTAssertEqual(fresh.sessions?.count, 0)
        XCTAssertEqual(model.config?.defaultModel, "codex/gpt-6.1-sol")
    }

    // MARK: Cache

    func testRepeatedGETsNeverComeFromURLCache() async throws {
        let session = StubURLProtocol.session()
        let client = StubURLProtocol.client(session: session)
        let url = client.url("/api/preferences/notifications")

        // A stale answer sits in URLCache, fresh for another hour.
        let stale = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": "application/json", "Cache-Control": "public, max-age=3600", "Date": Date.now.formatted(.iso8601),
        ])!
        let staleBody = Data(#"{"waiting":false,"drift":false,"finished":false}"#.utf8)
        session.configuration.urlCache?.storeCachedResponse(CachedURLResponse(response: stale, data: staleBody), for: URLRequest(url: url))
        XCTAssertNotNil(session.configuration.urlCache?.cachedResponse(for: URLRequest(url: url)))

        StubURLProtocol.respond(cacheable: true) { _ in (200, #"{"waiting":true,"drift":true,"finished":true}"#) }
        let first = try await client.notificationPreferences()
        let second = try await client.notificationPreferences()

        XCTAssertEqual(first, NotificationPreferences(waiting: true, drift: true, finished: true), "not the cached copy")
        XCTAssertEqual(second, first)
        XCTAssertEqual(StubURLProtocol.requests.count, 2, "both GETs reached the server")
        XCTAssertTrue(StubURLProtocol.requests.allSatisfy { $0.cachePolicy == .reloadIgnoringLocalCacheData })
    }

    // MARK: QA notes

    func testItemDetailDecodesQANotesAndToleratesTheirAbsence() throws {
        let detail = try JSONDecoder().decode(ItemDetail.self, from: Data(itemJSON.utf8))
        XCTAssertEqual(detail.qaNotes, "Check the order confirmation email on staging.")

        let older = itemJSON.replacingOccurrences(of: #""qaNotes":"Check the order confirmation email on staging.","#, with: "")
        XCTAssertNotEqual(older, itemJSON)
        XCTAssertEqual(try JSONDecoder().decode(ItemDetail.self, from: Data(older.utf8)).qaNotes, "")
    }
}
