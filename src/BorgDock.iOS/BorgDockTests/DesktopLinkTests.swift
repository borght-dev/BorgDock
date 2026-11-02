import CryptoKit
import XCTest
@testable import BorgDock

/// Linking the BorgDock desktop app: the QR link and typed codes, the signed approval, the linked desktops in the
/// sources and account, and the deep links that reach the account flow.
@MainActor
final class DesktopLinkTests: XCTestCase {
    // MARK: Links and codes

    func testParsesTheDesktopsLink() throws {
        let url = try XCTUnwrap(URL(string: "borgdock://link-desktop?server=https://host.example/borgdock/&code=kq7m-2dx4"))
        let link = try XCTUnwrap(DesktopLink(url: url))
        XCTAssertEqual(link.code, "KQ7M-2DX4")
        XCTAssertEqual(link.server?.absoluteString, "https://host.example/borgdock")
    }

    func testRejectsLinksWithoutACodeAndOtherLinks() {
        XCTAssertNil(DesktopLink(url: URL(string: "borgdock://link-desktop?server=https://host.example")!))
        XCTAssertNil(DesktopLink(url: URL(string: "borgdock://link-desktop?code=AB")!), "too short to be a code")
        XCTAssertNil(DesktopLink(url: URL(string: "borgdock://pair?code=KQ7M-2DX4&secret=AAAA")!))
        XCTAssertNil(DesktopLink(url: URL(string: "https://link-desktop?code=KQ7M-2DX4")!))
    }

    func testATypedCodeIsReadTheCrockfordWayAndGroupedInFours() {
        XCTAssertEqual(DesktopLink(typedCode: " kq7m 2dx4 ")?.code, "KQ7M-2DX4")
        XCTAssertEqual(DesktopLink(typedCode: "KQ7M-2DXO")?.code, "KQ7M-2DX0", "O reads as zero")
        XCTAssertEqual(DesktopLink(typedCode: "abcdefghjk")?.code, "ABCD-EFGH-JK")
        XCTAssertNil(DesktopLink(typedCode: "KQ7-M"))
        XCTAssertNil(DesktopLink(typedCode: "KQ7M-2DX4")?.server)
    }

    func testALinkForAnotherServerDoesNotMatch() throws {
        let current = try XCTUnwrap(URL(string: "https://host.example/borgdock"))
        XCTAssertTrue(DesktopLink(server: URL(string: "https://host.example/borgdock"), code: "KQ7M-2DX4").matches(server: current))
        XCTAssertTrue(DesktopLink(server: nil, code: "KQ7M-2DX4").matches(server: current), "a typed code names no server")
        XCTAssertFalse(DesktopLink(server: URL(string: "https://other.example"), code: "KQ7M-2DX4").matches(server: current))
    }

    // MARK: Approving

