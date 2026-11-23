import Foundation

/// Which pull requests the phone reads: the repositories it watches and the searches for what involves you. The
/// server keeps the same in its config and preferences (`github/repositories.ts`).
struct GitHubSettings: Codable, Equatable, Sendable {
    /// `owner/repo`; every open pull request of these is listed, yours or not.
    var repositories: [String] = []
    var includeInvolving = true
    var includeTeamRequests = true
    /// A pull request not updated for this many days counts as stale.
    var staleAfterDays = 7
    /// How old the list may get before a screen that asks reads GitHub again. Nil: `GitHubDirect.pollEvery`.
    var refreshSeconds: Int?

    static let refreshChoices = [60, 120, 300]

    static let storeKey = "github.settings"
    static let maxRepositories = 200

    init() {}

    /// A setting a later version adds is missing from what an earlier one stored: it takes its default.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        repositories = try container.decodeIfPresent([String].self, forKey: .repositories) ?? []
        includeInvolving = try container.decodeIfPresent(Bool.self, forKey: .includeInvolving) ?? true
        includeTeamRequests = try container.decodeIfPresent(Bool.self, forKey: .includeTeamRequests) ?? true
        staleAfterDays = try container.decodeIfPresent(Int.self, forKey: .staleAfterDays) ?? 7
        refreshSeconds = try container.decodeIfPresent(Int.self, forKey: .refreshSeconds)
    }

    /// Valid owner/repo names, each once: GitHub ignores case, so the first spelling wins.
    static func cleanRepositories(_ names: [String]) -> [String] {
        var seen: Set<String> = []
        var clean: [String] = []
        for name in names {
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard trimmed.wholeMatch(of: #/[\w.-]+/[\w.-]+/#) != nil, seen.insert(trimmed.lowercased()).inserted else { continue }
            clean.append(trimmed)
        }
        return Array(clean.prefix(maxRepositories))
    }

    /// The searches for pull requests that involve you, in any repository. GitHub's `involves` is author, assignee,
    /// mentions and commenter only: a review request (yours or your team's) never matches it, and neither does a
    /// review without a comment. `user-review-requested` leaves out the requests made to your teams.
    var involvementSearches: [String] {
        guard includeInvolving else { return [] }
        return [
            "is:open is:pr involves:@me archived:false",
            "is:open is:pr \(includeTeamRequests ? "review-requested" : "user-review-requested"):@me archived:false",
            "is:open is:pr reviewed-by:@me archived:false",
        ]
    }

    static func repositorySearch(_ name: String) -> String { "is:open is:pr archived:false repo:\(name)" }

    /// A repository's pull requests merged on or after `since` (`2026-11-16`).
    static func mergedSearch(_ name: String, since: String) -> String { "is:merged is:pr merged:>=\(since) repo:\(name)" }

    /// Merged pull requests that involve you, in any repository.
    static func mergedInvolvingSearch(since: String) -> String { "is:merged is:pr merged:>=\(since) involves:@me archived:false" }
}

/// What the phone remembers about pull requests that GitHub doesn't keep: snoozes and when a review request was first seen.
struct GitHubMemory: Codable, Equatable, Sendable {
    /// Until when (ISO), by pull request key.
    var snoozes: [String: String] = [:]
    /// When a review request was first seen (ISO), by `<pull request key>:<lower-case login>`.
    var reviewRequests: [String: String] = [:]

    static let storeKey = "github.memory"

    /// Remembers when each request was first seen and forgets the ones that are gone.
    mutating func syncReviewRequests(_ keys: [String], at: String) {
        var live: [String: String] = [:]
        for key in keys { live[key] = reviewRequests[key] ?? at }
        reviewRequests = live
    }

    /// Drops snoozes that ran out.
    mutating func prune(now: Date) {
        snoozes = snoozes.filter { (GitHubTime.date($0.value) ?? .distantPast) >= now }
    }
}
