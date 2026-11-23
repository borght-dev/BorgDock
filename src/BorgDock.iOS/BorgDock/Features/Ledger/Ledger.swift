import Foundation

// BorgDock Review's overview, "the Ledger" (design/review-app/mockups.html): every open pull request sits in one of
// five sections, and its row gives one reason, how long it has had that reason, its checks and its size. Pure: the
// pull requests and who is looking go in, the sections come out. Foundation only, so `swift test` covers it.

enum LedgerSection: String, CaseIterable, Sendable {
    case toReview, needsYou, ready, waiting, alsoOpen
    /// Search only: what merged in the last week.
    case merged

    /// The overview's sections, in the order the screen shows them.
    static let overview: [LedgerSection] = [.toReview, .needsYou, .ready, .waiting, .alsoOpen]

    var title: String {
        switch self {
        case .toReview: "To review"
        case .needsYou: "Yours, needs you"
        case .ready: "Ready to merge"
        case .waiting: "Waiting on others"
        case .alsoOpen: "Also open in your repositories"
        case .merged: "Merged this week"
        }
    }

    /// Folded until you open it.
    var folds: Bool { self == .waiting || self == .alsoOpen }

    /// Counts toward "16 involve you".
    var involvesYou: Bool { self != .alsoOpen && self != .merged }
}

/// What colours a row's edge and its reason.
enum LedgerTone: Sendable { case review, attention, failing, ready, merged }

struct LedgerReason: Equatable, Sendable {
    enum Kind: Sendable {
        case asked, teamAsked, reReview, dependencyUpdate
        case failing, conflicts, changesRequested, commented
        case approved
        case waitingOnReviewers, checksRunning, sharedFailure, draft, noReviewer, youReviewed
        case reviewing
        case merged
    }

    let kind: Kind
    let text: String
}

struct LedgerRow: Identifiable, Equatable, Sendable {
    let pr: PrSummary
    let section: LedgerSection
    let reason: LedgerReason
    /// The left edge; nil when the row waits on someone else or isn't yours to act on.
    let edge: LedgerTone?
    /// The reason's colour; nil for a routine one, which reads grey.
    let reasonTone: LedgerTone?
    /// Since when the row has had its reason: the age column.
    let since: Date?
    let mine: Bool

    var id: String { pr.key }
}

struct LedgerContext {
    /// Your GitHub logins, lower-cased.
    var logins: Set<String>
    /// Your team slugs, over every account.
    var teams: [String] = []
    var now: Date
    /// People by lower-cased login, for the first name a reason gives.
    var people: [String: Person] = [:]
    /// A red pull request whose every failure is shared with others and not its own doing.
    var failsOutside: (PrSummary) -> Bool = { _ in false }

    /// "Tom" for a login whose name is known, else the login; a team keeps its `@slug`.
    func firstName(_ login: String) -> String {
        if login.hasPrefix("@") { return login }
        return people[login.lowercased()]?.firstName ?? login
    }
}

struct Ledger: Equatable {
    struct Repository: Identifiable, Equatable {
        /// `owner/repo`.
        let name: String
        let rows: [LedgerRow]
        var id: String { name }
    }

    private let bySection: [LedgerSection: [LedgerRow]]

    /// `includeSnoozed`: search finds a snoozed pull request; the overview leaves it out until its snooze ends.
    init(_ pullRequests: [PrSummary], _ context: LedgerContext, includeSnoozed: Bool = false) {
        let rows = pullRequests
            .filter { includeSnoozed || !Ledger.isSnoozed($0, now: context.now) }
            .map { Ledger.row(for: $0, context) }
        bySection = Dictionary(grouping: rows, by: \.section).mapValues { Ledger.ordered($0) }
    }

    init(rows: [LedgerRow]) {
        bySection = Dictionary(grouping: rows, by: \.section).mapValues { Ledger.ordered($0) }
    }

    func rows(in section: LedgerSection) -> [LedgerRow] { bySection[section] ?? [] }

