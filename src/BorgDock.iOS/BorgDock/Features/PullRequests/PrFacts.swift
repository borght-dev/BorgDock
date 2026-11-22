import Foundation

/// The desktop's `services/pr-list/facts.ts`, one to one: what the Pull requests list knows about one open pull
/// request, derived once per poll and shared by the tabs, the query, the order, the groups and the rows. Pure:
/// everything outside the pull request comes in through `PrFactsContext`. Change a rule on both sides together.

/// Status buckets, in the order the Status grouping shows them.
enum PrStatusBucket: String, CaseIterable, Sendable {
    case yourTurn, failing, waiting, ready, draft

    var label: String {
        switch self {
        case .yourTurn: "Your turn"
        case .failing: "Failing"
        case .waiting: "Waiting for review"
        case .ready: "Ready to merge"
        case .draft: "Draft"
        }
    }

    var hint: String {
        switch self {
        case .yourTurn: "your review is requested, or your PR needs a fix or a reply"
        case .failing: "red checks on someone else’s PR"
        case .waiting: "green or running, no approval yet"
        case .ready: "approved, green, no conflicts"
        case .draft: "not ready for review"
        }
    }
}

/// Where the reviews stand, from your point of view.
enum ReviewKey: String, CaseIterable, Sendable {
    case awaitingYou, changes, commented, awaitingOthers, approved, none

    var label: String {
        switch self {
        case .awaitingYou: "Awaiting your review"
        case .changes: "Changes requested"
        case .commented: "Commented"
        case .awaitingOthers: "Awaiting other reviewers"
        case .approved: "Approved"
        case .none: "No reviewers"
        }
    }
}

/// Who has to act before the pull request moves on.
enum WaitingOn: String, CaseIterable, Sendable {
    case you, author, reviewers, ci

    var label: String {
        switch self {
        case .you: "Waiting on you"
        case .author: "Waiting on the author"
        case .reviewers: "Waiting on reviewers"
        case .ci: "Waiting on CI"
        }
    }
}

/// How the next step reads: yours, good to go, blocked, running, someone else's.
enum NextTone: Sendable { case you, go, block, wait, them }

struct NextStep: Equatable, Sendable {
    let label: String
    let waitingOn: WaitingOn
    let tone: NextTone
}

enum SizeBucket: String, CaseIterable, Sendable {
    case xs, s, m, l, xl

    var groupLabel: String {
        switch self {
        case .xs: "XS · under 10 lines"
        case .s: "S · under 100 lines"
        case .m: "M · under 500 lines"
        case .l: "L · under 1,000 lines"
        case .xl: "XL · 1,000 lines or more"
        }
    }

    static func of(lines: Int) -> SizeBucket {
        for (bucket, limit) in [(SizeBucket.xs, 10), (.s, 100), (.m, 500), (.l, 1000)] where lines < limit { return bucket }
        return .xl
    }
}

enum AgeBucket: String, CaseIterable, Sendable {
    case today, week, month, older

    var label: String {
        switch self {
        case .today: "Opened today"
        case .week: "Opened this week"
        case .month: "Opened this month"
        case .older: "Older than a month"
        }
    }

    static func of(createdAt: Date, now: Date) -> AgeBucket {
        let age = now.timeIntervalSince(createdAt)
        if age < PrTime.day { return .today }
        if age < 7 * PrTime.day { return .week }
        if age < 30 * PrTime.day { return .month }
        return .older
    }
}

enum PrTime {
    static let minute: TimeInterval = 60
    static let hour: TimeInterval = 3600
    static let day: TimeInterval = 86_400
    static let week: TimeInterval = 7 * 86_400
}

/// The desktop's `overallStatus`: red when a check failed, yellow while one runs, gray without checks.
enum OverallStatus: Sendable { case red, yellow, green, gray }

/// The strongest of each reviewer's latest review (the desktop's `reviewStatus`).
enum ReviewStatus: Sendable { case approved, changesRequested, commented, pending, none }

/// What the CI failure store says about a red pull request. The phone has none yet: always nil.
struct PrCiFacts: Equatable, Sendable {
    /// Open pull requests the worst shared failure fails, this one included.
    let blocked: Int
    /// Every failed check sits in a shared failure that is not the pull request's doing.
    let outside: Bool
}

