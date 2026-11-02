import Foundation

// Swift mirrors of shared/src/borgdock.ts for notes, references and search.

/// GET /api/activity/digest?since=<iso>: the lines of a new daily note's "Since yesterday" block.
struct Digest: Codable, Hashable, Sendable {
    struct Line: Codable, Hashable, Sendable {
        let text: String
        let refs: [String]
    }

    let since: String
    let lines: [Line]
}

/// POST /api/refs/resolve: live state for note and workstream references, keyed by the ref as sent.
struct ResolvedRef: Codable, Hashable, Sendable {
    let title: String
    let state: String
    let tone: Tone
    let url: String?
    let live: Bool
}

struct ResolveRefsRequest: Codable, Hashable, Sendable {
    let refs: [String]
}

/// GET /api/search?q=<text>. A bare number or AB#123 puts that item or pull request first.
struct SearchResults: Decodable, Hashable, Sendable {
    let query: String
    let pullRequests: [SearchPullRequest]
    let items: [WorkItemSummary]
    let threads: [ThreadSummary]

    static let empty = SearchResults(query: "", pullRequests: [], items: [], threads: [])

    init(query: String, pullRequests: [SearchPullRequest], items: [WorkItemSummary], threads: [ThreadSummary]) {
        self.query = query
        self.pullRequests = pullRequests
        self.items = items
        self.threads = threads
    }
}

/// The part of a `PrSummary` the search results show.
struct SearchPullRequest: Decodable, Hashable, Sendable, Identifiable {
    struct Checks: Decodable, Hashable, Sendable {
        let total: Int
        let failed: Int
        let pending: Int
    }

    let key: String
    let owner: String
    let repo: String
    let number: Int
    let title: String
    let state: String
    let isDraft: Bool
    let mergedAt: String?
    let updatedAt: String
    let checks: Checks?

    var id: String { key }
    var prKey: PrKey { PrKey(owner: owner, repo: repo, number: number) }
}

extension APIClient {
    func digest(since: Date) async throws -> Digest {
        try await get("/api/activity/digest", query: [URLQueryItem(name: "since", value: ISODates.format(since))])
    }

    func resolveRefs(_ refs: [String]) async throws -> [String: ResolvedRef] {
        try await post("/api/refs/resolve", body: ResolveRefsRequest(refs: refs))
    }

    func search(_ query: String) async throws -> SearchResults {
        try await get("/api/search", query: [URLQueryItem(name: "q", value: query)])
    }
}