    var allRows: [LedgerRow] { LedgerSection.allCases.flatMap(rows(in:)) }

    /// How many pull requests wait on you or are yours: the title bar's "16 involve you".
    var involving: Int { LedgerSection.overview.filter(\.involvesYou).reduce(0) { $0 + rows(in: $1).count } }

    /// Start review's queue: To review from the top row down.
    var reviewQueue: [PrKey] { rows(in: .toReview).map(\.pr.prKey) }

    /// "Also open" by repository, the repository with the newest activity first.
    var repositories: [Repository] {
        let groups = Dictionary(grouping: rows(in: .alsoOpen)) { "\($0.pr.owner)/\($0.pr.repo)" }
        return groups.map { Repository(name: $0.key, rows: $0.value) }.sorted { a, b in
            let (newestA, newestB) = (a.rows.map(\.pr.updatedAt).max() ?? "", b.rows.map(\.pr.updatedAt).max() ?? "")
            return newestA == newestB ? a.name < b.name : newestA > newestB
        }
    }

    static func isSnoozed(_ pr: PrSummary, now: Date) -> Bool {
        GitHubTime.date(pr.snoozedUntil).map { $0 > now } ?? false
    }

    // MARK: Order

    /// To review runs longest wait first. Yours puts failures first, then requested changes, then comments. The rest
    /// shows what moved last on top.
    private static func ordered(_ rows: [LedgerRow]) -> [LedgerRow] {
        guard let section = rows.first?.section else { return rows }
        switch section {
        case .toReview, .ready:
            return rows.sorted { before($0, $1, by: { ($0.since ?? .distantFuture, $0.pr.key) }) }
        case .needsYou:
            return rows.sorted { a, b in
                let (rankA, rankB) = (needRank(a.reason.kind), needRank(b.reason.kind))
                return rankA == rankB ? before(a, b, by: { ($0.since ?? .distantFuture, $0.pr.key) }) : rankA < rankB
            }
        case .waiting, .alsoOpen, .merged:
            return rows.sorted { a, b in a.pr.updatedAt == b.pr.updatedAt ? a.pr.key < b.pr.key : a.pr.updatedAt > b.pr.updatedAt }
        }
    }

    private static func before(_ a: LedgerRow, _ b: LedgerRow, by key: (LedgerRow) -> (Date, String)) -> Bool { key(a) < key(b) }

    private static func needRank(_ kind: LedgerReason.Kind) -> Int {
        switch kind {
        case .failing, .conflicts: 0
        case .changesRequested: 1
        default: 2
        }
    }

    // MARK: One row

    static func row(for pr: PrSummary, _ context: LedgerContext) -> LedgerRow {
        let mine = pr.isAuthored(by: context.logins)
        let row: MakeRow = { section, kind, text, tone, edge, since in
            LedgerRow(
                pr: pr, section: section, reason: LedgerReason(kind: kind, text: text), edge: edge, reasonTone: tone,
                since: GitHubTime.date(since) ?? GitHubTime.date(pr.updatedAt), mine: mine
            )
        }
        if pr.state == .merged { return row(.merged, .merged, "Merged", .merged, nil, pr.mergedAt) }
        return mine ? own(pr, context, row) : others(pr, context, row)
    }

    /// Section, reason, its words, the reason's colour, the edge's colour, since when.
    private typealias MakeRow = (LedgerSection, LedgerReason.Kind, String, LedgerTone?, LedgerTone?, String?) -> LedgerRow

