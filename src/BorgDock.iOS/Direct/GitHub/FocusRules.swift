import Foundation

// The Focus rules: which bucket a pull request sits in, the one-line reason, and how urgent it is. The Swift port of
// the server's `github/focus.ts`, itself ported from the desktop's focus-bucket.ts, pr-grouping.ts and
// priority-scoring.ts, so a pull request lands in the same bucket here as in BorgDock. Change them together.

/// One check of a head commit: an Actions job, another app's check run, or a commit status.
struct CheckContext: Hashable, Sendable {
    enum Kind: Sendable { case check, status }

    /// The check run's id (an Actions job id for workflow checks); 0 for commit statuses.
    let id: Int
    let kind: Kind
    let name: String
    let workflow: String?
    let runId: Int?
    /// The workflow run's number (`#15274`), which an E2E report names.
    let runNumber: Int?
    let state: CheckState
    /// GitHub's raw conclusion, lower case; nil while it runs.
    let conclusion: String?
    let startedAt: String?
    let completedAt: String?
    let url: String
}

/// A reviewer's latest review.
struct ReviewRecord: Hashable, Sendable {
    let login: String
    let state: PrLatestReview.State
    let submittedAt: String?
    let commitSha: String?
}

/// A pull request as one GraphQL read gives it, before Focus places it.
struct PrRecord: Hashable, Sendable {
    /// The account that read it: "you".
    let account: String
    let nodeId: String
    let owner: String
    let repo: String
    let number: Int
    let title: String
    let body: String
    let url: String
    let author: Person
    let isDraft: Bool
    let state: PrState
    let headRef: String
    let baseRef: String
    let headSha: String
    let defaultBranch: String?
    let isCrossRepository: Bool
    let createdAt: String
    let updatedAt: String
    let mergedAt: String?
    let additions: Int
    let deletions: Int
    let changedFiles: Int
    let labels: [PrLabel]
    let mergeable: Mergeable
    let autoMerge: Bool
    let reviewDecision: ReviewDecision?
    let requestedReviewers: [String]
    let requestedTeams: [String]
    /// Each reviewer's latest review.
    let latestReviews: [ReviewRecord]
    let checks: [CheckContext]
    /// The newest commit ids, oldest first (at most 20).
    let recentCommits: [String]

    var key: String { "\(owner)/\(repo)#\(number)" }
    var prKey: PrKey { PrKey(owner: owner, repo: repo, number: number) }
}

/// Who is looking and when: everything a rule needs besides the pull request.
struct FocusContext: Sendable {
    /// The account that read the pull request: "you".
    let login: String
    let teams: [String]
    let now: Date
    let staleAfterDays: Int
    /// Until when a pull request is snoozed, by its key.
    var snoozes: [String: Date] = [:]
    /// When BorgDock first saw your review requested, as an ISO time by pull request key.
    var reviewRequests: [String: String] = [:]

    func snoozedUntil(_ key: String) -> Date? { snoozes[key] }
    func reviewRequestedAt(_ key: String) -> String? { reviewRequests[key] }
}

