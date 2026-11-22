import Foundation

// What a pull request says about itself, shared by the Pull requests list (`PrFacts`) and BorgDock Review's overview
// (`Ledger`). Foundation only, so the core package compiles it.

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