    /// Someone else's: your review when it is asked and the pull request is ready for one, else where it stands.
    private static func others(_ pr: PrSummary, _ context: LedgerContext, _ row: MakeRow) -> LedgerRow {
        let bot = DependencyBot.isBot(pr.author.login)
        if !pr.isDraft, pr.isWaitingOnMe(logins: context.logins, teams: context.teams) {
            let since = pr.reviewRequestedAt
            if let reviewed = pr.reviewedHeadSha, reviewed != pr.headSha {
                return row(.toReview, .reReview, "Re-review", .attention, .attention, since)
            }
            if bot { return row(.toReview, .dependencyUpdate, "Dependency update", nil, .review, since) }
            let direct = (pr.requestedReviewerLogins ?? []).contains { context.logins.contains($0.lowercased()) }
            if !direct, let team = myTeam(asked: pr, context) { return row(.toReview, .teamAsked, "@\(team) asked", nil, .review, since) }
            return row(.toReview, .asked, "\(pr.author.firstName) asked", nil, .review, since)
        }
        if pr.isDraft { return row(.alsoOpen, .draft, "Draft", nil, nil, pr.createdAt) }
        // What you asked for is the author's to do now: it waits on someone else, and it is yours to follow.
        if let review = latestReview(pr, by: context.logins, in: [.changesRequested, .commented]) {
            let text = review.state == .changesRequested ? "You asked for changes" : "You commented"
            return row(.waiting, .youReviewed, text, nil, nil, review.submittedAt)
        }
        if bot { return row(.alsoOpen, .dependencyUpdate, "Dependency update", nil, nil, pr.createdAt) }
        if let review = latestReview(pr, in: [.changesRequested]) {
            return row(.alsoOpen, .changesRequested, "\(context.firstName(review.login)) wants changes", nil, nil, review.submittedAt)
        }
        if let review = latestReview(pr, in: [.approved]) {
            let who = context.logins.contains(review.login.lowercased()) ? "You" : context.firstName(review.login)
            return row(.alsoOpen, .approved, "\(who) approved", nil, nil, review.submittedAt)
        }
        if let reviewer = pr.pendingReviewers.first {
            return row(.alsoOpen, .reviewing, "\(context.firstName(reviewer)) is reviewing", nil, nil, pr.reviewRequestedAt)
        }
        return row(.alsoOpen, .noReviewer, "No reviewer yet", nil, nil, pr.createdAt)
    }

    /// Your own: what is wrong first, then whether it can merge, then who it waits on.
    private static func own(_ pr: PrSummary, _ context: LedgerContext, _ row: MakeRow) -> LedgerRow {
        if pr.isDraft { return row(.waiting, .draft, "Draft", nil, nil, pr.createdAt) }
        let failing = pr.checks.failed > 0
        let failedAt = (pr.failedChecks ?? []).compactMap(\.completedAt).min()
        if failing, !context.failsOutside(pr) {
            return row(.needsYou, .failing, failingText(pr), .failing, .failing, failedAt)
        }
        if pr.mergeable == .conflicting {
            return row(.needsYou, .conflicts, "Conflicts with \(pr.baseRef)", .failing, .failing, pr.updatedAt)
        }
        if let review = latestReview(pr, in: [.changesRequested]) {
            return row(.needsYou, .changesRequested, "\(context.firstName(review.login)) wants changes", .attention, .attention, review.submittedAt)
        }
        if pr.reviewStatus == .changesRequested {
            return row(.needsYou, .changesRequested, "Changes requested", .attention, .attention, pr.updatedAt)
        }
        if pr.reviewStatus == .commented, let review = latestReview(pr, in: [.commented]) {
            return row(.needsYou, .commented, "\(context.firstName(review.login)) commented", .review, .review, review.submittedAt)
        }
        if failing { return row(.waiting, .sharedFailure, "Shared failure, not yours", nil, nil, failedAt) }
        if pr.checks.pending > 0 { return row(.waiting, .checksRunning, "Checks running", nil, nil, pr.updatedAt) }
        if pr.reviewStatus == .approved, pr.mergeable == .mergeable {
            let approval = latestReview(pr, in: [.approved])
            let who = approval.map { context.firstName($0.login) } ?? pr.approvedBy.first.map(context.firstName)
            return row(.ready, .approved, who.map { "\($0) approved" } ?? "Approved", .ready, .ready, approval?.submittedAt)
        }
        let reviewers = pr.pendingReviewers
        if !reviewers.isEmpty {
            return row(.waiting, .waitingOnReviewers, "Waiting on \(names(reviewers.map(context.firstName)))", nil, nil, pr.reviewRequestedAt ?? pr.createdAt)
        }
        if pr.reviewStatus == .approved { return row(.waiting, .checksRunning, "Approved, GitHub is checking", nil, nil, pr.updatedAt) }
        return row(.waiting, .noReviewer, "No reviewer yet", nil, nil, pr.createdAt)
    }

