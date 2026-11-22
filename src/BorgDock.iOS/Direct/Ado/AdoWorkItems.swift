import Foundation
import Synchronization

/// What the item page asks of GitHub: its pull requests come from there, ADO only links them.
struct AdoPullRequestSource: Sendable {
    /// GitHub's open pull requests from the last poll.
    var open: @Sendable () async -> [PrSummary]
    /// One pull request from GitHub, in any state.
    var lookup: @Sendable (PrKey) async throws -> PrSummary

    /// No GitHub: an item shows no pull requests.
    static let none = AdoPullRequestSource(open: { [] }, lookup: { key in throw directError(404, "\(key.key) can't be read without GitHub.") })
}

/// Where the little this folder remembers between launches is kept.
protocol AdoKeyValueStore: Sendable {
    func data(forKey key: String) -> Data?
    func set(_ data: Data?, forKey key: String)
}

struct AdoUserDefaultsStore: AdoKeyValueStore {
    /// The suite to keep it in (an app group's); nil for the app's own defaults.
    let suiteName: String?

    init(suiteName: String? = nil) {
        self.suiteName = suiteName
    }

    // Looked up per call: `UserDefaults` is safe to use from any thread, but the SDK doesn't call it `Sendable`.
    private var defaults: UserDefaults { suiteName.flatMap { UserDefaults(suiteName: $0) } ?? .standard }

    func data(forKey key: String) -> Data? { defaults.data(forKey: key) }

    func set(_ data: Data?, forKey key: String) { defaults.set(data, forKey: key) }
}

/// Remembers until the app quits: for tests and previews.
final class AdoMemoryStore: AdoKeyValueStore {
    private let values = Mutex<[String: Data]>([:])

    func data(forKey key: String) -> Data? { values.withLock { $0[key] } }

    func set(_ data: Data?, forKey key: String) { values.withLock { $0[key] = data } }
}

