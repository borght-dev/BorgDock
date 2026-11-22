import Foundation

// Why a check is red, and which failures are shared: the logs of failed jobs, the red runs of base branches, and the
// groups made from them. The port of the "CI failures" part of the server's `github/service.ts`. What the server does
// after every timed poll, this does after every read of the list, and never makes the list wait for it.

/// A default branch as the last read of its workflow runs found it.
struct BaseBranchStatus: Sendable {
    /// A workflow whose latest run on the branch failed.
    struct RedWorkflow: Sendable {
        let runId: Int
        /// When the first run of the red streak started.
        let since: String
        /// The streak's first commit: the likely cause.
        let suspect: CiSuspect
        let failedJobs: [Int]
    }

    var failing: [RedWorkflow]
}

/// What `GitHubDirect` knows about failed jobs and what it is reading of them.
struct CiReads: Sendable {
    var memory: CiMemory
    /// By `owner/repo:branch`.
    var bases: [String: BaseBranchStatus] = [:]
    /// The base-branch runs whose failed jobs were listed.
    var runsRead: Set<Int> = []
    /// Log reads in flight per job, shared by the poll and detail reads.
    var jobReads: [Int: Task<Void, Never>] = [:]
    /// What runs after a poll: logs, then base branches, then the groups.
    var afterPoll: Task<Void, Never>?
    /// The open pull requests and their base branches were read, so there is something to group by.
    var knowsWhatIsRed = false
}

/// A failed job whose log is wanted, and where it failed.
private struct FailedJob: Sendable {
    let id: Int
    /// `owner/repo`
    let repo: String
    /// The account that reads it.
    let account: String
    let runId: Int?
    let headSha: String
    let branch: String
    /// Nil for a base-branch run.
    let prKey: String?
    let checkName: String
    let workflow: String?
    let failedAt: String?
}

extension FailedJob {
    init(_ check: CheckContext, on pr: PrRecord) {
        self.init(
            id: check.id, repo: "\(pr.owner)/\(pr.repo)", account: pr.account, runId: check.runId, headSha: pr.headSha, branch: pr.headRef, prKey: pr.key,
            checkName: check.name, workflow: check.workflow, failedAt: check.completedAt
        )
    }
}

private struct RawStep: Decodable, Sendable {
    let name: String
    let conclusion: String?
}

private struct RawSteps: Decodable, Sendable {
    let steps: [RawStep]?
}

private struct RawJobs: Decodable, Sendable {
    struct Job: Decodable, Sendable {
        let id: Int
        let name: String
        let conclusion: String?
        let completed_at: String?
        let steps: [RawStep]?
    }

    let jobs: [Job]
}

private struct RawRuns: Decodable, Sendable {
    struct Run: Decodable, Sendable {
        struct Commit: Decodable, Sendable { let message: String? }

        let id: Int
        let workflow_id: Int
        let name: String?
        let status: String?
        let conclusion: String?
        let head_sha: String
        let created_at: String
        let head_commit: Commit?
    }

    let workflow_runs: [Run]
}

/// The log tails read after a poll at most; the rest wait for the next one.
private let logReadsPerPoll = 6
/// The log tails a detail read starts for its own failed checks.
private let logReadsPerDetail = 4
/// A log that could not be read is tried again after this long.
private let logRetryAfter: TimeInterval = 10 * 60
/// The default branches watched: those of the repositories with the most open pull requests.
private let baseRepositories = 6
private let failedConclusions: Set<String> = ["failure", "timed_out", "startup_failure"]
/// What JavaScript's `encodeURIComponent` leaves as it is.
private let queryValueAllowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")

extension GitHubDirect {
    // MARK: Reading

    /// Starts reading what the poll left unread, unless the read of an earlier poll is still running.
    func readFailuresAfterPoll() {
        guard ci.afterPoll == nil else { return }
        ci.afterPoll = Task {
            await self.readFailures()
            self.ci.afterPoll = nil
        }
    }

    /// Returns once the reads that polls and detail reads started are done.
    func ciSettled() async {
        while let running = ci.afterPoll ?? ci.jobReads.values.first { await running.value }
    }

    /// What a poll leaves to read: the newest unread logs, then the base branches. The groups are made anew from
    /// what that found, and all of it is kept for the next launch.
    private func readFailures() async {
        let open = records.values.filter { $0.state == .open }
        let unread = open.flatMap { pr in pr.checks.filter { wantsLog($0) }.map { (check: $0, pr: pr) } }
            .sorted { ($0.check.completedAt ?? "") > ($1.check.completedAt ?? "") }
        // A detail read may have read one of them meanwhile.
        for (check, pr) in unread.prefix(logReadsPerPoll) where wantsLog(check) { await readLog(of: check, on: pr) }
        await pollBases(open)
        ci.knowsWhatIsRed = true
        ci.memory.prune(now: clock(), live: liveJobs())
        rebuildGroups()
        keepMemory()
    }