    // MARK: Words

    /// The newest review in one of `states`, optionally by one of `logins`.
    private static func latestReview(_ pr: PrSummary, by logins: Set<String>? = nil, in states: Set<PrLatestReview.State>) -> PrLatestReview? {
        (pr.latestReviews ?? [])
            .filter { states.contains($0.state) && (logins?.contains($0.login.lowercased()) ?? true) }
            .max { ($0.submittedAt ?? "") < ($1.submittedAt ?? "") }
    }

    /// The team of yours whose review is asked.
    private static func myTeam(asked pr: PrSummary, _ context: LedgerContext) -> String? {
        let mine = Set(context.teams.map(TeamSlug.normalized))
        return (pr.requestedTeams ?? []).first { mine.contains(TeamSlug.normalized($0)) }.map(TeamSlug.normalized)
    }

    /// "Sam", "Tom, Ines", "Tom +2".
    static func names(_ list: [String]) -> String {
        switch list.count {
        case 0: ""
        case 1: list[0]
        case 2: "\(list[0]), \(list[1])"
        default: "\(list[0]) +\(list.count - 1)"
        }
    }

    /// "e2e, lint fail": the failed checks by their short names, or how many when the names run long.
    static func failingText(_ pr: PrSummary) -> String {
        let failed = pr.checks.failed
        var names: [String] = []
        for check in pr.failedChecks ?? [] {
            let short = shortCheckName(check.name)
            if !short.isEmpty, !names.contains(short) { names.append(short) }
        }
        let fits = !names.isEmpty && names.count <= 2 && names.joined(separator: ", ").count <= 22
        if fits { return "\(names.joined(separator: ", ")) \(names.count == 1 ? "fails" : "fail")" }
        return failed == 1 ? "1 check fails" : "\(failed) checks fail"
    }

    /// "e2e · chromium 2/4" and "e2e / checkout" are both "e2e".
    static func shortCheckName(_ name: String) -> String {
        var short = name
        for separator in [" / ", " · ", " (", ": "] {
            if let range = short.range(of: separator) { short = String(short[..<range.lowerBound]) }
        }
        return short.trimmingCharacters(in: .whitespaces)
    }
}

/// Dependabot and Renovate, with or without GitHub's `[bot]` (the desktop's `services/dependency-updates.ts`).
enum DependencyBot {
    static func isBot(_ login: String) -> Bool {
        var name = login.lowercased()
        if name.hasSuffix("[bot]") { name.removeLast(5) }
        return name == "dependabot" || name == "renovate"
    }
}

// MARK: - The right-hand columns

enum LedgerAge {
    /// "now", "20 m", "5 h", "4 d": how long a row has had its reason.
    static func text(since: Date?, now: Date) -> String {
        guard let since else { return "" }
        let minutes = Int(max(0, now.timeIntervalSince(since)) / 60)
        if minutes < 1 { return "now" }
        if minutes < 60 { return "\(minutes) m" }
        if minutes < 60 * 24 { return "\(minutes / 60) h" }
        return "\(minutes / 1440) d"
    }

    /// Past a week the age turns amber.
    static func isOld(since: Date?, now: Date) -> Bool {
        guard let since else { return false }
        return now.timeIntervalSince(since) >= 7 * 86_400
    }
}