    func testApprovingSendsTheCodeSignedAndDecodesTheDesktop() async throws {
        StubURLProtocol.respond { _ in (200, #"{"deviceName":"Work laptop","sessionId":"s-desk-1"}"#) }
        let key = P256.Signing.PrivateKey()
        let api = APIClient(baseURL: StubURLProtocol.baseURL, token: "t", session: StubURLProtocol.session(), signer: DeviceRequestSigner(key: .software(key)))

        let approval = try await api.approveDesktopLink(code: "KQ7M-2DX4")

        XCTAssertEqual(approval, DesktopLinkApproval(deviceName: "Work laptop", sessionId: "s-desk-1"))
        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.path, "/api/desktop/links/approve")
        XCTAssertEqual(request.json as? [String: String], ["code": "KQ7M-2DX4"])
        let signedAt = try XCTUnwrap(request.headers["X-BorgDock-Signed-At"])
        let nonce = try XCTUnwrap(request.headers["X-BorgDock-Nonce"])
        let der = try XCTUnwrap(request.headers["X-BorgDock-Signature"].flatMap { Data(base64Encoded: $0) })
        let canonical = DeviceRequestSigner.canonicalString(method: "POST", path: "/api/desktop/links/approve", signedAt: signedAt, nonce: nonce, body: request.body ?? Data())
        XCTAssertTrue(key.publicKey.isValidSignature(try P256.Signing.ECDSASignature(derRepresentation: der), for: Data(canonical.utf8)))
    }

    func testApprovingWithoutAKeyNeverReachesTheServer() async {
        StubURLProtocol.respond { _ in (200, #"{"deviceName":"x","sessionId":"y"}"#) }
        let api = APIClient(baseURL: StubURLProtocol.baseURL, token: "t", session: StubURLProtocol.session())
        do {
            _ = try await api.approveDesktopLink(code: "KQ7M-2DX4")
            XCTFail("expected an error")
        } catch {
            XCTAssertTrue(StubURLProtocol.requests.isEmpty)
        }
    }

    // MARK: Sources and devices

    func testSourcesCarryTheLinkedDesktops() throws {
        let json = #"""
        {"github":[],"ado":null,"machines":[],
         "desktops":[{"sessionId":"s-desk-1","name":"Work laptop","lastSeenAt":"2026-10-31T10:00:00Z","atDesk":true},
                     {"sessionId":"s-desk-2","name":"Home laptop","lastSeenAt":null,"atDesk":false}]}
        """#
        let sources = try JSONDecoder().decode(Sources.self, from: Data(json.utf8))
        XCTAssertEqual(sources.desktops?.map(\.name), ["Work laptop", "Home laptop"])
        XCTAssertEqual(sources.desktops?.first?.atDesk, true)
        XCTAssertNil(sources.desktops?.last?.lastSeenAt)

        let older = try JSONDecoder().decode(Sources.self, from: Data(#"{"github":[],"ado":null,"machines":[]}"#.utf8))
        XCTAssertNil(older.desktops, "servers from before the desktop link")
    }

    func testDevicesSayWhichOnesAreDesktops() throws {
        let json = #"""
        {"owner":{"clerkUserId":"u","name":"Koen","email":null,"imageUrl":null},"devices":[
          {"sessionId":"s1","name":"iPhone","createdAt":"2026-10-01T00:00:00Z","lastSeenAt":"2026-10-31T00:00:00Z","current":true,"trustedBy":[]},
          {"sessionId":"s2","name":"Work laptop","createdAt":"2026-10-01T00:00:00Z","lastSeenAt":"2026-10-31T00:00:00Z","current":false,"trustedBy":[],"kind":"desktop"},
          {"sessionId":"s3","name":"Watch","createdAt":"2026-10-01T00:00:00Z","lastSeenAt":"2026-10-31T00:00:00Z","current":false,"trustedBy":[],"kind":"watch"}]}
        """#
        let devices = try JSONDecoder().decode(Account.self, from: Data(json.utf8)).devices
        XCTAssertEqual(devices.map(\.isDesktop), [false, true, false])
        XCTAssertNil(devices[0].kind)
        XCTAssertEqual(devices[2].kind, .phone, "an unknown kind reads as a phone")
    }

    func testADesktopSaysWhetherYoureAtYourDesk() {
        let now = Date(timeIntervalSince1970: 1_793_000_000)
        let seen = ISODates.format(now.addingTimeInterval(-2 * 3600))
        XCTAssertEqual(LinkedDesktop(sessionId: "s", name: "W", lastSeenAt: seen, atDesk: true).statusLine(now: now), "At your desk")
        XCTAssertEqual(LinkedDesktop(sessionId: "s", name: "W", lastSeenAt: seen, atDesk: false).statusLine(now: now), "Away · seen 2 h ago")
        XCTAssertEqual(LinkedDesktop(sessionId: "s", name: "W", lastSeenAt: nil, atDesk: false).statusLine(now: now), "Linked · not seen yet")
    }

    // MARK: Deep links

    func testADesktopLinkOpensTheLinkSheetWithItsCode() throws {
        let model = AppModel(serverURL: StubURLProtocol.baseURL, token: "test-token", session: StubURLProtocol.session())
        model.open(try XCTUnwrap(URL(string: "borgdock://link-desktop?server=https://dispatch.test:10000&code=KQ7M2DX4")))
        XCTAssertEqual(model.router.sheet?.id, "link-desktop")
        XCTAssertEqual(model.account.pendingDesktopLink?.code, "KQ7M-2DX4")
    }

    func testADesktopLinkWithoutACodeOpensNothing() throws {
        let model = AppModel(serverURL: StubURLProtocol.baseURL, token: "test-token", session: StubURLProtocol.session())
        model.open(try XCTUnwrap(URL(string: "borgdock://link-desktop?server=https://dispatch.test:10000")))
        XCTAssertNil(model.router.sheet)
        XCTAssertNil(model.account.pendingDesktopLink)
    }
}
