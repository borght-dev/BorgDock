import Foundation
import Observation

/// BorgDock Review's accounts and the readers built from them: GitHub and Azure DevOps straight from this phone.
/// Adding or removing an account rebuilds the readers; what they remembered (watched repositories, snoozes, the last
/// list) is on disk and survives.
@MainActor
@Observable
final class DirectSession {
    private(set) var credentials: DirectCredentials
    private(set) var gitHub: GitHubDirect
    private(set) var workItems: AdoWorkItems
    /// Loads images with the accounts' tokens where they are needed.
    private(set) var imageLoader: ImageLoader

    /// Ask for Face ID before a merge or an approval. Kept on this phone.
    var faceIdForActions: Bool {
        didSet { defaults.set(faceIdForActions, forKey: Keys.faceId) }
    }

    @ObservationIgnored private let vault: DirectCredentialStore
    @ObservationIgnored private let store: FileStore
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let session: URLSession

    private enum Keys {
        static let faceId = "direct.faceIdForActions"
    }

    init(vault: DirectCredentialStore = DirectCredentialStore(), store: FileStore = DirectSession.defaultStore, defaults: UserDefaults = .standard, session: URLSession = .shared, credentials: DirectCredentials? = nil) {
        self.vault = vault
        self.store = store
        self.defaults = defaults
        self.session = session
        let credentials = credentials ?? vault.load()
        self.credentials = credentials
        faceIdForActions = defaults.bool(forKey: Keys.faceId)
        // Placeholders: `rebuild` below wires the two readers to each other, which needs `self`.
        gitHub = GitHubDirect(accounts: [], store: store, session: session)
        workItems = AdoWorkItems(connection: nil, session: session)
        imageLoader = ImageLoader(session: session)
        rebuild()
    }

    /// Application Support/Direct: watched repositories, snoozes and the last pull request list.
    nonisolated static var defaultStore: FileStore {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory
        return FileStore(directory: support.appendingPathComponent("Direct", isDirectory: true))
    }

    var hasGitHub: Bool { !credentials.gitHub.isEmpty }
    var hasAzureDevOps: Bool { credentials.azureDevOps != nil }

    // MARK: - GitHub

    /// Checks the token with GitHub and keeps it under the login it belongs to; a second token for a login replaces the first.
    @discardableResult
    func addGitHubAccount(token: String) async throws -> Person {
        let token = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else { throw APIError.server(status: 400, message: "Paste a GitHub token first.") }
        let me = try await GitHubDirect.whoIs(token: token, session: session)
        var next = credentials
        next.gitHub.removeAll { $0.login.lowercased() == me.login.lowercased() }
        next.gitHub.append(DirectCredentials.GitHub(login: me.login, token: token, name: me.name, avatarUrl: me.avatarUrl))
        try save(next)
        return me
    }

    func removeGitHubAccount(_ login: String) {
        var next = credentials
        next.gitHub.removeAll { $0.login.lowercased() == login.lowercased() }
        try? save(next)
        if next.gitHub.isEmpty { store.remove(forKey: GitHubDirect.focusStoreKey) }
    }

    /// `owner/repo` names to list every open pull request of.
    func watch(_ repositories: [String]) async {
        await gitHub.watch(repositories)
    }

    // MARK: - Azure DevOps

    /// Checks the connection by asking Azure DevOps who the token is, then keeps it.
    func connectAzureDevOps(_ connection: AdoConnection) async throws {
        try await AdoWorkItems(connection: connection, session: session).verify()
        var next = credentials
        next.azureDevOps = connection
        try save(next)
    }

    func disconnectAzureDevOps() {
        var next = credentials
        next.azureDevOps = nil
        try? save(next)
    }

    // MARK: - Readers

    private func save(_ next: DirectCredentials) throws {
        try vault.save(next)
        credentials = next
        rebuild()
    }

    /// GitHub names work items and Azure DevOps names pull requests, so each reader looks things up through the other.
    private func rebuild() {
        let ado = AdoWorkItems(
            connection: credentials.azureDevOps, session: session,
            pullRequests: AdoPullRequestSource(
                open: { [weak self] in await self?.gitHub.openPullRequests() ?? [] },
                lookup: { [weak self] key in
                    guard let self else { throw CancellationError() }
                    return try await self.gitHub.summary(key)
                }
            ),
            store: store
        )
        workItems = ado
        gitHub = GitHubDirect(accounts: credentials.gitHub.map(\.account), store: store, session: session) { ids in
            (try? await ado.summaries(ids)) ?? []
        }
        imageLoader = ImageLoader(session: session, rules: imageRules(ado))
    }

    /// Which images need a token to load: Azure DevOps attachments, and files uploaded to GitHub pull requests.
    private func imageRules(_ ado: AdoWorkItems) -> [ImageLoader.Rule] {
        let tokens = credentials.gitHub.map { "Bearer \($0.token)" }
        return [
            ImageLoader.Rule { url in ado.authorization(for: url).map { [$0] } ?? [] },
            ImageLoader.Rule { url in GitHubUploads.isUpload(url) ? tokens : [] },
        ]
    }
}

/// Files dropped into a pull request or comment on GitHub: private repositories serve them only to a signed-in reader.
enum GitHubUploads {
    static func isUpload(_ url: URL) -> Bool {
        guard url.scheme == "https", url.host() == "github.com" else { return false }
        let path = url.path()
        return path.hasPrefix("/user-attachments/") || path.contains("/assets/")
    }
}