/// The check bar: one part per state, each as wide as its share of the checks and never thinner than `minimum`, so
/// one failure among forty stays visible. Green first, then what still runs, then what failed.
enum LedgerChecks {
    struct Part: Equatable, Sendable {
        let state: CheckState
        let width: Double
    }

    static func parts(_ checks: CheckSummary, width: Double = 40, gap: Double = 2, minimum: Double = 6) -> [Part] {
        let counts: [(CheckState, Int)] = [(.success, checks.passed), (.pending, checks.pending), (.failure, checks.failed)].filter { $0.1 > 0 }
        guard !counts.isEmpty else {
            // Only skipped or neutral checks: one grey line says there was nothing to pass.
            return checks.total > 0 ? [Part(state: .skipped, width: width)] : []
        }
        let room = width - gap * Double(counts.count - 1)
        let total = Double(counts.reduce(0) { $0 + $1.1 })
        var widths = counts.map { room * Double($0.1) / total }
        // Raise the thin parts to the minimum and take that from the wide ones, until none is too thin.
        for _ in counts {
            let thin = widths.indices.filter { widths[$0] < minimum }
            guard !thin.isEmpty else { break }
            let wide = widths.indices.filter { widths[$0] > minimum }
            let needed = thin.reduce(0) { $0 + (minimum - widths[$1]) }
            let spare = wide.reduce(0) { $0 + (widths[$1] - minimum) }
            guard spare > 0 else { break }
            for index in thin { widths[index] = minimum }
            for index in wide { widths[index] -= (widths[index] - minimum) / spare * min(needed, spare) }
        }
        return zip(counts, widths).map { Part(state: $0.0, width: $1) }
    }

    /// What VoiceOver reads for the bar.
    static func summary(_ checks: CheckSummary) -> String {
        if checks.total == 0 { return "No checks" }
        if checks.failed > 0 { return checks.failed == 1 ? "1 check failing" : "\(checks.failed) checks failing" }
        if checks.pending > 0 { return checks.pending == 1 ? "1 check running" : "\(checks.pending) checks running" }
        return "Checks pass"
    }
}

// MARK: - Search

/// The chips under the search field: the filters of the old list's tabs.
enum LedgerFilter: String, CaseIterable, Identifiable, Sendable {
    case failing, mine, stale, drafts, merged

    var id: String { rawValue }

    var title: String {
        switch self {
        case .failing: "Failing"
        case .mine: "Mine"
        case .stale: "Stale"
        case .drafts: "Drafts"
        case .merged: "Merged"
        }
    }
}

struct LedgerSearch: Equatable, Sendable {
    var text = ""
    var filters: Set<LedgerFilter> = []

    var isEmpty: Bool { text.trimmingCharacters(in: .whitespaces).isEmpty && filters.isEmpty }

    /// Every word must be in the title, number, author, branch, repository or one of its work items; every chip
    /// must hold. Without the Merged chip a merged pull request still shows, in its own section.
    func matches(_ row: LedgerRow, now: Date, staleAfterDays: Int = 7) -> Bool {
        let pr = row.pr
        for filter in filters {
            switch filter {
            case .failing: if pr.checks.failed == 0 { return false }
            case .mine: if !row.mine { return false }
            case .stale:
                guard let updated = GitHubTime.date(pr.updatedAt), now.timeIntervalSince(updated) >= Double(staleAfterDays) * 86_400 else { return false }
            case .drafts: if !pr.isDraft { return false }
            case .merged: if pr.state != .merged { return false }
            }
        }
        let words = text.lowercased().split(whereSeparator: \.isWhitespace)
        guard !words.isEmpty else { return true }
        let haystack = ([pr.title, "#\(pr.number)", pr.author.login, pr.author.name ?? "", pr.headRef, "\(pr.owner)/\(pr.repo)"]
            + pr.workItemIds.map { "ab#\($0)" }).joined(separator: "\n").lowercased()
        return words.allSatisfy { haystack.contains($0) }
    }
}
