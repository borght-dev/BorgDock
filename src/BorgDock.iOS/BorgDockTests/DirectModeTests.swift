import XCTest
@testable import BorgDock

/// BorgDock Review's accounts and its image loading: what a token is sent to, and what it is never sent to.
@MainActor
final class DirectModeTests: XCTestCase {
    private let vault = DirectCredentialStore(service: "dev.borght.borgdock.tests.direct")

    override func setUp() async throws {
        vault.clear()
    }

    override func tearDown() async throws {
        vault.clear()
    }

    private func session(_ urlSession: URLSession) -> DirectSession {
        let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("direct-tests-\(UUID().uuidString)", isDirectory: true)
        return DirectSession(vault: vault, store: FileStore(directory: scratch), defaults: UserDefaults(suiteName: "direct-tests")!, session: urlSession)
    }

    func testAGitHubTokenIsCheckedThenKeptUnderItsLoginAndSurvivesALaunch() async throws {
        StubURLProtocol.respond { request in
            request.headers["Authorization"] == "Bearer good-token"
                ? (200, #"{"data":{"viewer":{"login":"koen","name":"Koen Example","avatarUrl":null}}}"#)
                : (401, #"{"message":"Bad credentials"}"#)
        }
        let direct = session(StubURLProtocol.session())
        XCTAssertFalse(direct.hasGitHub)
        do {
            try await direct.addGitHubAccount(token: "bad-token")
            XCTFail("A refused token must not be kept")
        } catch {
            XCTAssertEqual((error as? APIError)?.isUnauthorized, true)
        }
        XCTAssertFalse(direct.hasGitHub)

        let me = try await direct.addGitHubAccount(token: "  good-token\n")
        XCTAssertEqual(me.login, "koen")
        XCTAssertEqual(direct.credentials.gitHub.map(\.login), ["koen"])
        XCTAssertEqual(session(StubURLProtocol.session()).credentials.gitHub.map(\.token), ["good-token"], "read back from the Keychain")

        direct.removeGitHubAccount("KOEN")
        XCTAssertFalse(direct.hasGitHub)
        XCTAssertFalse(session(StubURLProtocol.session()).hasGitHub)
    }

    func testAnOrganizationIsNamedByItsNameOrItsAddress() {
        let expected = URL(string: "https://dev.azure.com/acme")
        XCTAssertEqual(AzureDevOpsAddress.organizationURL("acme"), expected)
        XCTAssertEqual(AzureDevOpsAddress.organizationURL(" dev.azure.com/acme/Shop "), expected)
        XCTAssertEqual(AzureDevOpsAddress.organizationURL("https://dev.azure.com/acme/"), expected)
        XCTAssertNil(AzureDevOpsAddress.organizationURL(""))
        XCTAssertNil(AzureDevOpsAddress.organizationURL("not an org"))
    }

    func testOnlyUploadsOnGitHubItselfCountAsUploads() {
        XCTAssertTrue(GitHubUploads.isUpload(URL(string: "https://github.com/user-attachments/assets/0f3a")!))
        XCTAssertTrue(GitHubUploads.isUpload(URL(string: "https://github.com/acme/shop/assets/12/0f3a")!))
        XCTAssertFalse(GitHubUploads.isUpload(URL(string: "http://github.com/user-attachments/assets/0f3a")!), "never over plain HTTP")
        XCTAssertFalse(GitHubUploads.isUpload(URL(string: "https://github.com.example.com/user-attachments/assets/0f3a")!))
        XCTAssertFalse(GitHubUploads.isUpload(URL(string: "https://example.com/acme/shop/assets/12/0f3a")!))
        XCTAssertFalse(GitHubUploads.isUpload(URL(string: "https://github.com/acme/shop/pull/12")!))
    }

    func testAnImageIsAskedWithATokenOnlyWhereARuleNamesOne() async throws {
        StubURLProtocol.respond { _ in (200, "image") }
        let loader = ImageLoader(session: StubURLProtocol.session(), rules: [
            ImageLoader.Rule { $0.host() == "dev.azure.com" ? ["Basic secret"] : [] },
        ])
        _ = try await loader.data(from: URL(string: "https://dev.azure.com/acme/_apis/wit/attachments/1")!)
        _ = try await loader.data(from: URL(string: "https://images.example.com/cat.png")!)
        XCTAssertEqual(StubURLProtocol.requests.map { $0.headers["Authorization"] }, ["Basic secret", nil])
    }

    func testTheNextAccountsTokenIsTriedWhenTheFirstIsTurnedAway() async throws {
        StubURLProtocol.respond { request in request.headers["Authorization"] == "Bearer work" ? (200, "image") : (404, "") }
        let loader = ImageLoader(session: StubURLProtocol.session(), rules: [ImageLoader.Rule { _ in ["Bearer personal", "Bearer work"] }])
        let data = try await loader.data(from: URL(string: "https://github.com/user-attachments/assets/0f3a")!)
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "image")
        XCTAssertEqual(StubURLProtocol.requests.map { $0.headers["Authorization"] }, ["Bearer personal", "Bearer work"])
    }

    func testARecordingIsFetchedOnlyWhereARuleNamesATokenAndASignInPageIsNoRecording() async throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: "recording-test-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        StubURLProtocol.respond { _ in (200, "<html>Sign in</html>") }
        let loader = ImageLoader(session: StubURLProtocol.session(), rules: [ImageLoader.Rule { GitHubUploads.isUpload($0) ? ["Bearer work"] : [] }])

        let streamed = try await loader.recording(from: URL(string: "https://example.com/proofs/main.webm")!, into: folder)
        XCTAssertNil(streamed, "the player asks for this one itself")
        XCTAssertTrue(StubURLProtocol.requests.isEmpty)

        do {
            _ = try await loader.recording(from: URL(string: "https://github.com/user-attachments/assets/0f3a")!, into: folder)
            XCTFail("a page is not a video")
        } catch {
            XCTAssertEqual(StubURLProtocol.requests.map { $0.headers["Authorization"] }, ["Bearer work"])
        }
    }

    func testAVideoIsNamedByWhatTheServerCallsItElseByItsAddress() {
        let upload = URL(string: "https://github.com/user-attachments/assets/0f3a")!
        XCTAssertEqual(ImageLoader.videoExtension(type: "video/webm", address: upload), "webm")
        XCTAssertEqual(ImageLoader.videoExtension(type: "video/quicktime", address: upload), "mov")
        XCTAssertEqual(ImageLoader.videoExtension(type: "application/octet-stream", address: URL(string: "https://example.com/a/flow.MP4?x=1")!), "mp4")
        XCTAssertNil(ImageLoader.videoExtension(type: "application/octet-stream", address: upload))
        XCTAssertNil(ImageLoader.videoExtension(type: "text/html", address: URL(string: "https://example.com/a/flow.mp4")!))
    }
}