struct PrFactsContext {
    /// Your GitHub logins, lower-cased: one per account the server reads with.
    var logins: Set<String>
    /// Your team slugs, over every account.
    var teams: [String] = []
    /// Clock for age and staleness.
    var now: Date
    var staleAfterDays: Int = 7
    var ciOf: (PrSummary) -> PrCiFacts? = { _ in nil }
}

struct PrFacts: Identifiable, Equatable {
    let pr: PrSummary
    var id: String { pr.key }
    var key: String { pr.key }
    let mine: Bool
    let draft: Bool
    let conflicts: Bool
    let failing: Bool
    let running: Bool
    let ready: Bool
    /// A review is asked of you, personally or through a team.
    let waitingOnMe: Bool
    /// You have to act: your review, or your pull request needs a fix, a reply or a rebase.
    let yourTurn: Bool
    let stale: Bool
    let bucket: PrStatusBucket
    let review: ReviewKey
    let next: NextStep
    let ci: PrCiFacts?
    /// Lines changed: additions plus deletions.
    let lines: Int
    let size: SizeBucket
    let age: AgeBucket
    /// `AB#` work items in the title, branch or description.
    let workItems: [Int]
    let createdAt: Date
    let updatedAt: Date

    init(_ pr: PrSummary, _ ctx: PrFactsContext) {
        self.pr = pr
        mine = pr.isAuthored(by: ctx.logins)
        failing = pr.overallStatus == .red
        running = !failing && pr.checks.pending > 0
        conflicts = pr.mergeable == .conflicting
        ready = pr.overallStatus == .green && !pr.isDraft && !conflicts && pr.reviewStatus == .approved
        waitingOnMe = pr.isWaitingOnMe(logins: ctx.logins, teams: ctx.teams)
        ci = failing ? ctx.ciOf(pr) : nil
        draft = pr.isDraft
        // A draft is never your turn, not even when it asks for your review: it is not ready for one.
        let status = pr.reviewStatus
        yourTurn = !pr.isDraft
            && (waitingOnMe || (mine && ((failing && ci?.outside != true) || conflicts || status == .changesRequested || status == .commented)))
        bucket = pr.isDraft ? .draft : yourTurn ? .yourTurn : ready ? .ready : failing ? .failing : .waiting
        lines = pr.additions + pr.deletions
        createdAt = pr.createdAt.sortDate
        updatedAt = pr.updatedAt.sortDate
        stale = ISODate.parse(pr.updatedAt).map { ctx.now.timeIntervalSince($0) >= Double(ctx.staleAfterDays) * PrTime.day } ?? false
        review = Self.review(pr, waitingOnMe: waitingOnMe)
        next = Self.nextStep(pr, logins: ctx.logins, mine: mine, failing: failing, running: running, ready: ready, conflicts: conflicts, waitingOnMe: waitingOnMe, ci: ci)
        size = .of(lines: lines)
        age = .of(createdAt: createdAt, now: ctx.now)
        workItems = pr.workItemIds.reduce(into: []) { ids, id in if !ids.contains(id) { ids.append(id) } }
    }

    private static func review(_ pr: PrSummary, waitingOnMe: Bool) -> ReviewKey {
        if waitingOnMe { return .awaitingYou }
        switch pr.reviewStatus {
        case .changesRequested: return .changes
        case .commented: return .commented
        case .approved: return .approved
        case .pending, .none: return pr.pendingReviewers.isEmpty ? .none : .awaitingOthers
        }
    }

