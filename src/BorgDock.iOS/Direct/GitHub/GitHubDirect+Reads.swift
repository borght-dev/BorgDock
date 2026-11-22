import Foundation

// One pull request: its page, its files and its conversation.

extension GitHubDirect {
    private struct RawFile: Decodable, Sendable {
        let filename: String
        let previous_filename: String?
        let status: String
        let additions: Int
        let deletions: Int
        let patch: String?
    }

    private struct RawCompare: Decodable, Sendable {
        let files: [RawFile]?
    }

    /// A page waits this long for Azure DevOps before it shows without its work items' titles.
    private static let workItemsWithin: Duration = .seconds(4)

    /// The account that reads a pull request: the one the list read it with, else one that knows its owner.
    func account(for key: PrKey) throws -> String {
        if let known = records[key.key]?.account ?? detailCache[key.key]?.account { return known }
        let owner = key.owner.lowercased()
        if let sameOwner = records.values.first(where: { $0.owner.lowercased() == owner })?.account { return sameOwner }
        guard let first = logins.first else { throw directError(401, "Add a GitHub account in Settings.") }
        return first
    }

    private func detailRaw(_ key: PrKey) async throws -> (raw: RawDetail, account: String) {
        if let cached = detailCache[key.key], clock().timeIntervalSince(cached.at) < Self.detailFreshFor { return (cached.raw, cached.account) }
        if let inFlight = detailReads[key.key] { return try await inFlight.value }
        let read = Task { try await self.readDetail(key) }
        detailReads[key.key] = read
        defer { if detailReads[key.key] == read { detailReads[key.key] = nil } }
        let entry = try await read.value
        if detailReads[key.key] == read { detailCache[key.key] = (clock(), entry.raw, entry.account) }
        return entry
    }

    /// A repository no poll has shown may belong to another account: the first one that can see it reads it from now on.
    private func readDetail(_ key: PrKey) async throws -> (raw: RawDetail, account: String) {
        let first = try account(for: key)
        let readers = [first] + logins.filter { $0 != first }
        let variables: [String: GraphQLValue] = ["owner": .string(key.owner), "repo": .string(key.repo), "number": .int(key.number)]
        for account in readers {
            do {
                let raw = try await client(account).graphql(GitHubQueries.detail, variables, as: RawDetail.self)
                if raw.repository?.pullRequest != nil { return (raw, account) }
            } catch let error as GitHubError where [401, 403, 404].contains(error.status) {
                continue
            }
        }
        throw directError(404, "\(key.key) doesn't exist or \(readers.joined(separator: " and ")) can't see it.")
    }

    /// The pull request as GitHub has it now; the list's own copy follows, so a page never shows older than the list.
    func record(of key: PrKey) async throws -> (record: PrRecord, detail: RawDetail.PullRequest, repository: RawDetail.Repository, account: String) {
        do {
            let (raw, account) = try await detailRaw(key)
            guard let repository = raw.repository, let detail = repository.pullRequest else { throw directError(404, "\(key.key) doesn't exist.") }
            let record = GitHubMapping.record(detail.shared, account: account)
            if records[record.key] != nil { records[record.key] = record }
            return (record, detail, repository, account)
        } catch let error as GitHubError {
            throw error.shown
        }
    }

    func pullRequest(_ key: PrKey) async throws -> PrDetail {
        let (record, detail, repository, account) = try await record(of: key)
        let methods: [MergeMethod] = (repository.squashMergeAllowed ? [.squash] : []) + (repository.mergeCommitAllowed ? [.merge] : [])
            + (repository.rebaseMergeAllowed ? [.rebase] : [])
        let preferred = MergeMethod(rawValue: repository.viewerDefaultMergeMethod.lowercased())
        let summary = summary(of: record)
        return PrDetail(
            summary: summary,
            body: record.body,
            commits: detail.commits.totalCount,
            reviews: GitHubMapping.reviews(detail.reviews.nodes),
            requestedReviewers: GitHubMapping.requestedReviewers(detail.reviewRequestsFull.nodes),
            requestedFromYou: record.isWaitingOnMe(account, teams: teamsOf(account)),
            checkRuns: checkRuns(record),
            proofImages: GitHubMapping.proofImages(record.body),
            allowedMergeMethods: methods,
            defaultMergeMethod: preferred.flatMap { methods.contains($0) ? $0 : nil } ?? methods.first ?? .merge,
            deleteBranchOnMerge: repository.deleteBranchOnMerge,
            viewerCanMerge: ["ADMIN", "MAINTAIN", "WRITE"].contains(repository.viewerPermission ?? ""),
            workItems: await workItems(named: summary.workItemIds),
            threads: []
        )
    }

