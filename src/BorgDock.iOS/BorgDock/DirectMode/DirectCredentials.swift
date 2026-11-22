import Foundation

/// The tokens BorgDock Review reads GitHub and Azure DevOps with. They stay in this device's Keychain: there is no
/// server to keep them on.
struct DirectCredentials: Codable, Equatable, Sendable {
    struct GitHub: Codable, Equatable, Sendable, Identifiable {
        var login: String
        var token: String
        var name: String?
        var avatarUrl: String?

        var id: String { login.lowercased() }
        var account: GitHubAccount { GitHubAccount(login: login, token: token) }
    }

    var gitHub: [GitHub] = []
    var azureDevOps: AdoConnection?
}

/// One Keychain item holding the credentials as JSON.
struct DirectCredentialStore: Sendable {
    private let keychain = KeychainTokenStore(service: "dev.borght.borgdock.direct")
    /// The Keychain stores by address; this one names the item.
    private static let item = URL(string: "borgdock-review://credentials")!

    func load() -> DirectCredentials {
        keychain.token(for: Self.item).flatMap { try? JSONDecoder().decode(DirectCredentials.self, from: Data($0.utf8)) } ?? DirectCredentials()
    }

    func save(_ credentials: DirectCredentials) throws {
        let json = String(decoding: try JSONEncoder().encode(credentials), as: UTF8.self)
        try keychain.save(json, for: Self.item)
    }

    func clear() {
        keychain.delete(for: Self.item)
    }
}
