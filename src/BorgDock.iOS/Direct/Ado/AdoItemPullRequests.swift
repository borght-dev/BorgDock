import Foundation

// Which pull requests belong to a work item, the desktop's rules (CLAUDE.md, Dispatch) as the server's
// `borgdock/item-pull-requests.ts` has them: a PR belongs to an item that ADO links it to or that it mentions (AB# in
// its title or body, the id in its branch). The one whose title or branch names the item is the item's own. One linked
// on several of my items that names none of them is shared (an epic's plan PR on every PBI). ADO links carry ADO's
// repository id, never GitHub's, and numbers collide across repositories, so a link counts only where the repository
// behind that id is known. Change a rule here and on the server together.

/// A pull request seen somewhere: GitHub's open list, an agent's thread, or a lookup on GitHub.
struct AdoCandidatePullRequest: Sendable, Equatable {
    /// owner/repo
    var repository: String?
    var number: Int
    var url: String
    var title: String
    var branch: String?
    var state: PullRequestState
    var isDraft: Bool
    var checks: String?
    var author: String?
    var updatedAt: String?
    /// Work items it mentions: AB# in its title or body, an id in its branch.
    var mentions: [Int]
    /// A thread on the item has it; those link by number alone. The phone has no threads, so nothing it reads sets this.
    var onItemThread: Bool
}

extension AdoCandidatePullRequest {
    /// A pull request as GitHub reports it.
    init(_ pr: PrSummary) {
        self.init(
            repository: "\(pr.owner)/\(pr.repo)", number: pr.number, url: pr.url, title: pr.title, branch: pr.headRef,
            state: PullRequestState(rawValue: pr.state.rawValue) ?? .unknown, isDraft: pr.isDraft, checks: AdoItemPullRequests.checksLabel(pr.checks),
            author: pr.author.name ?? pr.author.login, updatedAt: pr.updatedAt, mentions: pr.workItemIds, onItemThread: false
        )
    }
}

/// One of my items and the pull requests ADO links to it, to tell a shared pull request.
struct AdoLinkedItem: Sendable, Equatable {
    let id: Int
    let links: [AdoPullRequestLink]
}

enum AdoItemPullRequests {
    /// Whether a title or branch names the item: `AB#61021`, `AB61021`, or the bare number as a word of its own.
    static func names(_ text: String, item id: Int) -> Bool {
        let units = Array(text.utf16)
        let digits = Array(String(id).utf16)
        guard !digits.isEmpty, units.count >= digits.count else { return false }
        return (0...(units.count - digits.count)).contains { start in
            let end = start + digits.count
            guard units[start..<end].elementsEqual(digits), end == units.count || !isWord(units[end]) else { return false }
            return start == 0 || !isWord(units[start - 1]) || units[..<start].suffix(2).elementsEqual("AB".utf16)
        }
    }

    /// JavaScript's `\w`: an ASCII letter, a digit or an underscore.
    private static func isWord(_ unit: UInt16) -> Bool {
        switch unit {
        case 0x30...0x39, 0x41...0x5A, 0x61...0x7A, 0x5F: true
        default: false
        }
    }

