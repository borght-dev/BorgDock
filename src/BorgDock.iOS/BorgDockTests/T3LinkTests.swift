import XCTest
@testable import BorgDock

/// Which URL "Open in T3" tries, and the fallback to the web UI when T3 Code isn't installed.
final class T3LinkTests: XCTestCase {
    private let app = "t3code://threads/0f1e2d3c/a1b2c3d4"
    private let web = "http://100.64.0.10:3773/0f1e2d3c/a1b2c3d4"

    /// Records what was tried; opens only the schemes it is told are installed.
    private actor FakeOpener {
        let installed: Set<String>
        private(set) var tried: [URL] = []
        init(installed: Set<String>) { self.installed = installed }
        func open(_ url: URL) -> Bool {
            tried.append(url)
            return installed.contains(url.scheme ?? "")
        }
    }

    func testTriesTheAppLinkFirstThenTheWebLink() {
        XCTAssertEqual(T3Link.candidates(appLink: app, link: web), [URL(string: app)!, URL(string: web)!])
    }

    func testAMissingOrEmptyAppLinkUsesTheWebLink() {
        XCTAssertEqual(T3Link.candidates(appLink: nil, link: web), [URL(string: web)!])
        XCTAssertEqual(T3Link.candidates(appLink: "  ", link: web), [URL(string: web)!])
        XCTAssertEqual(T3Link.candidates(appLink: web, link: web), [URL(string: web)!], "no duplicate attempt")
        XCTAssertEqual(T3Link.candidates(appLink: "not a url", link: web), [URL(string: web)!])
    }

    func testOpensTheT3CodeAppWhenInstalled() async {
        let opener = FakeOpener(installed: ["t3code", "http"])
        let opened = await T3Link.open(T3Link.candidates(appLink: app, link: web)) { await opener.open($0) }
        XCTAssertEqual(opened, URL(string: app))
        let tried = await opener.tried
        XCTAssertEqual(tried, [URL(string: app)!], "Safari isn't opened when the app took it")
    }

    func testFallsBackToSafariWhenT3CodeIsntInstalled() async {
        let opener = FakeOpener(installed: ["http"])
        let opened = await T3Link.open(T3Link.candidates(appLink: app, link: web)) { await opener.open($0) }
        XCTAssertEqual(opened, URL(string: web))
        let tried = await opener.tried
        XCTAssertEqual(tried, [URL(string: app)!, URL(string: web)!])
    }

    func testReportsNothingWhenNeitherOpens() async {
        let opener = FakeOpener(installed: [])
        let opened = await T3Link.open(T3Link.candidates(appLink: app, link: web)) { await opener.open($0) }
        XCTAssertNil(opened)
    }

    func testDecodesAppLinkAndToleratesItsAbsence() throws {
        let base = #""id":"t","title":"T","worktree":"M0","branch":null,"status":"running","createdAt":"2026-10-02T08:00:00Z","lastActivityAt":"2026-10-02T09:00:00Z","model":"m","questionRequestId":null,"questions":[],"lastAgentMessage":null,"link":"\#(web)""#
        let withApp = try JSONDecoder().decode(ThreadSummary.self, from: Data("{\(base),\"appLink\":\"\(app)\"}".utf8))
        XCTAssertEqual(withApp.appLink, app)
        let without = try JSONDecoder().decode(ThreadSummary.self, from: Data("{\(base)}".utf8))
        XCTAssertNil(without.appLink)
        XCTAssertEqual(T3Link.candidates(appLink: without.appLink, link: without.link), [URL(string: web)!])

        let response = try JSONDecoder().decode(StartThreadResponse.self, from: Data(#"{"threadId":"t","link":"l:x","adoState":null,"warning":null}"#.utf8))
        XCTAssertNil(response.appLink)
    }
}
