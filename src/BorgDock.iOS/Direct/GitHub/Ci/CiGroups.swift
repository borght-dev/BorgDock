import Foundation

// Related CI failures: one group per fingerprint across open pull requests and base branches. Groups own
// fingerprints and a claim binds to the group id, which is the fingerprint's hash, so a claim survives re-reading.
// The port of the server's `ci/groups.ts`.

/// What one job's log tail said: its failures, and the fingerprint they group by.
struct CiLogReading: Sendable {
    var signals: [CiSignal]
    var fingerprint: String?
    var tier: CiFingerprint.Tier?
    var title: String?
}

enum CiGroups {
    /// An open pull request as grouping sees it.
    struct OpenPullRequest: Sendable {
        var title: String
        /// The jobs failing on its head now; a fixed or rerun job no longer counts.
        var failingJobs: Set<Int>
        /// Its head and the checks passing on it, so a failure that passed when rerun on the same commit counts
        /// as flaky.
        var headSha: String?
        var passingChecks: Set<String> = []
    }

    /// A base branch that is red now.
    struct RedBase: Sendable {
        /// The first red commit.
        var suspect: CiSuspect?
        var runIds: Set<Int>
    }

    struct Context: Sendable {
        /// By pull request key.
        var openPrs: [String: OpenPullRequest] = [:]
        /// By `owner/repo:branch`.
        var baseBranches: [String: RedBase] = [:]
        /// By group id.
        var claims: [String: CiClaim] = [:]
    }

    /// A failed check shows this many lines of its log.
    static let snippetLines = 12

    private nonisolated(unsafe) static let infrastructure = #/^infra:([^:]+):/#.asInJavaScript

    static func id(of fingerprint: String) -> String { CiFingerprint.hash(fingerprint) }

    /// The signals and the fingerprint of one job's log tail. Low-tier fingerprints say only "it failed" and
    /// never group.
    static func read(log: String, failedStep: String?, workflow: String?) -> CiLogReading {
        let signals = CiLog.extract(CiSanitizer.scrub(log), failedStep: failedStep).signals
        let fingerprints = signals.compactMap { CiFingerprint.of($0, failedStep: failedStep, workflow: workflow) }
        let best = fingerprints.first(where: { $0.tier == .high }) ?? fingerprints.first(where: { $0.tier == .medium }) ?? fingerprints.first
        return CiLogReading(signals: signals, fingerprint: best?.value, tier: best?.tier, title: best?.title)
    }

    /// The failure a job's signals point at: the first that isn't a test run's totals.
    static func primary(_ signals: [CiSignal]) -> CiSignal? { signals.first { $0.kind != .summary } }

    /// `file:line` when the signal names a file.
    static func location(of signal: CiSignal?) -> String? {
        guard let path = signal?.path.nonEmpty else { return nil }
        guard let line = signal?.line, line != 0 else { return path }
        return "\(path):\(line)"
    }

    /// The assertion or error lines of a signal: its message, then what was expected and what came instead.
    static func text(of signal: CiSignal) -> String {
        [signal.message, signal.expected.map { "Expected: \($0)" }, signal.actual.map { "Received: \($0)" }]
            .compactMap(\.nonEmpty)
            .joined(separator: "\n")
    }

    // MARK: Groups

    /// Every group with a live failure: on an open pull request or a red base branch. Newest first.
    static func build(_ jobs: [JobFailure], _ context: Context) -> [CiFailureGroup] {
        var kept: [String: [JobFailure]] = [:]
        var live: [String: [JobFailure]] = [:]
        var fingerprints: [String] = []
        for job in jobs {
            guard let fingerprint = job.fingerprint.nonEmpty, job.tier != .low else { continue }
            kept[fingerprint, default: []].append(job)
            guard isLive(job, context) else { continue }
            if live[fingerprint] == nil { fingerprints.append(fingerprint) }
            live[fingerprint, default: []].append(job)
        }
        return fingerprints
            .map { group(of: $0, live: live[$0] ?? [], kept: kept[$0] ?? [], context) }
            .stablySorted { $0.lastFailedAt > $1.lastFailedAt }
    }

    /// Still red: failing on its open pull request's head, or part of a base branch's red run.
    private static func isLive(_ job: JobFailure, _ context: Context) -> Bool {
        if let prKey = job.prKey { return context.openPrs[prKey]?.failingJobs.contains(job.jobId) ?? false }
        guard let runId = job.runId else { return false }
        return context.baseBranches["\(job.repo):\(job.branch)"]?.runIds.contains(runId) ?? false
    }