    private static let pullRequestURL = AdoPattern(#"^https://github\.com/([A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+)/pull/[0-9]+"#, caseInsensitive: true)

    /// `owner/repo` of a GitHub pull request's address.
    static func repository(ofURL url: String) -> String? {
        pullRequestURL.firstMatch(in: url)?[1]
    }

    static func checksLabel(_ checks: CheckSummary) -> String? {
        if checks.total == 0 { return nil }
        return checks.failed > 0 ? "failing" : checks.pending > 0 ? "pending" : "passing"
    }

    private static func key(of pr: AdoCandidatePullRequest) -> String {
        if let repository = pr.repository, !repository.isEmpty { return "\(repository.lowercased())#\(pr.number)" }
        return pr.url.lowercased()
    }

    private static func titleAndBranch(_ pr: AdoCandidatePullRequest) -> String {
        "\(pr.title) \(pr.branch ?? "")"
    }

    /// One candidate per pull request. Earlier sources win the fields (pass GitHub's first); a known state beats
    /// `unknown`, and what each source knows about mentions and threads adds up.
    static func merge(_ candidates: [AdoCandidatePullRequest]) -> [AdoCandidatePullRequest] {
        var merged: [AdoCandidatePullRequest] = []
        var position: [String: Int] = [:]
        for candidate in candidates {
            guard let index = position[key(of: candidate)] else {
                position[key(of: candidate)] = merged.count
                merged.append(candidate)
                continue
            }
            var known = merged[index]
            if known.title.isEmpty { known.title = candidate.title }
            known.branch = known.branch ?? candidate.branch
            if known.state == .unknown { known.state = candidate.state }
            known.checks = known.checks ?? candidate.checks
            known.author = known.author ?? candidate.author
            known.updatedAt = known.updatedAt ?? candidate.updatedAt
            var seen = Set<Int>()
            known.mentions = (known.mentions + candidate.mentions).filter { seen.insert($0).inserted }
            known.onItemThread = known.onItemThread || candidate.onItemThread
            merged[index] = known
        }
        return merged
    }

    /// ADO repository ids learned from this item: a link whose number matches exactly one repository's pull request that
    /// names or mentions the item. Only ids not known yet; lower-cased.
    static func learnRepositories(itemId: Int, links: [AdoPullRequestLink], candidates: [AdoCandidatePullRequest], known: [String: String]) -> [String: String] {
        var learned: [String: String] = [:]
        for link in links {
            let id = link.repositoryId.lowercased()
            if known[id] != nil || learned[id] != nil { continue }
            let repositories = Set(candidates
                .filter { $0.number == link.number && ($0.mentions.contains(itemId) || names(titleAndBranch($0), item: itemId)) }
                .compactMap { $0.repository?.isEmpty == false ? $0.repository?.lowercased() : nil })
            guard repositories.count == 1, let only = repositories.first else { continue }
            learned[id] = candidates.first { $0.repository?.lowercased() == only }?.repository
        }
        return learned
    }

    private static func adoLinks(_ links: [AdoPullRequestLink], _ pr: AdoCandidatePullRequest, numberAlone: Bool, repositories: [String: String]) -> Bool {
        links.contains { link in
            guard link.number == pr.number else { return false }
            guard let repository = repositories[link.repositoryId.lowercased()], !repository.isEmpty else { return numberAlone }
            return repository.lowercased() == pr.repository?.lowercased()
        }
    }

    private static func belongs(_ pr: AdoCandidatePullRequest, to itemId: Int, links: [AdoPullRequestLink], numberAlone: Bool, repositories: [String: String]) -> Bool {
        pr.mentions.contains(itemId) || names(titleAndBranch(pr), item: itemId) || adoLinks(links, pr, numberAlone: numberAlone, repositories: repositories)
    }

    private static func stateRank(_ state: PullRequestState) -> Int {
        switch state {
        case .open: 0
        case .merged: 1
        case .unknown: 2
        case .closed: 3
        }
    }

    /// Every pull request linked to the item: its own first, then the others, shared ones last; open before merged.
    /// `myItems` are my other items and their ADO links, to tell a shared pull request.
    static func rows(itemId: Int, links: [AdoPullRequestLink], myItems: [AdoLinkedItem] = [], candidates: [AdoCandidatePullRequest], repositories: [String: String]) -> [ItemPullRequest] {
        let others = myItems.filter { $0.id != itemId }
        let rows = merge(candidates)
            .filter { belongs($0, to: itemId, links: links, numberAlone: $0.onItemThread, repositories: repositories) }
            .map { pr -> (row: ItemPullRequest, rank: Int) in
                let own = names(titleAndBranch(pr), item: itemId)
                let linkedMine = [itemId] + others.filter { belongs(pr, to: $0.id, links: $0.links, numberAlone: false, repositories: repositories) }.map(\.id)
                let shared = !own && linkedMine.count > 1 && !linkedMine.contains { names(titleAndBranch(pr), item: $0) }
                let row = ItemPullRequest(
                    number: pr.number, url: pr.url, branch: pr.branch, state: pr.state, title: pr.title, isDraft: pr.isDraft, checks: pr.checks,
                    repository: pr.repository, own: own, shared: shared, author: pr.author, updatedAt: pr.updatedAt
                )
                return (row, own ? 0 : shared ? 2 : 1)
            }
        return rows.enumerated()
            .sorted { first, second in
                let a = (first.element.rank, stateRank(first.element.row.state), -first.element.row.number, first.offset)
                let b = (second.element.rank, stateRank(second.element.row.state), -second.element.row.number, second.offset)
                return a < b
            }
            .map(\.element.row)
    }
}
