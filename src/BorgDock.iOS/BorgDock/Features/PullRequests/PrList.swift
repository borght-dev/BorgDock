import Foundation

/// The desktop's Pull requests list (`services/pr-list/model.ts`): every open pull request the server reads, filtered
/// by a pill, searched, sorted and grouped by author, repository or status. Mockup: design/ios-flow/mockups.html,
/// section 03.
enum PrListFilter: String, CaseIterable, Identifiable {
    case all, yourTurn, mine, failing, ready, waiting

    var id: String { rawValue }

    /// Focus's Waiting on others row opens the list on `.waiting` through this key.
    static let storageKey = "prs.filter"

    var title: String {
        switch self {
        case .all: "All"
        case .yourTurn: "Your turn"
        case .mine: "Mine"
        case .failing: "Failing"
        case .ready: "Ready"
        case .waiting: "Waiting"
        }
    }

    func matches(_ pr: PrSummary, myLogins: Set<String>) -> Bool {
        switch self {
        case .all: true
        case .yourTurn: pr.bucket == .you
        case .mine: pr.isMine
        case .failing: pr.checks.failed > 0
        case .ready: pr.bucket == .ready
        case .waiting: pr.isWaitingOnOthers(myLogins: myLogins)
        }
    }
}

enum PrListGrouping: String, CaseIterable, Identifiable {
    case author, repository, status, flat

    var id: String { rawValue }

    var title: String {
        switch self {
        case .author: "Author"
        case .repository: "Repository"
        case .status: "Status"
        case .flat: "None"
        }
    }
}

enum PrListSort: String, CaseIterable, Identifiable {
    case waiting, updated, newest, smallest, title

    var id: String { rawValue }

    var title: String {
        switch self {
        case .waiting: "Waiting longest"
        case .updated: "Recently updated"
        case .newest: "Newest"
        case .smallest: "Smallest first"
        case .title: "Title"
        }
    }

    /// The date a row shows, so the age next to each pull request explains the order.
    func shownDate(_ pr: PrSummary) -> String {
        switch self {
        case .waiting: pr.waitingSince
        case .newest: pr.createdAt
        case .updated, .smallest, .title: pr.updatedAt
        }
    }
}

struct PrListGroup: Identifiable, Equatable {
    enum Kind: Equatable {
        case author(Person, mine: Bool)
        case repository
        case status(FocusBucket)
        case dependencies
        case all
    }

    let id: String
    let title: String
    let kind: Kind
    let pullRequests: [PrSummary]

    /// Grouped by author the group already names who wrote each pull request.
    var namesAuthor: Bool { if case .author = kind { true } else { false } }
}

struct PrListQuery: Equatable {
    var filter: PrListFilter = .all
    var grouping: PrListGrouping = .author
    var sort: PrListSort = .waiting
    var search = ""
    var mineFirst = true
    var showDrafts = true
    /// Dependabot and Renovate pull requests in one group at the end instead of spread over the others.
    var dependenciesTogether = true
    /// Your GitHub logins, for Waiting.
    var myLogins: Set<String> = []

    func visible(_ prs: [PrSummary]) -> [PrSummary] {
        let terms = search.lowercased().split(separator: " ").map(String.init)
        return prs.filter { pr in
            filter.matches(pr, myLogins: myLogins) && (showDrafts || !pr.isDraft) && terms.allSatisfy { pr.searchText.contains($0) }
        }
    }

    /// Yours first when asked, drafts last, then the chosen order; the key settles ties so rows never jump.
    func sorted(_ prs: [PrSummary]) -> [PrSummary] {
        prs.sorted { a, b in
            if mineFirst, a.isMine != b.isMine { return a.isMine }
            if a.isDraft != b.isDraft { return !a.isDraft }
            switch sort {
            case .waiting where a.waitingSince != b.waitingSince: return a.waitingSince.sortDate < b.waitingSince.sortDate
            case .updated where a.updatedAt != b.updatedAt: return a.updatedAt.sortDate > b.updatedAt.sortDate
            case .newest where a.createdAt != b.createdAt: return a.createdAt.sortDate > b.createdAt.sortDate
            case .smallest where a.size != b.size: return a.size < b.size
            case .title where a.title != b.title: return a.title.localizedStandardCompare(b.title) == .orderedAscending
            default: return a.key < b.key
            }
        }
    }

