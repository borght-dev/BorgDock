import XCTest
@testable import BorgDock

final class PKCETests: XCTestCase {
    /// RFC 7636, Appendix B.
    func testChallengeMatchesTheRFCExample() {
        let pkce = PKCE(verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
        XCTAssertEqual(pkce.challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    func testGeneratedVerifierIsBase64URLWithoutPaddingAndLongEnough() {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        for _ in 0..<50 {
            let pkce = PKCE.generate()
            XCTAssertTrue((43...128).contains(pkce.verifier.count), "verifier length \(pkce.verifier.count)")
            XCTAssertTrue(pkce.verifier.unicodeScalars.allSatisfy(allowed.contains))
            XCTAssertEqual(pkce.challenge.count, 43, "a SHA-256 digest is 43 base64url characters without padding")
            XCTAssertTrue(pkce.challenge.unicodeScalars.allSatisfy(allowed.contains))
            XCTAssertEqual(pkce.challenge, PKCE.challenge(for: pkce.verifier))
        }
    }

    func testVerifiersAreRandom() {
        let verifiers = Set((0..<100).map { _ in PKCE.generate().verifier })
        XCTAssertEqual(verifiers.count, 100)
    }

    func testBase64URLReplacesUnsafeCharactersAndDropsPadding() {
        XCTAssertEqual(Data([0xFB, 0xFF]).base64URLEncodedString(), "-_8")
    }

    func testCallbackReturnsTheCodeWhenStateMatches() throws {
        let url = URL(string: "dispatch://auth?code=abc123&state=s1")!
        XCTAssertEqual(try AuthCallback.code(from: url, expectedState: "s1"), "abc123")
    }

    func testCallbackRejectsAnotherState() {
        let url = URL(string: "dispatch://auth?code=abc123&state=evil")!
        XCTAssertThrowsError(try AuthCallback.code(from: url, expectedState: "s1")) { error in
            XCTAssertEqual(error as? AuthCallback.Failure, .stateMismatch)
        }
    }

    func testCallbackWithoutCodeIsAnError() {
        let url = URL(string: "dispatch://auth?state=s1&error=Passkey%20cancelled")!
        XCTAssertThrowsError(try AuthCallback.code(from: url, expectedState: "s1")) { error in
            XCTAssertEqual(error as? AuthCallback.Failure, .missingCode("Passkey cancelled"))
        }
    }

    func testSignInURLCarriesStateAndChallenge() {
        let client = APIClient(baseURL: URL(string: "https://host.ts.net:10000")!, token: nil)
        let url = client.url("/auth/app", query: [URLQueryItem(name: "state", value: "s1"), URLQueryItem(name: "code_challenge", value: "E9M-_x")])
        XCTAssertEqual(url.absoluteString, "https://host.ts.net:10000/auth/app?state=s1&code_challenge=E9M-_x")
    }
}