/// The work item page read straight from Azure DevOps, with the pull requests GitHub has for it: the server's
/// `ItemDetails` (`borgdock/item-detail.ts`) without a server. There are no agent threads on the phone and no list of
/// my items, so a pull request counts through GitHub's open list and ADO's links alone, and none is marked shared.
actor AdoWorkItems: WorkItemBackend {
    /// GitHub reads for pull requests only ADO knows, per item page; each gets a few seconds.
    private static let lookups = 6
    private static let commentLimit = 30_000
    private static let repositoriesKey = "ado.githubRepositories"

    nonisolated let connection: AdoConnection?
    private let client: AdoClient?
    private let github: AdoPullRequestSource
    private let store: AdoKeyValueStore
    private let lookupTime: Duration
    /// Which GitHub repository each ADO repository id stands for, learned from items and kept in `store`.
    private var repositories: [String: String]

    /// `lookupTime` is how long one GitHub read may take before the page goes without it.
    init(
        connection: AdoConnection?,
        session: URLSession = .shared,
        pullRequests: AdoPullRequestSource = .none,
        store: AdoKeyValueStore = AdoUserDefaultsStore(),
        lookupTime: Duration = .seconds(8)
    ) {
        self.connection = connection
        client = connection.map { AdoClient(connection: $0, session: session) }
        github = pullRequests
        self.store = store
        self.lookupTime = lookupTime
        repositories = store.data(forKey: Self.repositoriesKey).flatMap { try? JSONDecoder().decode([String: String].self, from: $0) } ?? [:]
    }

    // MARK: WorkItemBackend

    func item(_ id: Int) async throws -> ItemDetail {
        let client = try connected()
        let read = try await client.itemRead(id)
        async let parent = parent(of: read.relations, client: client)
        async let linked = linkedPullRequests(of: id, links: read.item.pullRequestLinks)
        return AdoItemPage.detail(of: read, parent: await parent, pullRequests: await linked)
    }

    /// Posts as the connection's account, as markdown. A comment never moves the item's state.
    func postItemComment(itemId: Int, text: String) async throws -> ItemComment {
        let client = try connected()
        if AdoText.trim(text).isEmpty { throw directError(400, "The comment is empty.") }
        if text.utf16.count > Self.commentLimit { throw directError(400, "The comment is longer than 30,000 characters.") }
        return AdoItemPage.comment(try await client.addComment(itemId, text: text))
    }

    /// Several items' summaries in the order asked, for the AB# chips of a pull request. An id that doesn't exist or
    /// can't be read is left out.
    func summaries(_ ids: [Int]) async throws -> [WorkItemSummary] {
        try await connected().summaries(ids)
    }

    /// Without a server every image and attachment has its own `http(s)` address; anything else loads from nowhere.
    nonisolated func resolve(_ pathOrURL: String) -> URL? {
        guard let url = URL(string: pathOrURL), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return nil }
        return url
    }

    /// The `Authorization` header an attachment of this connection's organization loads with; nil for any other
    /// address, so the credential never leaves the organization.
    nonisolated func authorization(for url: URL) -> String? {
        guard let connection, connection.ownsAttachment(url) else { return nil }
        return connection.credential.authorization
    }

    private func connected() throws -> AdoClient {
        guard let client else { throw directError(503, "Connect Azure DevOps in Settings to open work items.") }
        return client
    }

    // MARK: Parent and pull requests

    private func parent(of relations: [AdoRelation], client: AdoClient) async -> ItemParent? {
        guard let id = AdoItemPage.parentId(of: relations) else { return nil }
        return (try? await client.titles([id]))?.first ?? ItemParent(id: id, title: "", typeName: "")
    }

    /// GitHub's open pull requests, then a GitHub read for each one ADO links that the open list doesn't have (merged
    /// and closed ones), once the repository behind ADO's id is known.
    private func linkedPullRequests(of itemId: Int, links: [AdoPullRequestLink]) async -> [ItemPullRequest] {
        let open = await github.open()
        let known = open.map { AdoCandidatePullRequest($0) }
        learn(AdoItemPullRequests.learnRepositories(itemId: itemId, links: links, candidates: known, known: repositories))
        let repositories = self.repositories

        let openKeys = Set(open.map { "\($0.owner)/\($0.repo)#\($0.number)".lowercased() })
        var wanted: [PrKey] = []
        var seen = openKeys
        func want(_ repository: String, _ number: Int) {
            let names = repository.split(separator: "/", omittingEmptySubsequences: false)
            guard names.count >= 2, seen.insert("\(repository)#\(number)".lowercased()).inserted else { return }
            wanted.append(PrKey(owner: String(names[0]), repo: String(names[1]), number: number))
        }
        for row in AdoItemPullRequests.rows(itemId: itemId, links: links, candidates: known, repositories: repositories) {
            if let repository = row.repository, !repository.isEmpty { want(repository, row.number) }
        }
        for link in links {
            if let repository = repositories[link.repositoryId.lowercased()], !repository.isEmpty { want(repository, link.number) }
        }

        let looked = await lookUp(Array(wanted.prefix(Self.lookups)))
        return AdoItemPullRequests.rows(itemId: itemId, links: links, candidates: looked.map { AdoCandidatePullRequest($0) } + known, repositories: repositories)
    }

    private func learn(_ learned: [String: String]) {
        if learned.isEmpty { return }
        repositories.merge(learned) { _, new in new }
        store.set(try? JSONEncoder().encode(repositories), forKey: Self.repositoriesKey)
    }

    /// The pull requests GitHub answered for in time, in the order asked.
    private func lookUp(_ keys: [PrKey]) async -> [PrSummary] {
        let lookup = github.lookup
        let time = lookupTime
        return await withTaskGroup(of: (Int, PrSummary?).self) { group in
            for (index, key) in keys.enumerated() {
                group.addTask { (index, await Self.first(within: time) { try await lookup(key) }) }
            }
            var found: [(Int, PrSummary)] = []
            for await (index, pr) in group {
                if let pr { found.append((index, pr)) }
            }
            return found.sorted { $0.0 < $1.0 }.map(\.1)
        }
    }

    /// What `work` answers within `time`, or nil when it fails or takes longer. The page never waits for a read that
    /// ignores being cancelled.
    private static func first<Value: Sendable>(within time: Duration, _ work: @escaping @Sendable () async throws -> Value) async -> Value? {
        let (answers, answer) = AsyncStream<Value?>.makeStream()
        let read = Task { answer.yield(try? await work()) }
        let timer = Task {
            try? await Task.sleep(for: time)
            answer.yield(nil)
        }
        defer {
            read.cancel()
            timer.cancel()
        }
        for await value in answers { return value }
        return nil
    }
}
