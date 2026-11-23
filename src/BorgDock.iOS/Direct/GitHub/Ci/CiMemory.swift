import Foundation

/// What a failed job's log said, or why it could not be read: a row of the server's `github_job_failures`.
struct JobFailure: Codable, Hashable, Sendable {
    enum Status: String, Codable, Sendable {
        case read
        /// GitHub has no log for the job.
        case unavailable
        /// Reading went wrong; it is tried again later.
        case failed
    }

    var jobId: Int
    /// `owner/repo`
    var repo: String
    var runId: Int?
    var headSha: String
    var branch: String
    /// Nil for a base-branch run.
    var prKey: String?
    var checkName: String
    var workflow: String?
    var failedStep: String?
    var failedAt: String
    var readAt: String
    var status: Status
    var error: String?
    var signals: [CiSignal] = []
    var fingerprint: String?
    var tier: CiFingerprint.Tier?
    var title: String?
}

/// What the phone keeps about failed jobs between launches: what each read log said, who is on which group, and the
/// groups as they last were, to show while the first read runs. The server keeps the same in SQLite
/// (`github/store.ts`); here it is one small document.
struct CiMemory: Codable, Sendable {
    static let storeKey = "github.ci"
    /// Failures are kept this long; groups say "first failed" within it.
    static let retention: TimeInterval = 14 * 24 * 3600
    /// Past this many, the oldest failures go first, so the document stays small however much fails.
    static let maxJobs = 400

    /// The fingerprint rules the failures were read under.
    private var rules = CiFingerprint.version
    private var jobs: [Int: JobFailure] = [:]
    /// By group id.
    private(set) var claims: [String: CiClaim] = [:]
    var groups: [CiFailureGroup] = []

    /// What the last launch kept. Fingerprints of other rules would never match new ones: those failures are
    /// forgotten and their logs read again.
    static func kept(in store: any DirectStore) -> CiMemory {
        guard let kept = store.value(CiMemory.self, forKey: storeKey), kept.rules == CiFingerprint.version else { return CiMemory() }
        return kept
    }

    func job(_ id: Int) -> JobFailure? { jobs[id] }

    /// Every kept failure, oldest first.
    var failures: [JobFailure] {
        jobs.values.sorted { ($0.failedAt, $0.jobId) < ($1.failedAt, $1.jobId) }
    }

    /// Keeps what the screens show of a job: its first failure with the lines of its snippet. The rest of what the
    /// log said has done its work in the fingerprint.
    mutating func save(_ failure: JobFailure) {
        var kept = failure
        kept.signals = CiGroups.primary(failure.signals).map { signal in
            var shown = signal
            shown.excerpt = Array(signal.excerpt.prefix(CiGroups.snippetLines))
            shown.frames = []
            return [shown]
        } ?? []
        jobs[failure.jobId] = kept
    }

    /// Who is on a group, or nobody when `claim` is nil. The group carries it at once.
    mutating func setClaim(_ claim: CiClaim?, on groupId: String) {
        claims[groupId] = claim
        groups = groups.map { $0.id == groupId ? $0.with(claim: claim) : $0 }
    }

    /// Forgets failures older than `retention` and, past `maxJobs`, the oldest ones. `live` jobs stay however old:
    /// they are red now, and forgetting one would read its log again on every poll. A claim goes with the last
    /// failure of its group.
    mutating func prune(now: Date, live: Set<Int>) {
        let cutoff = now.addingTimeInterval(-Self.retention)
        jobs = jobs.filter { live.contains($0.key) || (GitHubTime.date($0.value.failedAt) ?? .distantPast) >= cutoff }
        let spare = failures.filter { !live.contains($0.jobId) }
        for oldest in spare.prefix(max(0, jobs.count - Self.maxJobs)) { jobs[oldest.jobId] = nil }
        let groupsKept = Set(jobs.values.compactMap(\.fingerprint).map(CiGroups.id(of:)))
        claims = claims.filter { groupsKept.contains($0.key) }
    }
}

extension CiFailureGroup {
    func with(claim: CiClaim?) -> CiFailureGroup {
        CiFailureGroup(
            id: id, title: title, signal: signal, location: location, firstFailedAt: firstFailedAt, lastFailedAt: lastFailedAt,
            failures: failures, branches: branches, claim: claim, facts: facts
        )
    }
}