    /// One pull request in any state, for a work item's linked pull requests.
    func summary(_ key: PrKey) async throws -> PrSummary {
        summary(of: try await record(of: key).record)
    }

    /// The open pull requests of the last read of the list.
    func openPullRequests() -> [PrSummary] {
        records.values.filter { $0.state == .open }.map(summary)
    }

    /// The work items a pull request names, from Azure DevOps; ones read before answer at once.
    private func workItems(named ids: [Int]) async -> [WorkItemSummary] {
        let missing = ids.filter { workItemCache[$0] == nil }
        if !missing.isEmpty {
            let lookup = workItems
            let read = await withTaskGroup(of: [WorkItemSummary]?.self) { group in
                group.addTask { await lookup(missing) }
                group.addTask {
                    try? await Task.sleep(for: Self.workItemsWithin)
                    return nil
                }
                let first = await group.next() ?? nil
                group.cancelAll()
                return first ?? []
            }
            for item in read { workItemCache[item.id] = item }
        }
        return ids.compactMap { workItemCache[$0] }
    }

    private func checkRuns(_ record: PrRecord) -> [CheckRun] {
        let order: [CheckState: Int] = [.failure: 0, .pending: 1, .success: 2, .neutral: 3, .skipped: 4]
        return record.checks.map { check in
            let duration: Int? = if let started = GitHubTime.date(check.startedAt), let completed = GitHubTime.date(check.completedAt) {
                Int(completed.timeIntervalSince(started).rounded())
            } else {
                nil
            }
            return CheckRun(
                id: check.id, name: check.name, workflow: check.workflow, state: check.state, startedAt: check.startedAt, completedAt: check.completedAt,
                durationSeconds: duration, url: check.url, runId: check.runId, jobId: check.kind == .check && check.runId != nil ? check.id : nil,
                failure: nil
            )
        }
        .sorted { (order[$0.state, default: 9], $0.name) < (order[$1.state, default: 9], $1.name) }
    }

    func pullRequestFiles(_ key: PrKey) async throws -> PrFiles {
        let (record, _, _, account) = try await record(of: key)
        do {
            let client = try client(account)
            let repository = "/repos/\(key.owner)/\(key.repo)"
            var raw: [RawFile] = []
            for page in 1...10 {
                let batch = try await client.rest("GET", "\(repository)/pulls/\(key.number)/files?per_page=100&page=\(page)", as: [RawFile].self)
                raw += batch
                if batch.count < 100 { break }
            }
            let reviewed = record.myReview(account)?.commitSha
            let changed = try await changedSince(reviewed, record: record, client: client, repository: repository)
            let statuses: [String: PrFileStatus] = ["added": .added, "removed": .removed, "renamed": .renamed, "copied": .added]
            return PrFiles(
                headSha: record.headSha,
                reviewedHeadSha: reviewed,
                files: raw.map { file in
                    PrFile(
                        path: file.filename, previousPath: file.previous_filename, status: statuses[file.status] ?? .modified,
                        additions: file.additions, deletions: file.deletions, patch: file.patch,
                        changedSinceReview: changed?.contains(file.filename) ?? true,
                        category: FileCategory.of(file.filename, hasPatch: file.patch != nil)
                    )
                }
            )
        } catch let error as GitHubError {
            throw error.shown
        }
    }

    /// The files touched after your last review; nil when every file counts, because a force-push dropped the
    /// commit you reviewed.
    private func changedSince(_ reviewed: String?, record: PrRecord, client: GitHubClient, repository: String) async throws -> Set<String>? {
        guard let reviewed, reviewed != record.headSha else { return [] }
        do {
            let compare = try await client.rest("GET", "\(repository)/compare/\(reviewed)...\(record.headSha)", as: RawCompare.self)
            return Set((compare.files ?? []).flatMap { [$0.filename] + [$0.previous_filename].compactMap { $0 } })
        } catch let error as GitHubError where error.status == 404 {
            return nil
        }
    }

    func conversation(_ key: PrKey) async throws -> PrConversation {
        do {
            let variables: [String: GraphQLValue] = ["owner": .string(key.owner), "repo": .string(key.repo), "number": .int(key.number)]
            let raw = try await client(account(for: key)).graphql(GitHubQueries.conversation, variables, as: RawConversation.self)
            guard let pullRequest = raw.repository?.pullRequest else { throw directError(404, "\(key.key) doesn't exist.") }
            return GitHubMapping.conversation(pullRequest)
        } catch let error as GitHubError {
            throw error.shown
        }
    }
}