    private static func group(of fingerprint: String, live: [JobFailure], kept: [JobFailure], _ context: Context) -> CiFailureGroup {
        let rows = live.stablySorted { $0.failedAt < $1.failedAt }
        let newest = rows[rows.count - 1]
        let signal = primary(newest.signals)
        let id = Self.id(of: fingerprint)
        return CiFailureGroup(
            id: id, title: newest.title ?? signal?.message ?? newest.checkName, signal: signal.map(text(of:)) ?? newest.checkName,
            location: location(of: signal), firstFailedAt: rows[0].failedAt, lastFailedAt: newest.failedAt, failures: rows.count,
            branches: branches(of: rows, context), claim: context.claims[id], facts: facts(of: kept, context)
        )
    }

    /// One hit per pull request or base branch. The base branch first: it is the likely cause of the rest.
    private static func branches(of rows: [JobFailure], _ context: Context) -> [CiBranchHit] {
        var keys: [String] = []
        var hits: [String: [JobFailure]] = [:]
        for row in rows {
            let key = row.prKey ?? "\(row.repo):\(row.branch)"
            if hits[key] == nil { keys.append(key) }
            hits[key, default: []].append(row)
        }
        let branches = keys.compactMap { hits[$0] }.map { hit in
            let last = hit[hit.count - 1]
            return CiBranchHit(
                branch: last.branch, prKey: last.prKey, title: last.prKey.flatMap { context.openPrs[$0]?.title }, failures: hit.count, sha: last.headSha,
                suspect: last.prKey == nil ? context.baseBranches["\(last.repo):\(last.branch)"]?.suspect : nil
            )
        }
        return branches.stablySorted { a, b in
            if (a.prKey == nil) != (b.prKey == nil) { return a.prKey == nil }
            return a.failures > b.failures
        }
    }

    /// What the desktop's CI failure store tallies per group, over every failure kept with the fingerprint.
    private static func facts(of rows: [JobFailure], _ context: Context) -> CiGroupFacts {
        let onPullRequests = rows.filter { $0.prKey != nil }
        let passedOnRetry = onPullRequests.count { row in
            guard let pr = row.prKey.flatMap({ context.openPrs[$0] }) else { return false }
            return pr.headSha == row.headSha && !pr.failingJobs.contains(row.jobId) && pr.passingChecks.contains(row.checkName)
        }
        return CiGroupFacts(
            tier: rows.contains { $0.tier == .high } ? .high : .medium,
            repos: distinct(rows.map(\.repo)),
            prKeys: distinct(onPullRequests.compactMap(\.prKey)),
            prJobIds: distinct(onPullRequests.map(\.jobId)),
            baseRuns: distinct(rows.filter { $0.prKey == nil }.compactMap(\.runId)),
            runCount: Set(rows.map { row in row.runId.map { "run:\($0)" } ?? "job:\(row.jobId)" }).count,
            passedOnRetry: passedOnRetry,
            catalogIds: distinct(rows.compactMap { $0.fingerprint?.prefixMatch(of: infrastructure).map { String($0.1) } }),
            failedSteps: distinct(rows.compactMap(\.failedStep))
        )
    }

    /// Each value once, in the order they first appear.
    private static func distinct<Value: Hashable>(_ values: [Value]) -> [Value] {
        var seen: Set<Value> = []
        return values.filter { seen.insert($0).inserted }
    }

    // MARK: One failed check

    /// What a failed check shows: the step, the one-line reason, a few log lines, where, and how it relates to
    /// others. `baseSince` says since when a base branch is red, when that is known.
    static func checkFailure(
        of job: JobFailure, in groups: [CiFailureGroup], baseSince: (_ repo: String, _ branch: String) -> String? = { _, _ in nil }
    ) -> CheckFailure {
        let signal = primary(job.signals)
        let group = job.tier == .low ? nil : job.fingerprint.nonEmpty.flatMap { fingerprint in groups.first { $0.id == id(of: fingerprint) } }
        let base = group?.branches.first { $0.prKey == nil }
        let elsewhere = group?.branches.contains { $0.prKey != nil && $0.prKey != job.prKey } ?? false
        return CheckFailure(
            step: job.failedStep,
            summary: signal?.message ?? (job.status == .read ? nil : job.error),
            snippet: signal.map { ($0.excerpt.isEmpty ? [$0.message] : $0.excerpt).prefix(snippetLines).joined(separator: "\n") },
            location: location(of: signal),
            newInThisPr: base == nil && !elsewhere,
            alsoOnBase: base.map { AlsoOnBase(since: baseSince(job.repo, $0.branch) ?? group?.firstFailedAt, claimedBy: group?.claim?.by) },
            groupId: group?.id
        )
    }
}

private extension Sequence {
    /// Sorted with equal elements left in their order, which `sorted` does not promise.
    func stablySorted(by areInIncreasingOrder: (Element, Element) -> Bool) -> [Element] {
        enumerated().sorted { a, b in
            if areInIncreasingOrder(a.element, b.element) { return true }
            if areInIncreasingOrder(b.element, a.element) { return false }
            return a.offset < b.offset
        }.map(\.element)
    }
}