    /// A failed Actions job nobody has read, or one whose read went wrong a while ago.
    private func wantsLog(_ check: CheckContext) -> Bool {
        guard check.kind == .check, check.state == .failure, check.runId != nil, check.id > 0 else { return false }
        guard let known = ci.memory.job(check.id) else { return true }
        guard known.status == .failed, let readAt = GitHubTime.date(known.readAt) else { return false }
        return clock().timeIntervalSince(readAt) > logRetryAfter
    }

    /// Reads a failed check's log. When that read is already in flight, waits for it instead.
    private func readLog(of check: CheckContext, on pr: PrRecord) async {
        if let inFlight = ci.jobReads[check.id] {
            await inFlight.value
            return
        }
        let job = FailedJob(check, on: pr)
        let read = Task {
            await self.read(job)
            self.ci.jobReads[job.id] = nil
        }
        ci.jobReads[job.id] = read
        await read.value
    }

    /// Starts reading the failed checks of a pull request nobody has read yet. Whoever asked doesn't wait: the
    /// next detail read or poll carries what the logs said.
    func readUnreadLogs(of record: PrRecord) {
        let unread = record.checks.filter { wantsLog($0) && ci.jobReads[$0.id] == nil }.prefix(logReadsPerDetail).map { FailedJob($0, on: record) }
        guard !unread.isEmpty else { return }
        let reads = Task {
            await withTaskGroup(of: Void.self) { group in
                for job in unread { group.addTask { await self.read(job) } }
            }
            for job in unread { self.ci.jobReads[job.id] = nil }
            self.rebuildGroups()
            self.keepMemory()
        }
        for job in unread { ci.jobReads[job.id] = reads }
    }

    /// Reads one job: the step that failed, then what the tail of its log says. `steps` when the caller has them.
    private func read(_ job: FailedJob, steps known: [RawStep]? = nil) async {
        let now = GitHubTime.iso(clock())
        var failure = JobFailure(
            jobId: job.id, repo: job.repo, runId: job.runId, headSha: job.headSha, branch: job.branch, prKey: job.prKey, checkName: job.checkName,
            workflow: job.workflow, failedAt: job.failedAt ?? now, readAt: now, status: .failed
        )
        do {
            let client = try client(job.account)
            let steps: [RawStep]
            if let known {
                steps = known
            } else {
                steps = try await client.rest("GET", "/repos/\(job.repo)/actions/jobs/\(job.id)", as: RawSteps.self).steps ?? []
            }
            let failedStep = steps.first { $0.conclusion == "failure" }?.name
            failure.failedStep = failedStep
            if let log = try await client.logTail(repository: job.repo, jobId: job.id) {
                // Reading a log takes a moment; off the actor, the screens don't wait for it.
                let reading = await Task.detached { CiGroups.read(log: log, failedStep: failedStep, workflow: job.workflow) }.value
                failure.status = .read
                failure.signals = reading.signals
                failure.fingerprint = reading.fingerprint
                failure.tier = reading.tier
                failure.title = reading.title
            } else {
                failure.status = .unavailable
                failure.error = "GitHub has no log for this job."
            }
        } catch {
            failure.error = error.localizedDescription
        }
        ci.memory.save(failure)
    }

    // MARK: Base branches

    /// The default branches of the repositories with the most open pull requests: which workflows are red, and
    /// since which commit. A branch that can't be read keeps its last answer.
    private func pollBases(_ open: [PrRecord]) async {
        var perRepository: [String: (branch: String, account: String, pullRequests: Int)] = [:]
        for pr in open {
            guard let branch = pr.defaultBranch else { continue }
            perRepository["\(pr.owner)/\(pr.repo)", default: (branch, pr.account, 0)].pullRequests += 1
        }
        let watched = perRepository
            .sorted { $0.value.pullRequests != $1.value.pullRequests ? $0.value.pullRequests > $1.value.pullRequests : $0.key < $1.key }
            .prefix(baseRepositories)
        let keep = Set(watched.map { "\($0.key):\($0.value.branch)" })
        ci.bases = ci.bases.filter { keep.contains($0.key) }
        for (repo, base) in watched {
            try? await pollBase(repo: repo, branch: base.branch, account: base.account)
        }
    }

    private func pollBase(repo: String, branch: String, account: String) async throws {
        let encoded = branch.addingPercentEncoding(withAllowedCharacters: queryValueAllowed) ?? branch
        let runs = try await client(account)
            .rest("GET", "/repos/\(repo)/actions/runs?branch=\(encoded)&per_page=50&exclude_pull_requests=true", as: RawRuns.self)
            .workflow_runs
        var workflows: [Int] = []
        var byWorkflow: [Int: [RawRuns.Run]] = [:]
        for run in runs where run.status == "completed" && run.conclusion != "cancelled" && run.conclusion != "skipped" {
            if byWorkflow[run.workflow_id] == nil { workflows.append(run.workflow_id) }
            byWorkflow[run.workflow_id, default: []].append(run)
        }
        var failing: [BaseBranchStatus.RedWorkflow] = []
        for workflow in workflows {
            let newestFirst = (byWorkflow[workflow] ?? []).sorted { $0.created_at > $1.created_at }
            let redStreak = newestFirst.prefix { failedConclusions.contains($0.conclusion ?? "") }
            guard let latest = redStreak.first, let first = redStreak.last else { continue }
            let title = first.head_commit?.message?.split(separator: "\n", omittingEmptySubsequences: false).first.map { String($0) } ?? ""
            let failed = try await failedJobs(of: latest, repo: repo, branch: branch, account: account)
            failing.append(BaseBranchStatus.RedWorkflow(
                runId: latest.id, since: first.created_at, suspect: CiSuspect(sha: first.head_sha, message: title), failedJobs: failed
            ))
        }
        ci.bases["\(repo):\(branch)"] = BaseBranchStatus(failing: failing)
    }