    /// The one thing that has to happen next, and who does it. First match wins: a draft, your own conflicts, your
    /// review, someone else's conflicts, red checks that are the pull request's own, requested changes, comments on
    /// yours, red checks that are not its doing, checks still running, merge, and finally who still has to review.
    static func nextStep(
        _ pr: PrSummary, logins: Set<String>, mine: Bool, failing: Bool, running: Bool, ready: Bool, conflicts: Bool,
        waitingOnMe: Bool, ci: PrCiFacts?
    ) -> NextStep {
        let author = pr.author.login
        let status = pr.reviewStatus
        if pr.isDraft {
            return mine ? NextStep(label: "Finish the draft", waitingOn: .you, tone: .you) : NextStep(label: "Draft · \(author)", waitingOn: .author, tone: .them)
        }
        if conflicts, mine { return NextStep(label: "Resolve conflicts", waitingOn: .you, tone: .you) }
        if waitingOnMe { return NextStep(label: "Your review", waitingOn: .you, tone: .you) }
        if conflicts { return NextStep(label: "Conflicts · \(author)", waitingOn: .author, tone: .block) }
        if failing, ci?.outside != true {
            return mine ? NextStep(label: "Fix checks", waitingOn: .you, tone: .you) : NextStep(label: "Fix checks · \(author)", waitingOn: .author, tone: .block)
        }
        if status == .changesRequested {
            return mine ? NextStep(label: "Address changes", waitingOn: .you, tone: .you) : NextStep(label: "Address changes · \(author)", waitingOn: .author, tone: .them)
        }
        if mine, status == .commented { return NextStep(label: "Reply to comments", waitingOn: .you, tone: .you) }
        if failing { return NextStep(label: "Blocked by shared CI", waitingOn: .ci, tone: .block) }
        if running { return NextStep(label: "Checks running", waitingOn: .ci, tone: .wait) }
        if ready {
            return mine ? NextStep(label: "Merge", waitingOn: .you, tone: .go) : NextStep(label: "Merge · \(author)", waitingOn: .author, tone: .go)
        }
        let others = pr.pendingReviewers.filter { !logins.contains($0.lowercased()) }
        if !others.isEmpty { return NextStep(label: "Review · \(others.joined(separator: ", "))", waitingOn: .reviewers, tone: .them) }
        if status == .approved { return NextStep(label: "Checks unknown", waitingOn: .ci, tone: .wait) }
        if status == .commented { return NextStep(label: "Reply · \(author)", waitingOn: .author, tone: .them) }
        return mine ? NextStep(label: "Request a review", waitingOn: .you, tone: .you) : NextStep(label: "Needs a reviewer", waitingOn: .reviewers, tone: .them)
    }
}

extension PrSummary {
    var overallStatus: OverallStatus {
        if checks.failed > 0 { return .red }
        if checks.pending > 0 { return .yellow }
        if checks.total == 0 { return .gray }
        return .green
    }

    /// From each reviewer's latest review; an older server sends none, then the decision and approvals stand in.
    var reviewStatus: ReviewStatus {
        guard let latestReviews else {
            if reviewDecision == .changesRequested { return .changesRequested }
            return approvedBy.isEmpty ? .none : .approved
        }
        let states = Set(latestReviews.map(\.state))
        if states.contains(.changesRequested) { return .changesRequested }
        if states.contains(.approved) { return .approved }
        if states.contains(.commented) { return .commented }
        if states.contains(.pending) { return .pending }
        return .none
    }

    /// Requested reviewers still pending, people first then teams (`@team`).
    var pendingReviewers: [String] {
        (requestedReviewerLogins ?? []) + (requestedTeams ?? []).map { "@\($0)" }
    }

    func isAuthored(by logins: Set<String>) -> Bool { logins.contains(author.login.lowercased()) }

    /// You are still a pending requested reviewer, personally or through a team, and haven't approved this head.
    func isWaitingOnMe(logins: Set<String>, teams: [String]) -> Bool {
        guard !logins.isEmpty, !isAuthored(by: logins) else { return false }
        let approvedHead = (latestReviews ?? []).contains { review in
            logins.contains(review.login.lowercased()) && review.state == .approved && (review.commitSha == nil || review.commitSha == headSha)
        }
        if approvedHead { return false }
        if (requestedReviewerLogins ?? []).contains(where: { logins.contains($0.lowercased()) }) { return true }
        let mine = Set(teams.map(TeamSlug.normalized))
        return (requestedTeams ?? []).contains { mine.contains(TeamSlug.normalized($0)) }
    }
}

enum TeamSlug {
    /// `@acme/web`, `acme/web` and `web` are the same team.
    static func normalized(_ team: String) -> String {
        var slug = team.trimmingCharacters(in: .whitespaces).lowercased()
        if slug.hasPrefix("@") { slug.removeFirst() }
        if let slash = slug.lastIndex(of: "/") { slug = String(slug[slug.index(after: slash)...]) }
        return slug
    }
}