/// GitHub's times as dates, and back.
enum GitHubTime {
    static func date(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        return (try? Date(iso, strategy: .iso8601)) ?? (try? Date(iso, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
    }

    /// "2026-10-31T12:00:00.000Z", the form the server sends.
    static func iso(_ date: Date) -> String {
        date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }
}

enum OverallStatus: Sendable { case red, yellow, green, gray }

enum ReviewStatus: Sendable { case approved, changesRequested, commented, pending, none }

private let hour: TimeInterval = 3600
private let day: TimeInterval = 24 * hour
/// GitHub bumps updatedAt for a review a moment after the review itself.
private let activitySlack: TimeInterval = 60

private func plural(_ count: Int, _ word: String) -> String { "\(count) \(word)\(count == 1 ? "" : "s")" }

// MARK: - Checks

extension Sequence where Element == CheckContext {
    var overallStatus: OverallStatus {
        var any = false
        var pending = false
        for check in self {
            any = true
            if check.state == .failure { return .red }
            if check.state == .pending { pending = true }
        }
        return !any ? .gray : pending ? .yellow : .green
    }
}

enum FocusRules {
    static let buckets: [FocusBucket] = [.you, .wait, .ready, .stale]

    private static let segmentOrder: [CheckState: Int] = [.failure: 0, .pending: 1, .success: 2, .neutral: 3, .skipped: 4]

    static func checkSummary(_ checks: [CheckContext]) -> CheckSummary {
        func count(_ state: CheckState) -> Int { checks.count { $0.state == state } }
        return CheckSummary(
            total: checks.count,
            passed: count(.success),
            failed: count(.failure),
            pending: count(.pending),
            skipped: count(.skipped) + count(.neutral),
            segments: Array(checks.map(\.state).sorted { segmentOrder[$0, default: 9] < segmentOrder[$1, default: 9] }.prefix(12))
        )
    }

    /// The head commit's failed checks as GitHub reports them, for E2E reports and shared CI failures.
    static func failedChecks(_ checks: [CheckContext]) -> [FailedCheck] {
        checks.filter { $0.state == .failure }.map {
            FailedCheck(name: $0.name, jobId: $0.kind == .check && $0.id > 0 ? $0.id : nil, runId: $0.runId, runNumber: $0.runNumber, completedAt: $0.completedAt)
        }
    }

    // MARK: Teams

    /// "@acme/Platform" and "platform" are the same team.
    static func normalizeTeamSlug(_ team: String) -> String {
        var slug = team.trimmingCharacters(in: .whitespaces)
        if slug.hasPrefix("@") { slug.removeFirst() }
        slug = slug.lowercased()
        return slug.lastIndex(of: "/").map { String(slug[slug.index(after: $0)...]) } ?? slug
    }

    static func matchedTeams(_ requested: [String], mine: [String]) -> [String] {
        let own = Set(mine.map(normalizeTeamSlug))
        return requested.map(normalizeTeamSlug).filter(own.contains)
    }

    // MARK: Buckets and reasons (focus-bucket.ts)

    /// A draft is never your turn, not even when it asks for your review: it is not ready for one (the desktop's `yourTurn`).
    static func bucket(for pr: PrRecord, _ context: FocusContext) -> FocusBucket {
        if pr.isStale(context) { return .stale }
        if !pr.isDraft, pr.needsYou(context.login, teams: context.teams) { return pr.isSnoozed(context) ? .wait : .you }
        if pr.isReady { return .ready }
        return .wait
    }

    /// "just now", "12 min ago", "5 h ago", "3 days ago".
    static func formatAgo(_ iso: String?, now: Date) -> String {
        guard let then = GitHubTime.date(iso) else { return "" }
        let elapsed = now.timeIntervalSince(then)
        if elapsed < 60 { return "just now" }
        if elapsed < hour { return "\(Int(elapsed / 60)) min ago" }
        if elapsed < day { return "\(Int(elapsed / hour)) h ago" }
        return "\(plural(Int(elapsed / day), "day")) ago"
    }

    /// A person as a sentence names them: the first name GitHub knows, else the login.
    static func firstName(_ person: Person) -> String {
        person.name?.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? person.login
    }

    private static func names(_ list: [String]) -> String {
        switch list.count {
        case 1: list[0]
        case 2: "\(list[0]) and \(list[1])"
        default: "\(list[0]) and \(list.count - 1) others"
        }
    }

    private static func failingPart(_ pr: PrRecord) -> String {
        let failed = pr.checks.count { $0.state == .failure }
        return failed > 0 ? "\(plural(failed, "check")) failing" : "checks failing"
    }

    private static func askedForReview(_ pr: PrRecord, _ context: FocusContext) -> PrReason {
        let who = firstName(pr.author)
        if let reviewed = pr.myReview(context.login)?.commitSha, reviewed != pr.headSha {
            let commits = pr.commitsSince(reviewed).map { plural($0, "new commit") } ?? "new commits"
            return PrReason(text: "\(who) asked you to look again, \(commits) since your review.", tone: .warn, icon: .rerun)
        }
        let direct = pr.requestedReviewers.contains { $0.lowercased() == context.login.lowercased() }
        let team = direct ? nil : matchedTeams(pr.requestedTeams, mine: context.teams).first
        let ago = formatAgo(context.reviewRequestedAt(pr.key) ?? pr.updatedAt, now: context.now)
        let whom = team.map { "the \($0) team for a review" } ?? "for your review"
        return PrReason(text: "\(who) asked \(whom)\(ago.isEmpty ? "" : " \(ago)").", tone: .warn, icon: .review)
    }

    /// Why the pull request sits in its bucket; the same order of rules as `bucket(for:)`.
    static func reason(for pr: PrRecord, _ context: FocusContext) -> PrReason {
        let mine = pr.isMine(context.login)
        let status = pr.reviewStatus

        switch bucket(for: pr, context) {
        case .stale:
            let age = GitHubTime.date(pr.updatedAt).map { context.now.timeIntervalSince($0) } ?? 0
            return PrReason(text: "No update in \(plural(max(1, Int(age / day)), "day")).", tone: .mute, icon: .clock)
        case .you:
            if mine, pr.isFailing { return PrReason(text: "Your PR, \(failingPart(pr)).", tone: .bad, icon: .failing) }
            if pr.isWaitingOnMe(context.login, teams: context.teams) { return askedForReview(pr, context) }
            if status == .changesRequested { return PrReason(text: "Changes requested on your PR.", tone: .bad, icon: .comment) }
            return PrReason(text: "Comments on your PR to answer.", tone: .warn, icon: .comment)
        case .ready:
            let relevant = pr.checks.count { $0.state != .skipped && $0.state != .neutral }
            let approvers = pr.latestReviews.filter { $0.state == .approved }.map(\.login)
            let by = approvers.isEmpty ? "" : " by \(names(approvers))"
            return relevant > 0
                ? PrReason(text: "Approved\(by), all \(plural(relevant, "check")) passed.", tone: .ok, icon: .approved)
                : PrReason(text: "Approved\(by), no checks to wait for.", tone: .ok, icon: .approved)
        case .wait:
            return waitingReason(pr, context, mine: mine, status: status)
        }
    }

    private static func waitingReason(_ pr: PrRecord, _ context: FocusContext, mine: Bool, status: ReviewStatus) -> PrReason {
        let author = mine ? "Your PR" : "\(firstName(pr.author))'s PR"
        if pr.isDraft {
            return PrReason(text: mine ? "Draft, you are still working on it." : "Draft, \(firstName(pr.author)) is still working on it.", tone: .mute, icon: .clock)
        }
        if pr.needsYou(context.login, teams: context.teams), pr.isSnoozed(context), let until = context.snoozedUntil(pr.key) {
            let when = until.timeIntervalSince(context.now) < day ? "tomorrow" : String(GitHubTime.iso(until).prefix(10))
            return PrReason(text: "Snoozed until \(when).", tone: .mute, icon: .clock)
        }
        if pr.mergeable == .conflicting { return PrReason(text: "\(author) has merge conflicts.", tone: .bad, icon: .conflict) }
        let running = pr.checks.count { $0.state == .pending }
        if running > 0 {
            let progress = "\(pr.checks.count - running) of \(pr.checks.count) done."
            return pr.autoMerge
                ? PrReason(text: "Merges when checks pass, \(progress)", tone: .run, icon: .merge)
                : PrReason(text: "Checks running, \(progress)", tone: .run, icon: .clock)
        }
        if pr.isFailing { return PrReason(text: "\(author), \(failingPart(pr)).", tone: .bad, icon: .failing) }
        let reviewers = pr.requestedReviewers + pr.requestedTeams
        if !reviewers.isEmpty { return PrReason(text: "\(author), waiting on \(names(reviewers)).", tone: .mute, icon: .review) }
        if status == .approved { return PrReason(text: "\(author), approved and waiting for checks.", tone: .ok, icon: .approved) }
        if mine { return PrReason(text: "Your PR, waiting for a reviewer.", tone: .mute, icon: .review) }
        return PrReason(text: "\(author), not assigned to you.", tone: .mute, icon: .review)
    }

    // MARK: Urgency (priority-scoring.ts)

    /// The desktop's Focus score: points for things that need you to act. Others' drafts score nothing.
    static func score(of pr: PrRecord, _ context: FocusContext) -> Int {
        let me = context.login.lowercased()
        let mine = pr.isMine(context.login)
        if pr.isDraft, !mine { return 0 }
        func hoursAgo(_ iso: String) -> Double? { GitHubTime.date(iso).map { context.now.timeIntervalSince($0) / hour } }
        let overall = pr.checks.overallStatus
        let status = pr.reviewStatus
        let updated = GitHubTime.date(pr.updatedAt)
        let sinceUpdate = hoursAgo(pr.updatedAt)
        var points = 0

        if mine, overall == .green, !pr.isDraft, pr.mergeable != .conflicting, status == .approved { points += 45 }
        if mine {
            if overall == .red { points += 20 }
            if status == .changesRequested { points += 15 }
            if overall == .red || status == .changesRequested, let sinceUpdate, sinceUpdate > 24 { points += 10 }
            if !pr.isDraft, status == .none, pr.latestReviews.isEmpty, let open = hoursAgo(pr.createdAt) {
                if open > 24 { points += 15 } else if open > 8 { points += 10 }
            }
            if !pr.isDraft, status == .commented, awaitingMyReply(pr, me: me, updated: updated) { points += 12 }
        }

        var requested = false
        if !me.isEmpty {
            let direct = pr.requestedReviewers.contains { $0.lowercased() == me }
            let viaTeam = !direct && !mine && !matchedTeams(pr.requestedTeams, mine: context.teams).isEmpty
            if direct || viaTeam {
                requested = true
                points += 15
                if let asked = context.reviewRequestedAt(pr.key).flatMap(hoursAgo) {
                    if asked >= 24 { points += 8 } else if asked >= 4 { points += 7 }
                }
            }
        }

        if !mine, !me.isEmpty, !requested, let updated,
           let reviewed = GitHubTime.date(pr.myReview(context.login)?.submittedAt), updated > reviewed.addingTimeInterval(activitySlack) {
            points += 8
        }

        if let sinceUpdate, sinceUpdate > 24 { points += min(10, Int((sinceUpdate - 24) / 24) + 2) }
        if !mine, overall == .red { points += 5 }
        return points
    }

    private static func awaitingMyReply(_ pr: PrRecord, me: String, updated: Date?) -> Bool {
        let others = pr.latestReviews.filter { $0.login.lowercased() != me && ($0.state == .commented || $0.state == .changesRequested) }
        if others.isEmpty { return pr.latestReviews.isEmpty }
        let stamped = others.map { GitHubTime.date($0.submittedAt) }
        guard let newest = stamped.compactMap({ $0 }).max(), !stamped.contains(nil), let updated else { return true }
        return newest.addingTimeInterval(activitySlack) >= updated
    }

    /// What Focus orders by: bucket, then most urgent, then the oldest update, then the smallest change.
    struct Rank: Sendable {
        let bucket: FocusBucket
        let score: Int
        let updatedAt: String
        let size: Int
    }

    static func comesFirst(_ a: Rank, _ b: Rank) -> Bool {
        let (bucketA, bucketB) = (buckets.firstIndex(of: a.bucket) ?? 0, buckets.firstIndex(of: b.bucket) ?? 0)
        if bucketA != bucketB { return bucketA < bucketB }
        if a.score != b.score { return a.score > b.score }
        let (updatedA, updatedB) = (GitHubTime.date(a.updatedAt) ?? .distantPast, GitHubTime.date(b.updatedAt) ?? .distantPast)
        if updatedA != updatedB { return updatedA < updatedB }
        return a.size < b.size
    }

    /// AB#123 references in the title, body or branch (`feat/123-…` counts too), in the order they appear.
    static func workItemIds(title: String, body: String, headRef: String) -> [Int] {
        var ids: [Int] = []
        func add(_ digits: Substring) {
            if let id = Int(digits), !ids.contains(id) { ids.append(id) }
        }
        for match in "\(title)\n\(body)".matches(of: #/\bAB#(\d{2,7})\b/#.ignoresCase()) { add(match.1) }
        if let branch = headRef.firstMatch(of: #/^(?:[a-z]+/)?(\d{3,7})(?:[-_/]|$)/#.ignoresCase()) { add(branch.1) }
        return ids
    }
}

// MARK: - Predicates (pr-grouping.ts)

extension PrRecord {
    /// The desktop's review status: the strongest of each reviewer's latest review.
    var reviewStatus: ReviewStatus {
        let states = Set(latestReviews.map(\.state))
        if states.contains(.changesRequested) { return .changesRequested }
        if states.contains(.approved) { return .approved }
        if states.contains(.commented) { return .commented }
        if states.contains(.pending) { return .pending }
        return .none
    }

    func isMine(_ login: String) -> Bool { !login.isEmpty && author.login.lowercased() == login.lowercased() }

    var isFailing: Bool { checks.overallStatus == .red }

    var isReady: Bool { checks.overallStatus == .green && !isDraft && mergeable != .conflicting && reviewStatus == .approved }

    /// Still a pending requested reviewer, personally or through a team, and not already approved this head.
    func isWaitingOnMe(_ login: String, teams: [String]) -> Bool {
        if login.isEmpty || isMine(login) { return false }
        let me = login.lowercased()
        let approvedHead = latestReviews.contains { $0.login.lowercased() == me && $0.state == .approved && ($0.commitSha ?? headSha) == headSha }
        if approvedHead { return false }
        if requestedReviewers.contains(where: { $0.lowercased() == me }) { return true }
        return !FocusRules.matchedTeams(requestedTeams, mine: teams).isEmpty
    }

    /// Review requested from you, or your PR with failing checks, changes requested or comments.
    func needsYou(_ login: String, teams: [String]) -> Bool {
        if login.isEmpty { return false }
        if isWaitingOnMe(login, teams: teams) { return true }
        guard isMine(login) else { return false }
        if isFailing { return true }
        return reviewStatus == .changesRequested || reviewStatus == .commented
    }

    func isStale(_ context: FocusContext) -> Bool {
        guard state == .open, let updated = GitHubTime.date(updatedAt) else { return false }
        return context.now.timeIntervalSince(updated) >= Double(context.staleAfterDays) * day
    }

    func isSnoozed(_ context: FocusContext) -> Bool {
        context.snoozedUntil(key).map { $0 > context.now } ?? false
    }

    /// Your latest review of the pull request, if you left one.
    func myReview(_ login: String) -> ReviewRecord? {
        latestReviews.first { $0.login.lowercased() == login.lowercased() && $0.state != .pending }
    }

    /// Commits pushed after `sha`, from the newest twenty; nil when `sha` is older than those.
    func commitsSince(_ sha: String) -> Int? {
        recentCommits.firstIndex(of: sha).map { recentCommits.count - 1 - $0 }
    }
}