    /// Groups come in the order of their first pull request, so the group that has waited longest leads; status groups
    /// keep the bucket order and dependency updates come last.
    func groups(_ prs: [PrSummary]) -> [PrListGroup] {
        let shown = sorted(visible(prs))
        guard grouping != .flat else {
            return shown.isEmpty ? [] : [PrListGroup(id: "all", title: "Pull requests", kind: .all, pullRequests: shown)]
        }
        let dependencies = dependenciesTogether ? shown.filter(\.isDependencyUpdate) : []
        let rest = dependenciesTogether ? shown.filter { !$0.isDependencyUpdate } : shown
        var groups = group(rest)
        if !dependencies.isEmpty {
            groups.append(PrListGroup(id: "dependencies", title: "Dependency updates", kind: .dependencies, pullRequests: dependencies))
        }
        return groups
    }

    private func group(_ prs: [PrSummary]) -> [PrListGroup] {
        switch grouping {
        case .status:
            return [FocusBucket.you, .ready, .wait, .stale].compactMap { bucket in
                let inBucket = prs.filter { $0.bucket == bucket }
                guard !inBucket.isEmpty else { return nil }
                return PrListGroup(id: "status:\(bucket.rawValue)", title: bucket.groupTitle, kind: .status(bucket), pullRequests: inBucket)
            }
        case .repository:
            return inOrderOfFirst(prs, by: { "\($0.owner)/\($0.repo)" }).map { name, prs in
                PrListGroup(id: "repo:\(name)", title: name, kind: .repository, pullRequests: prs)
            }
        case .author:
            return inOrderOfFirst(prs, by: { $0.author.login.lowercased() }).map { login, prs in
                let mine = prs[0].isMine
                return PrListGroup(id: "author:\(login)", title: mine ? "You" : prs[0].author.displayName, kind: .author(prs[0].author, mine: mine), pullRequests: prs)
            }
        case .flat:
            return []
        }
    }

    private func inOrderOfFirst(_ prs: [PrSummary], by key: (PrSummary) -> String) -> [(String, [PrSummary])] {
        var order: [String] = []
        var members: [String: [PrSummary]] = [:]
        for pr in prs {
            let name = key(pr)
            if members[name] == nil { order.append(name) }
            members[name, default: []].append(pr)
        }
        return order.map { ($0, members[$0] ?? []) }
    }

    func count(_ filter: PrListFilter, in prs: [PrSummary]) -> Int {
        prs.filter { filter.matches($0, myLogins: myLogins) && (showDrafts || !$0.isDraft) }.count
    }
}

extension FocusBucket {
    /// A status group's header in the pull request list.
    var groupTitle: String {
        switch self {
        case .you: "Your turn"
        case .ready: "Ready to merge"
        case .wait: "Waiting on others"
        case .stale: "Stale"
        }
    }
}

/// The line a folded group shows: at most two facts, what needs attention first, else how long the oldest waited.
/// "2 failing · 1 ready to merge", "1 asks you · oldest 2 d".
enum PrGroupSummary {
    struct Part: Equatable {
        let text: String
        var alert = false
    }

    static func parts(_ prs: [PrSummary], now: Date = .now) -> [Part] {
        let failing = prs.filter { $0.checks.failed > 0 }.count
        let asks = prs.filter { $0.bucket == .you && !$0.isMine }.count
        let ready = prs.filter { $0.bucket == .ready }.count
        var parts: [Part] = []
        if failing > 0 { parts.append(Part(text: "\(failing) failing", alert: true)) }
        if asks > 0 { parts.append(Part(text: asks == 1 ? "1 asks you" : "\(asks) ask you")) }
        if ready > 0 { parts.append(Part(text: "\(ready) ready to merge")) }
        if parts.count < 2, let oldest = prs.map(\.waitingSince).min(by: { $0.sortDate < $1.sortDate }) {
            let age = ShortTime.age(oldest, now: now)
            if !age.isEmpty { parts.append(Part(text: "oldest \(age)")) }
        }
        return Array(parts.prefix(2))
    }
}

/// Review all: one author's pull requests in Quick Review, oldest first, without the ones you can't approve and merge
/// yet. The desktop's `services/author-run.ts`; the phone has no E2E report or shared CI failures, so any failing check
/// holds a pull request.
enum AuthorRun {
    static func queue(_ prs: [PrSummary], author login: String, myLogins: Set<String>) -> [PrSummary] {
        let author = login.lowercased()
        let mine = Set(myLogins.map { $0.lowercased() })
        guard !mine.contains(author) else { return [] }
        return prs
            .filter { pr in
                pr.author.login.lowercased() == author && pr.state == .open && !pr.isDraft && !pr.isMine
                    && !pr.isApprovedAtHead(by: mine)
                    && pr.mergeable != .conflicting && pr.reviewDecision != .changesRequested && pr.checks.failed == 0
            }
            .sorted { $0.createdAt.sortDate < $1.createdAt.sortDate }
    }
}