    /// The failed jobs of a red base-branch run, reading the logs not read yet.
    private func failedJobs(of run: RawRuns.Run, repo: String, branch: String, account: String) async throws -> [Int] {
        let known = ci.memory.failures.filter { $0.runId == run.id }
        if ci.runsRead.contains(run.id), !known.isEmpty { return known.map(\.jobId) }
        let jobs = try await client(account).rest("GET", "/repos/\(repo)/actions/runs/\(run.id)/jobs?filter=latest&per_page=50", as: RawJobs.self).jobs
        let failed = jobs.filter { failedConclusions.contains($0.conclusion ?? "") }
        for job in failed.prefix(logReadsPerPoll) where ci.memory.job(job.id)?.status != .read {
            let unread = FailedJob(
                id: job.id, repo: repo, account: account, runId: run.id, headSha: run.head_sha, branch: branch, prKey: nil, checkName: job.name,
                workflow: run.name, failedAt: job.completed_at
            )
            await read(unread, steps: job.steps ?? [])
        }
        ci.runsRead.insert(run.id)
        return failed.map(\.id)
    }

    // MARK: Groups

    /// The jobs that are red now: failed checks of open pull requests and the failed jobs of red base-branch runs.
    private func liveJobs() -> Set<Int> {
        let onPullRequests = records.values.filter { $0.state == .open }.flatMap { $0.checks.filter { $0.state == .failure }.map(\.id) }
        return Set(onPullRequests).union(ci.bases.values.flatMap { $0.failing.flatMap(\.failedJobs) })
    }

    /// Groups what is known now, without asking GitHub. Until the list and the base branches were read once, a
    /// group would lose every failure they hold: the groups of the last launch stay.
    private func rebuildGroups() {
        guard ci.knowsWhatIsRed else { return }
        let open = records.values.filter { $0.state == .open }
        let openPrs = Dictionary(uniqueKeysWithValues: open.map { pr in
            (pr.key, CiGroups.OpenPullRequest(
                title: pr.title, failingJobs: Set(pr.checks.filter { $0.state == .failure }.map(\.id)),
                headSha: pr.headSha, passingChecks: Set(pr.checks.filter { $0.state == .success }.map(\.name))
            ))
        })
        let redBases = ci.bases.compactMapValues { base in
            base.failing.first.map { CiGroups.RedBase(suspect: $0.suspect, runIds: Set(base.failing.map(\.runId))) }
        }
        ci.memory.groups = CiGroups.build(ci.memory.failures, CiGroups.Context(openPrs: openPrs, baseBranches: redBases, claims: ci.memory.claims))
    }

    private func keepMemory() {
        store.set(ci.memory, forKey: CiMemory.storeKey)
    }

    // MARK: What the screens ask

    /// What the log of a failed check said, once it has been read.
    func checkFailure(of check: CheckContext) -> CheckFailure? {
        guard check.state == .failure, check.kind == .check, check.id > 0, let job = ci.memory.job(check.id) else { return nil }
        return CiGroups.checkFailure(of: job, in: ci.memory.groups) { repo, branch in ci.bases["\(repo):\(branch)"]?.failing.first?.since }
    }

    func ciGroups() -> [CiFailureGroup] { ci.memory.groups }

    func ciGroup(_ id: String) throws -> CiFailureGroup {
        guard let group = ci.memory.groups.first(where: { $0.id == id }) else {
            throw directError(404, "No such CI failure group. It may have passed since.")
        }
        return group
    }

    /// Says you are on it, as the account that reads one of its pull requests. Kept on this phone: GitHub has
    /// no claims.
    func claimCiGroup(_ id: String, note: String?) throws -> CiFailureGroup {
        let group = try ciGroup(id)
        let reader = group.branches.compactMap(\.prKey).compactMap { records[$0]?.account }.first
        guard let account = reader ?? logins.first else { throw directError(401, "Add a GitHub account in Settings.") }
        let by = Person(login: account, name: nil, avatarUrl: "https://github.com/\(account).png")
        let clean = note.map { String($0.trimmed.prefix(500)) }.nonEmpty
        ci.memory.setClaim(CiClaim(by: by, at: GitHubTime.iso(clock()), note: clean), on: id)
        keepMemory()
        return try ciGroup(id)
    }

    func releaseCiGroup(_ id: String) throws -> CiFailureGroup {
        _ = try ciGroup(id)
        ci.memory.setClaim(nil, on: id)
        keepMemory()
        return try ciGroup(id)
    }
}
