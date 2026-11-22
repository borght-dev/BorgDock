import Foundation

// The desktop's `services/author-run.ts` and the pure half of `author-run-session.ts`, one to one: one author's open
// pull requests in Quick Review, oldest first, with the ones you can't merge yet left out. A pull request is in when it
// has no conflicts or requested changes and every failed check is not its doing: an E2E failure the report clears
// (only jobs of the run it reports on), or a shared CI failure. Pure. Change a rule on both sides together.

enum HoldReason: String, Sendable { case conflicts, changesRequested, failing, e2e }

enum RunFit: Equatable, Sendable {
    /// Green or running (`bypass` nil), or red only from failures that are not the pull request's: `bypass` says why.
    case ready(bypass: String?)
    case held(reason: HoldReason, why: String)
    /// The E2E report is still being read.
    case checking
}

/// A pull request an author run leaves out, and why.
struct HeldPr: Equatable, Identifiable, Sendable {
    let pr: PrSummary
    let reason: HoldReason
    let why: String
    var id: String { pr.key }
}

/// What a run's fits are read from: every open pull request, the E2E reports read so far and the CI failure groups.
struct RunWorld {
    var prs: [PrSummary]
    var e2e: [String: E2eReports.Entry]
    var groups: [CiFailureGroup]

    func fit(_ pr: PrSummary) -> RunFit {
        let lens = pr.failedCheckNames.isEmpty ? nil : CiLens.lens(pr, CiLens.index(groups))
        return AuthorRun.fit(pr, e2e: E2eReports.lookup(pr, entries: e2e, prs: prs), outsideCause: lens?.outsideCause)
    }
}

enum AuthorRun {
    struct Plan: Equatable {
        /// The pull requests to review, in order.
        var queue: [PrSummary] = []
        /// The author's pull requests left out, oldest first.
        var held: [HeldPr] = []
        /// Pull requests whose E2E report is still being read.
        var checking: [PrSummary] = []
    }

    private static func listed(_ names: [String]) -> String {
        names.count > 1 ? "\(names[0]) and \(names.count - 1) more" : names.first ?? ""
    }

    static func fit(_ pr: PrSummary, e2e: E2eLookup, outsideCause: CiCause?) -> RunFit {
        if pr.mergeable == .conflicting { return .held(reason: .conflicts, why: "Has merge conflicts") }
        if pr.reviewStatus == .changesRequested { return .held(reason: .changesRequested, why: "Changes requested") }
        let failed = pr.failedCheckNames
        if failed.isEmpty { return .ready(bypass: nil) }
        if let outsideCause { return .ready(bypass: "Not this PR's failure: \(outsideCause.outsideText(branch: pr.baseRef))") }
        // Until the report is read, only checks that can't be E2E are known to be the pull request's own.
        let own = failed.filter { name in
            switch e2e {
            case .none: true
            case .reading: !E2eReport.isE2eCheck(name)
            case .read(let read): !read.covers.contains(name)
            }
        }
        if !own.isEmpty { return .held(reason: .failing, why: "\(listed(own)) fails") }
        guard case .read(let read) = e2e else { return .checking }
        guard read.verdict.isOutside else { return .held(reason: .e2e, why: read.verdict.text) }
        return .ready(bypass: read.verdict.text)
    }

    /// You approved it at its head. Without the commit of your review an approval counts.
    static func approvedAtHead(_ pr: PrSummary, by logins: Set<String>) -> Bool {
        guard let reviews = pr.latestReviews else { return pr.isApprovedAtHead(by: logins) }
        return reviews.contains { review in
            logins.contains(review.login.lowercased()) && review.state == .approved && (review.commitSha == nil || review.commitSha == pr.headSha)
        }
    }

    /// `author`'s open, non-draft pull requests you haven't approved at their head, oldest first. Never your own.
    static func candidates(_ prs: [PrSummary], author: String, myLogins: Set<String>) -> [PrSummary] {
        let login = author.lowercased()
        let mine = Set(myLogins.map { $0.lowercased() })
        guard !mine.contains(login) else { return [] }
        return prs
            .filter { $0.author.login.lowercased() == login && $0.state == .open && !$0.isDraft && !approvedAtHead($0, by: mine) }
            .enumerated()
            .sorted { a, b in
                let (left, right) = (a.element.createdAt.sortDate, b.element.createdAt.sortDate)
                return left != right ? left < right : a.offset < b.offset
            }
            .map(\.element)
    }

    /// Splits `candidates` into the run and what it leaves out.
    static func plan(_ candidates: [PrSummary], fit: (PrSummary) -> RunFit) -> Plan {
        var plan = Plan()
        for pr in candidates {
            switch fit(pr) {
            case .ready: plan.queue.append(pr)
            case .held(let reason, let why): plan.held.append(HeldPr(pr: pr, reason: reason, why: why))
            case .checking: plan.checking.append(pr)
            }
        }
        return plan
    }

    /// Passing checks first, keeping the order otherwise (the desktop's `orderQuickReviewPrs`).
    static func greenFirst(_ prs: [PrSummary]) -> [PrSummary] {
        prs.enumerated()
            .sorted { a, b in
                let (left, right) = (a.element.overallStatus == .green, b.element.overallStatus == .green)
                return left != right ? left : a.offset < b.offset
            }
            .map(\.element)
    }

    private static func unblocked(_ pr: PrSummary) -> Bool {
        pr.mergeable != .conflicting && pr.reviewStatus != .changesRequested
    }

    /// The same author's next pull request: passing checks first, then the oldest without conflicts or requested
    /// changes. `handled` holds the keys reviewed or skipped since Quick Review opened.
    static func nextFromAuthor(_ prs: [PrSummary], author: String, myLogins: Set<String>, handled: Set<String>) -> PrSummary? {
        greenFirst(candidates(prs, author: author, myLogins: myLogins)).first { !handled.contains($0.key) && unblocked($0) }
    }

    /// The next pull request by priority from anyone but `author`: the ones that ask for your review in Focus's order,
    /// then the rest, passing checks first.
    static func nextByPriority(reviews: [PrSummary], prs: [PrSummary], except author: String?, myLogins: Set<String>, handled: Set<String>) -> PrSummary? {
        var seen: Set<String> = []
        let ordered = (reviews + prs).filter { seen.insert($0.key).inserted }
        let other = author?.lowercased()
        return greenFirst(ordered.filter { pr in
            pr.author.login.lowercased() != other && !candidates([pr], author: pr.author.login, myLogins: myLogins).isEmpty && unblocked(pr)
        }).first { !handled.contains($0.key) }
    }
}