/// One step of a pull request's way in: Checks, Review, Merge.
struct PrTrackStep: Hashable {
    enum Mark: Hashable {
        /// Done and fine.
        case done
        case failed
        /// Needs the author: changes requested.
        case attention
        case running
        /// Waits on you.
        case yours
        /// Not there yet.
        case open
    }

    let label: String
    let mark: Mark
}

extension PrSummary {
    /// When the pull request started waiting. The summary carries no review-request time, so this is when it opened.
    var waitingSince: String { createdAt }

    /// Lines added and removed, for Smallest first.
    var size: Int { additions + deletions }

    /// Dependabot or Renovate, however GitHub spells the account: `dependabot`, `dependabot[bot]`, `app/renovate`.
    var isDependencyUpdate: Bool {
        var login = author.login.lowercased()
        if login.hasPrefix("app/") { login.removeFirst(4) }
        if login.hasSuffix("[bot]") { login.removeLast(5) }
        return login == "dependabot" || login == "renovate"
    }

    /// It involves you and waits on someone else: yours under review, or one you reviewed. Drafts wait on their author.
    func isWaitingOnOthers(myLogins: Set<String>) -> Bool {
        guard bucket == .wait, !isDraft else { return false }
        let mine = Set(myLogins.map { $0.lowercased() })
        return isMine || reviewedHeadSha != nil || approvedBy.contains { mine.contains($0.lowercased()) }
    }

    /// You approved it and nothing was pushed since. Without the commit of your review an approval counts.
    func isApprovedAtHead(by myLogins: Set<String>) -> Bool {
        guard approvedBy.contains(where: { myLogins.contains($0.lowercased()) }) else { return false }
        return reviewedHeadSha == nil || reviewedHeadSha == headSha
    }

    /// Where the pull request is stuck, as three steps.
    var track: [PrTrackStep] {
        let checks: PrTrackStep = if self.checks.failed > 0 {
            PrTrackStep(label: "\(self.checks.failed) failing", mark: .failed)
        } else if self.checks.pending > 0 {
            PrTrackStep(label: "Running", mark: .running)
        } else if self.checks.total == 0 {
            PrTrackStep(label: "No checks", mark: .open)
        } else {
            PrTrackStep(label: "Checks", mark: .done)
        }
        let approved = reviewDecision == .approved || (reviewDecision == nil && !approvedBy.isEmpty)
        let review: PrTrackStep = if reviewDecision == .changesRequested {
            PrTrackStep(label: "Changes", mark: .attention)
        } else if approved {
            PrTrackStep(label: approvedBy.count > 1 ? "\(approvedBy.count) approvals" : "Approved", mark: .done)
        } else if bucket == .you, !isMine {
            PrTrackStep(label: "Your review", mark: .yours)
        } else {
            PrTrackStep(label: "Review", mark: .open)
        }
        let merge: PrTrackStep = if isDraft {
            PrTrackStep(label: "Draft", mark: .open)
        } else if mergeable == .conflicting {
            PrTrackStep(label: "Conflicts", mark: .failed)
        } else if autoMerge {
            PrTrackStep(label: "Auto-merge", mark: .running)
        } else if canMerge, approved {
            PrTrackStep(label: "Ready", mark: .done)
        } else {
            PrTrackStep(label: "Merge", mark: .open)
        }
        return [checks, review, merge]
    }

    /// Title, number, repository, branch and author, lower-cased, for the search field.
    var searchText: String {
        [title, "#\(number)", "\(owner)/\(repo)", headRef, author.login, author.name ?? "", workItemIds.map { "ab#\($0)" }.joined(separator: " ")]
            .joined(separator: " ")
            .lowercased()
    }
}

extension String {
    /// ISO 8601 from the server; unparsable dates sort last.
    var sortDate: Date { ISODate.parse(self) ?? .distantPast }
}

/// The list in runs: an open group on its own, folded groups next to each other together in one card.
enum GroupRun: Identifiable, Equatable {
    case open(PrListGroup)
    case folded([PrListGroup])

    var id: String {
        switch self {
        case .open(let group): group.id
        case .folded(let groups): "folded:" + groups.map(\.id).joined(separator: ",")
        }
    }

    static func runs(_ groups: [PrListGroup], isFolded: (PrListGroup) -> Bool) -> [GroupRun] {
        var runs: [GroupRun] = []
        for group in groups {
            if !isFolded(group) {
                runs.append(.open(group))
            } else if case .folded(let earlier)? = runs.last {
                runs[runs.count - 1] = .folded(earlier + [group])
            } else {
                runs.append(.folded([group]))
            }
        }
        return runs
    }
}
