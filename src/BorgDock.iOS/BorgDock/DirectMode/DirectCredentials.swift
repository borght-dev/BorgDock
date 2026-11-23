import Foundation

/// The tokens BorgDock Review reads GitHub and Azure DevOps with. They stay in this device's Keychain: there is no
/// server to keep them on.
struct DirectCredentials: Codable, Equatable, Sendable {
    struct GitHub: Codable, Equatable, Sendable, Identifiable {
        var login: String
        var token: String
        var name: String?
        var avatarUrl: String?
        /// "Work", "Personal" or your own word: it names the account in Settings and when its token runs out.
        var label: String?
        /// When the token stops working, as GitHub said when it was added; nil for one that doesn't expire.
        var expiresAt: Date?
        var kind: GitHubTokenFacts.Kind?

        var id: String { login.lowercased() }

        /// "Work", or the login when no label was given.
        var shownLabel: String { label.flatMap { $0.isEmpty ? nil : $0 } ?? login }

        /// Whole days until the token expires; nil when it doesn't, or once it has.
        func daysLeft(now: Date = .now) -> Int? {
            guard let expiresAt, expiresAt > now else { return nil }
            return Int(expiresAt.timeIntervalSince(now) / 86_400)
        }

        /// Whole days since the token expired: 0 today, 1 yesterday. Nil while it still works.
        func expiredDaysAgo(now: Date = .now) -> Int? {
            guard let expiresAt, expiresAt <= now else { return nil }
            return Int(now.timeIntervalSince(expiresAt) / 86_400)
        }

        /// "Token expires in 6 days", once that is two weeks away or less.
        func expiryWarning(now: Date = .now) -> String? {
            if expiredDaysAgo(now: now) != nil { return "Token expired" }
            guard let days = daysLeft(now: now), days < 14 else { return nil }
            return days == 0 ? "Token expires today" : days == 1 ? "Token expires tomorrow" : "Token expires in \(days) days"
        }

        /// The token has run out, or does within three days: Settings marks it red, not amber.
        func expiresSoon(now: Date = .now) -> Bool {
            expiredDaysAgo(now: now) != nil || (daysLeft(now: now) ?? .max) < 3
        }
        var account: GitHubAccount { GitHubAccount(login: login, token: token) }
    }

    var gitHub: [GitHub] = []
    var azureDevOps: AdoConnection?
}

/// One Keychain item holding the credentials as JSON.
struct DirectCredentialStore: Sendable {
    private let keychain: KeychainTokenStore

    /// Tests name their own service, so they never read or replace the app's item.
    init(service: String = "dev.borght.borgdock.direct") {
        keychain = KeychainTokenStore(service: service)
    }

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
