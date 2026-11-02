import CryptoKit
import Foundation
import Security

/// This device's P-256 signing key. It lives in the Secure Enclave and never leaves it; the Keychain only keeps the
/// enclave's wrapped handle. The simulator has no enclave, so DEBUG simulator builds use a software key instead.
/// docs/security.md explains why agent, merge and approve commands are signed.
struct DeviceKey: Sendable {
    /// Base64 of the 65-byte X9.63 public key: what the server and connectors register.
    let publicKeyBase64: String
    let publicKeyBytes: Data
    private let signer: @Sendable (Data) throws -> Data

    init(publicKey: Data, sign: @escaping @Sendable (Data) throws -> Data) {
        publicKeyBytes = publicKey
        publicKeyBase64 = publicKey.base64EncodedString()
        signer = sign
    }

    /// DER-encoded ECDSA P-256 / SHA-256 signature over `data`.
    func sign(_ data: Data) throws -> Data { try signer(data) }

    /// Loads the stored key, or makes one the first time.
    static func loadOrCreate(store: DeviceKeyStore = DeviceKeyStore()) throws -> DeviceKey {
        if SecureEnclave.isAvailable {
            if let blob = store.load(), let key = try? SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: blob) {
                return enclave(key)
            }
            let key = try SecureEnclave.P256.Signing.PrivateKey()
            try store.save(key.dataRepresentation)
            return enclave(key)
        }
        #if DEBUG && targetEnvironment(simulator)
        if let raw = store.load(), let key = try? P256.Signing.PrivateKey(rawRepresentation: raw) {
            return software(key)
        }
        let key = P256.Signing.PrivateKey()
        try store.save(key.rawRepresentation)
        return software(key)
        #else
        throw DeviceKeyError.noSecureEnclave
        #endif
    }

    static func enclave(_ key: SecureEnclave.P256.Signing.PrivateKey) -> DeviceKey {
        DeviceKey(publicKey: key.publicKey.x963Representation) { try key.signature(for: $0).derRepresentation }
    }

    static func software(_ key: P256.Signing.PrivateKey) -> DeviceKey {
        DeviceKey(publicKey: key.publicKey.x963Representation) { try key.signature(for: $0).derRepresentation }
    }

    /// Forgets the key, e.g. on sign-out, so the next session registers a fresh one.
    static func reset(store: DeviceKeyStore = DeviceKeyStore()) {
        store.delete()
    }
}

enum DeviceKeyError: LocalizedError {
    case noSecureEnclave

    var errorDescription: String? {
        "This iPhone has no Secure Enclave, so BorgDock can't make a key to sign agent commands with."
    }
}

/// The key handle in the Keychain, readable after first unlock so notification actions can sign answers.
struct DeviceKeyStore: Sendable {
    var service = "dev.borght.borgdock.device-key"
    var account = "device"

    func load() -> Data? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    func save(_ data: Data) throws {
        SecItemDelete(baseQuery as CFDictionary)
        var insert = baseQuery
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(insert as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    func delete() {
        SecItemDelete(baseQuery as CFDictionary)
    }

    private var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }
}

/// Signs requests with the device key (shared/src/borgdock.ts, "Signed commands"):
/// base64 DER ECDSA over `${method}\n${path}\n${signedAt}\n${nonce}\n${sha256hex(body)}`.
struct DeviceRequestSigner: RequestSigner {
    let key: DeviceKey
    var now: @Sendable () -> Date = { Date() }
    var nonce: @Sendable () -> String = { DeviceRequestSigner.randomNonce() }

    static let signedAtHeader = "X-BorgDock-Signed-At"
    static let nonceHeader = "X-BorgDock-Nonce"
    static let signatureHeader = "X-BorgDock-Signature"

    func headers(method: String, path: String, body: Data) async throws -> [String: String] {
        let signedAt = Self.timestamp(now())
        let nonce = nonce()
        let canonical = Self.canonicalString(method: method, path: path, signedAt: signedAt, nonce: nonce, body: body)
        let signature = try key.sign(Data(canonical.utf8))
        return [
            Self.signedAtHeader: signedAt,
            Self.nonceHeader: nonce,
            Self.signatureHeader: signature.base64EncodedString(),
        ]
    }

    /// The string both sides sign and verify. `path` has no query and keeps the /api prefix.
    static func canonicalString(method: String, path: String, signedAt: String, nonce: String, body: Data) -> String {
        let pathOnly = path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? path
        return [method.uppercased(), pathOnly, signedAt, nonce, sha256Hex(body)].joined(separator: "\n")
    }

    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    /// ISO 8601 with milliseconds, like JavaScript's `toISOString()`.
    static func timestamp(_ date: Date) -> String {
        date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }

    /// 32 hex characters from 16 random bytes.
    static func randomNonce() -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
}

/// A machine's pairing QR: `borgdock://pair?server=<url>&code=<code>&secret=<base64url 32 bytes>`.
struct PairingLink: Hashable, Sendable {
    let server: URL?
    /// The server's code, "ABCD-EFGH".
    let code: String
    /// The QR's secret; nil when the code was typed.
    let secret: Data?
    /// The eight characters a typed code carries after the server's code; nil for a scanned QR.
    let typedSecret: String?

    init(server: URL?, code: String, secret: Data?, typedSecret: String? = nil) {
        self.server = server
        self.code = code
        self.secret = secret
        self.typedSecret = typedSecret
    }

    init?(url: URL) {
        guard url.scheme == "borgdock", url.host() == "pair",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        else { return nil }
        let value = { (name: String) in items.first { $0.name == name }?.value }
        guard let code = value("code"), !code.isEmpty, let secret = value("secret").flatMap(Self.base64URLDecode) else { return nil }
        self.init(server: value("server").flatMap(ServerSettings.normalize), code: code, secret: secret)
    }

    /// A code typed from the machine's screen, "ABCD-EFGH-JKMN-PQRS": the server's code ABCD-EFGH plus the secret
    /// JKMNPQRS that only the machine knows. Like the QR's secret, it keys the proof, so the server can't pair a key itself.
    init?(typedCode: String) {
        let characters = Self.typedCharacters(typedCode)
        guard characters.count == 16 else { return nil }
        let code = String(characters.prefix(4)) + "-" + String(characters.dropFirst(4).prefix(4))
        self.init(server: nil, code: code, secret: nil, typedSecret: String(characters.suffix(8)))
    }

    /// base64(HMAC-SHA256(key, devicePublicKey bytes)), keyed with the QR's secret or the typed secret's UTF-8.
    func proof(devicePublicKey: Data) -> PairingProof {
        let keyData = secret ?? Data((typedSecret ?? "").utf8)
        let mac = HMAC<SHA256>.authenticationCode(for: devicePublicKey, using: SymmetricKey(data: keyData))
        return PairingProof(code: code, proof: Data(mac).base64EncodedString())
    }

    /// Upper case, letters and digits only, read the way Crockford's alphabet is: O is 0, I and L are 1.
    static func typedCharacters(_ text: String) -> String {
        String(text.uppercased().compactMap { character -> Character? in
            switch character {
            case "O": "0"
            case "I", "L": "1"
            default: character.isASCII && (character.isLetter || character.isNumber) ? character : nil
            }
        })
    }

    static func base64URLDecode(_ text: String) -> Data? {
        var base64 = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        return Data(base64Encoded: base64)
    }
}
