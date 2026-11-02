import Foundation
import Security

/// Keeps one bearer token per server in the Keychain, never synced off this device. Readable after first
/// unlock so notification actions (which all require unlocking) and background refreshes can use it.
struct KeychainTokenStore: Sendable {
    let service: String

    init(service: String = "dev.borght.borgdock.session") {
        self.service = service
    }

    func token(for server: URL) -> String? {
        var query = baseQuery(for: server)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func save(_ token: String, for server: URL) throws {
        let data = Data(token.utf8)
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(baseQuery(for: server) as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            let insert = baseQuery(for: server).merging(update) { _, new in new }
            status = SecItemAdd(insert as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    func delete(for server: URL) {
        SecItemDelete(baseQuery(for: server) as CFDictionary)
    }

    private func baseQuery(for server: URL) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: server.absoluteString,
        ]
    }
}

struct KeychainError: LocalizedError {
    let status: OSStatus
    var errorDescription: String? { "Couldn't save the sign-in to the Keychain (\(status))." }
}
