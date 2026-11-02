import CryptoKit
import Foundation
import Security

/// OAuth PKCE (RFC 7636, S256): `challenge = base64url(sha256(verifier))` without padding.
struct PKCE: Equatable, Sendable {
    let verifier: String
    let challenge: String

    init(verifier: String) {
        self.verifier = verifier
        self.challenge = Self.challenge(for: verifier)
    }

    /// 32 random bytes give a 43-character verifier, the shortest the spec allows.
    static func generate() -> PKCE {
        PKCE(verifier: randomURLSafeString(byteCount: 32))
    }

    static func challenge(for verifier: String) -> String {
        Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
    }

    static func randomURLSafeString(byteCount: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        precondition(status == errSecSuccess, "The system random generator failed")
        return Data(bytes).base64URLEncodedString()
    }
}

extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
