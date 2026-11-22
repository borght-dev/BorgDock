import Foundation

// The desktop's `services/ci-failures/lens.ts` and the causes of `hypothesis.ts`, one to one: which shared CI failure
// groups hold a pull request's failed checks, how many open pull requests a group blocks, and whether a pull request is
// red only from failures that are not its doing. Pure. The server's groups carry the facts the desktop's store tallies
// (`CiGroupFacts`); it has no classifications, so a group's cause is always the strongest hypothesis.

/// Why a CI failure group failed, as far as the facts tell.
enum CiCause: String, Sendable {
    case baseBranch, infrastructure, flaky, branchSpecific

    /// "also fails on main": why the failure is not the pull request's doing.
    func outsideText(branch: String) -> String {
        switch self {
        case .baseBranch: "also fails on \(branch)"
        case .infrastructure: "an infrastructure fault"
        case .flaky: "flaky, passed on a retry"
        case .branchSpecific: "specific to one branch"
        }
    }
}

/// What the list says about a red pull request's failures.
struct PrCiLens: Equatable {
    /// Open shared groups that hold one of its failed checks, the one blocking most pull requests first.
    let groups: [CiFailureGroup]
    /// Open pull requests the first group fails, this one included.
    let blockedCount: Int
    /// The cause when every failed check sits in a shared group that is not its doing.
    let outsideCause: CiCause?
}

enum CiLens {
    /// Open shared groups by the job ids of their pull request failures.
    typealias JobIndex = [Int: [CiFailureGroup]]

    /// Confident and across pull requests or with the base branch. The server keeps only unresolved groups.
    static func isOpenShared(_ group: CiFailureGroup) -> Bool {
        guard let facts = group.facts, facts.tier == .high else { return false }
        let prs = facts.prKeys.count
        let base = facts.baseRuns.count
        return prs >= 2 || (prs >= 1 && base >= 1) || (prs == 0 && base >= 2)
    }

    /// Why a group is not the pull request's doing: the strongest hypothesis that says so. Nil when the pull request
    /// may have caused it.
    static func outsideCause(_ group: CiFailureGroup) -> CiCause? {
        guard let facts = group.facts else { return nil }
        if !facts.baseRuns.isEmpty { return .baseBranch }
        if !facts.catalogIds.isEmpty || (!facts.failedSteps.isEmpty && facts.failedSteps.allSatisfy(isSetupStep)) { return .infrastructure }
        if facts.passedOnRetry > 0 { return .flaky }
        return nil
    }

    /// Steps that run before any repository code. A failure there is not the branch's doing.
    static func isSetupStep(_ step: String) -> Bool {
        step.trimmingCharacters(in: .whitespaces).wholeMatch(
            of: #/(?i)set up job|setup job|initialize containers|checkout|run actions\/checkout@.*|set ?up .+|run actions\/setup-.+|run actions\/cache@.*|post .+/#
        ) != nil
    }

    static func index(_ groups: [CiFailureGroup]) -> JobIndex {
        var index: JobIndex = [:]
        for group in groups where isOpenShared(group) {
            for job in group.facts?.prJobIds ?? [] { index[job, default: []].append(group) }
        }
        return index
    }

    private static func sameRepo(_ group: CiFailureGroup, _ pr: PrSummary) -> Bool {
        let repo = "\(pr.owner)/\(pr.repo)".lowercased()
        return group.facts?.repos.contains { $0.lowercased() == repo } ?? false
    }

    /// The lens of a pull request with failed checks, or nil when none of them is shared.
    static func lens(_ pr: PrSummary, _ index: JobIndex, blocked: [String: Int] = [:]) -> PrCiLens? {
        let failed = pr.failedJobIds
        guard !failed.isEmpty else { return nil }
        var order: [String] = []
        var groups: [String: CiFailureGroup] = [:]
        var outsideCause: CiCause?
        var allOutside = true
        for job in failed {
            let held = (index[job] ?? []).filter { sameRepo($0, pr) }
            for group in held where groups[group.id] == nil {
                groups[group.id] = group
                order.append(group.id)
            }
            if let cause = held.lazy.compactMap(Self.outsideCause).first {
                outsideCause = outsideCause ?? cause
            } else {
                allOutside = false
            }
        }
        guard !order.isEmpty else { return nil }
        let ordered = order.enumerated()
            .sorted { a, b in
                let (left, right) = (blocked[a.element] ?? 0, blocked[b.element] ?? 0)
                return left != right ? left > right : a.offset < b.offset
            }
            .compactMap { groups[$0.element] }
        return PrCiLens(
            groups: ordered,
            blockedCount: max(1, blocked[ordered[0].id] ?? 0),
            outsideCause: allOutside && failed.count >= pr.failedCheckNames.count ? outsideCause : nil
        )
    }

    /// The open pull requests each open shared group still fails, by group id.
    static func blockedPrs(_ groups: [CiFailureGroup], _ prs: [PrSummary]) -> [String: [PrSummary]] {
        let index = index(groups)
        var blocked: [String: [PrSummary]] = [:]
        for pr in prs {
            var seen: Set<String> = []
            for job in pr.failedJobIds {
                for group in index[job] ?? [] where !seen.contains(group.id) && sameRepo(group, pr) {
                    seen.insert(group.id)
                    blocked[group.id, default: []].append(pr)
                }
            }
        }
        return blocked
    }

    /// `PrFactsContext.ciOf`: the CI failure store's view of each red pull request.
    static func lookup(_ groups: [CiFailureGroup], _ prs: [PrSummary]) -> (PrSummary) -> PrCiFacts? {
        guard !groups.isEmpty else { return { _ in nil } }
        let index = index(groups)
        let counts = blockedPrs(groups, prs).mapValues(\.count)
        return { pr in
            lens(pr, index, blocked: counts).map { PrCiFacts(blocked: $0.blockedCount, outside: $0.outsideCause != nil) }
        }
    }
}

extension PrSummary {
    /// The names of its failed checks. An older server sends none: then one stand-in per failed check, so a red pull
    /// request never looks green.
    var failedCheckNames: [String] {
        failedChecks?.map(\.name) ?? Array(repeating: "A check", count: checks.failed)
    }

    /// The Actions job ids of its failed checks (commit statuses have none).
    var failedJobIds: [Int] {
        (failedChecks ?? []).compactMap { $0.jobId.flatMap { $0 > 0 ? $0 : nil } }
    }
}
