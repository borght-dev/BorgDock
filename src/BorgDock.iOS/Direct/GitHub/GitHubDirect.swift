import Foundation

/// Reads the work items a pull request names, so its page can show their titles and states. Empty when Azure DevOps
/// isn't connected.
typealias WorkItemLookup = @Sendable (_ ids: [Int]) async -> [WorkItemSummary]

/// Everything the pull request screens read from GitHub, read from this phone: the open pull requests with their
/// Focus buckets, details, files, conversations, why a check is red, related CI failures, and the writes. The Swift
/// port of the server's `github/service.ts`; what the server polls on a timer, this reads when a screen asks and the
/// last read has gone old.
actor GitHubDirect: PullRequestBackend {
    /// What one search last found; a search that fails keeps its previous answer.
    struct SearchResult: Sendable {
        var found: [RawPullRequest]
        var cutOff: Bool
    }

    /// The last read of one watched repository. A failed read keeps the pull requests of the one before.
    struct RepositoryRead: Sendable {
        var name: String
        var account: String?
        var records: [PrRecord]
        var cutOff: Bool
        var polledAt: String?
        var ok: Bool
        var error: String?
        /// When the last good read was.
        var readAt: Date?
    }

    struct AccountStatus: Sendable {
        var ok: Bool
        var error: String?
        /// What failed when nothing of the account could be read.
        var cause: (any Error)?
    }

    /// A read of the list this recent answers the next ask.
    static let pollEvery: TimeInterval = 60
    /// A repository read this recently waits for a later poll: a search per repository every minute would spend the
    /// GraphQL budget the desktop shares on the same accounts. Pull to refresh and changed settings read every one.
    static let repositoryFreshFor: TimeInterval = 3 * 60
    /// Repository searches running at once; GitHub's secondary rate limit punishes bursts.
    static let repositorySearchesAtOnce = 4
    static let teamsFreshFor: TimeInterval = 60 * 60
    static let detailFreshFor: TimeInterval = 10
    /// GitHub's search lags a write by a moment; the list is read again this long after one.
    static let settleAfterWrite: TimeInterval = 1.5
    static let focusStoreKey = "github.focus"

    let accounts: [GitHubAccount]
    let store: any DirectStore
    let workItems: WorkItemLookup
    let clock: @Sendable () -> Date
    private let clients: [String: GitHubClient]

    private(set) var settings: GitHubSettings
    var memory: GitHubMemory

    private var accountStatus: [String: AccountStatus] = [:]
    private var teams: [String: (slugs: [String], at: Date)] = [:]
    /// Open pull requests from the last poll of each account.
    private var byAccount: [String: [PrRecord]] = [:]
    private var bySearch: [String: [String: SearchResult]] = [:]
    /// Watched repositories by lower-cased name, each read by the account that could read it last time.
    private var byRepository: [String: RepositoryRead] = [:]
    private var polledAt: Date?
    /// The next poll reads every watched repository, fresh or not.
    private var repositoriesDue = true
    /// Set by a write: the list is read again once GitHub has had a moment.
    private var changedAt: Date?
    var records: [String: PrRecord] = [:]
    private var current: Focus?
    private var polling: Task<Focus, Error>?

    var detailCache: [String: (at: Date, raw: RawDetail, account: String)] = [:]
    /// Detail reads in flight per pull request, so a detail and its files read at once ask GitHub once.
    var detailReads: [String: Task<(raw: RawDetail, account: String), Error>] = [:]
    var workItemCache: [Int: WorkItemSummary] = [:]
    /// What the logs of failed jobs said, and what is being read of them (`Ci/GitHubDirect+CiFailures.swift`).
    var ci: CiReads

    init(
        accounts: [GitHubAccount], store: any DirectStore, session: URLSession = .shared,
        workItems: @escaping WorkItemLookup = { _ in [] }, now: @escaping @Sendable () -> Date = { .now }
    ) {
        // GitHub ignores case in logins; the first token given for one wins.
        var seen: Set<String> = []
        self.accounts = accounts.filter { seen.insert($0.login.lowercased()).inserted }
        self.store = store
        self.workItems = workItems
        clock = now
        clients = Dictionary(uniqueKeysWithValues: self.accounts.map { ($0.login, GitHubClient(account: $0, session: session)) })
        settings = store.value(forKey: GitHubSettings.storeKey) ?? GitHubSettings()
        memory = store.value(forKey: GitHubMemory.storeKey) ?? GitHubMemory()
        ci = CiReads(memory: CiMemory.kept(in: store))
    }

    /// Who a token belongs to; how Settings checks a token before it keeps it.
    static func whoIs(token: String, session: URLSession = .shared) async throws -> Person {
        do {
            let client = GitHubClient(account: GitHubAccount(login: "this token", token: token), session: session)
            return try await client.graphql(GitHubQueries.viewer, as: RawViewer.self).viewer.person
        } catch let error as GitHubError {
            throw error.shown
        }
    }

    /// The list as the last launch left it, to show while the first read runs.
    nonisolated func lastFocus() -> Focus? {
        store.value(forKey: Self.focusStoreKey)
    }

    func client(_ login: String) throws -> GitHubClient {
        guard let client = clients[login] else { throw GitHubError(status: 401, message: "No GitHub token for \(login). Add one in Settings.") }
        return client
    }

    var logins: [String] { accounts.map(\.login) }

    // MARK: - The list

    func focus(fresh: Bool) async throws -> Focus {
        if !fresh, changedAt == nil, let current, let polledAt, clock().timeIntervalSince(polledAt) < Self.pollEvery { return current }
        return try await refresh(repositories: fresh)
    }

    /// Reads GitHub now; concurrent callers share one read. `repositories` reads every watched repository too.
    func refresh(repositories: Bool = false) async throws -> Focus {
        if repositories { repositoriesDue = true }
        if let polling { return try await polling.value }
        let read = Task { try await self.poll() }
        polling = read
        defer { polling = nil }
        return try await read.value
    }

    private func poll() async throws -> Focus {
        guard !accounts.isEmpty else { throw directError(401, "Add a GitHub account in Settings.") }
        if let changedAt {
            let wait = Self.settleAfterWrite - clock().timeIntervalSince(changedAt)
            if wait > 0 { try await Task.sleep(for: .seconds(wait)) }
            self.changedAt = nil
        }
        let searches = settings.involvementSearches
        await withTaskGroup(of: Void.self) { group in
            for login in logins { group.addTask { await self.pollAccount(login, searches: searches) } }
            group.addTask { await self.pollRepositories() }
        }
        if let failure = totalFailure() { throw failure }
        polledAt = clock()
        records = mergeAccounts()
        let waiting = records.values.filter { $0.isWaitingOnMe($0.account, teams: teamsOf($0.account)) }.map { "\($0.key):\($0.account.lowercased())" }
        memory.syncReviewRequests(waiting, at: GitHubTime.iso(clock()))
        memory.prune(now: clock())
        store.set(memory, forKey: GitHubMemory.storeKey)
        let focus = publishFocus()
        // Job logs and base branches take longer than the searches; the list doesn't wait for them.
        readFailuresAfterPoll()
        return focus
    }

    /// Why the read failed, when no account and no watched repository answered: the list on screen is then old, and
    /// saying so beats handing it back as new.
    private func totalFailure() -> (any Error)? {
        guard logins.allSatisfy({ accountStatus[$0]?.cause != nil }), byRepository.values.allSatisfy({ !$0.ok }) else { return nil }
        let cause = logins.compactMap { accountStatus[$0]?.cause }.first
        return (cause as? GitHubError)?.shown ?? cause
    }

    /// The searches for pull requests that involve this account, in any repository.
    private func pollAccount(_ login: String, searches: [String]) async {
        do {
            let failure = try await runSearches(login, searches)
            var seen: Set<String> = []
            let found = searches.flatMap { bySearch[login]?[$0]?.found ?? [] }.filter { seen.insert($0.id).inserted }
            byAccount[login] = found.map { GitHubMapping.record($0, account: login) }
            await refreshTeams(login)
            accountStatus[login] = AccountStatus(ok: failure == nil, error: failure)
        } catch {
            // A failed account keeps its last pull requests; its status says why they are old.
            accountStatus[login] = AccountStatus(ok: false, error: error.localizedDescription, cause: error)
        }
    }

    /// Runs every search at once. A search that fails keeps its last answer and is named in the result; all failing throws.
    private func runSearches(_ login: String, _ searches: [String]) async throws -> String? {
        bySearch[login] = (bySearch[login] ?? [:]).filter { searches.contains($0.key) }
        let results = await withTaskGroup(of: (String, Result<SearchResult, Error>).self) { group in
            for query in searches {
                group.addTask { (query, await Result { try await self.searchAll(login, query, maxPages: GitHubQueries.focusMaxPages) }) }
            }
            var answers: [String: Result<SearchResult, Error>] = [:]
            for await (query, answer) in group { answers[query] = answer }
            return answers
        }
        var failures: [String] = []
        var firstError: Error?
        for query in searches {
            switch results[query] {
            case .success(let result): bySearch[login]?[query] = result
            case .failure(let error):
                firstError = firstError ?? error
                let scope = query.firstMatch(of: #/\S+:@me/#).map { String($0.0) } ?? "repositories"
                failures.append("\(scope): \(error.localizedDescription)")
            case nil: break
            }
        }
        if let firstError, failures.count == searches.count { throw firstError }
        return failures.isEmpty ? nil : "Showing older results for \(failures.joined(separator: "; "))"
    }

    /// Pages through a search; `cutOff` when pages were left after `maxPages`.
    private func searchAll(_ login: String, _ query: String, maxPages: Int) async throws -> SearchResult {
        var found: [RawPullRequest] = []
        var after: String?
        for _ in 0..<maxPages {
            let page = try await client(login).graphql(GitHubQueries.focus, ["query": .string(query), "after": .optional(after)], as: FocusPage.self).found
            found += page.nodes.compactMap(\.value)
            guard page.pageInfo.hasNextPage, let cursor = page.pageInfo.endCursor else { return SearchResult(found: found, cutOff: false) }
            after = cursor
        }
        return SearchResult(found: found, cutOff: true)
    }

    /// Every watched repository on its own search, a few at a time.
    private func pollRepositories() async {
        let watched = settings.repositories
        let keep = Set(watched.map { $0.lowercased() })
        byRepository = byRepository.filter { keep.contains($0.key) }
        let due = repositoriesDue
        repositoriesDue = false
        let now = clock()
        var queue = watched.filter { name in
            guard !due, let read = byRepository[name.lowercased()], read.ok, let readAt = read.readAt else { return true }
            return now.timeIntervalSince(readAt) >= Self.repositoryFreshFor
        }.makeIterator()
        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<Self.repositorySearchesAtOnce {
                guard let name = queue.next() else { break }
                group.addTask { await self.pollRepository(name) }
            }
            for await _ in group {
                guard let name = queue.next() else { continue }
                group.addTask { await self.pollRepository(name) }
            }
        }
    }

    /// Reads with the account that read it last, else each account in turn; when none can, the last answer stays.
    private func pollRepository(_ name: String) async {
        let key = name.lowercased()
        let previous = byRepository[key]
        let remembered = previous?.account.flatMap { logins.contains($0) ? $0 : nil }
        let readers = remembered.map { known in [known] + logins.filter { $0 != known } } ?? logins
        var errors: [String] = []
        for login in readers {
            do {
                let result = try await searchAll(login, GitHubSettings.repositorySearch(name), maxPages: GitHubQueries.repositoryMaxPages)
                byRepository[key] = RepositoryRead(
                    name: name, account: login, records: result.found.map { GitHubMapping.record($0, account: login) }, cutOff: result.cutOff,
                    polledAt: GitHubTime.iso(clock()), ok: true, error: nil, readAt: clock()
                )
                return
            } catch {
                errors.append("\(login): \(error.localizedDescription)")
            }
        }
        byRepository[key] = RepositoryRead(
            name: name, account: previous?.account, records: previous?.records ?? [], cutOff: previous?.cutOff ?? false, polledAt: previous?.polledAt,
            ok: false, error: errors.isEmpty ? "No GitHub account to read it with." : errors.joined(separator: "; "), readAt: previous?.readAt
        )
    }

    private func refreshTeams(_ login: String) async {
        if let cached = teams[login], clock().timeIntervalSince(cached.at) < Self.teamsFreshFor { return }
        // Team reviews need read:org; without it only personal requests count.
        let slugs = (try? await client(login).graphql(GitHubQueries.teams, ["login": .string(login)], as: RawTeams.self).slugs) ?? teams[login]?.slugs ?? []
        teams[login] = (slugs, clock())
    }

    /// Your teams count for review requests unless the settings say only yours do.
    func teamsOf(_ login: String) -> [String] {
        settings.includeTeamRequests ? teams[login]?.slugs ?? [] : []
    }

    /// One record per pull request; one read by an account it involves wins over a read through a watched repository.
    private func mergeAccounts() -> [String: PrRecord] {
        var merged: [String: PrRecord] = [:]
        func involves(_ pr: PrRecord) -> Bool {
            pr.isMine(pr.account) || pr.needsYou(pr.account, teams: teamsOf(pr.account)) || pr.myReview(pr.account) != nil
        }
        let lists = logins.compactMap { byAccount[$0] } + settings.repositories.compactMap { byRepository[$0.lowercased()]?.records }
        for pr in lists.joined() {
            if let known = merged[pr.key], involves(known) || !involves(pr) { continue }
            merged[pr.key] = pr
        }
        return merged
    }

    func context(_ account: String) -> FocusContext {
        let suffix = ":\(account.lowercased())"
        let mine = memory.reviewRequests.filter { $0.key.hasSuffix(suffix) }
        return FocusContext(
            login: account, teams: teamsOf(account), now: clock(), staleAfterDays: settings.staleAfterDays,
            snoozes: memory.snoozes.compactMapValues { GitHubTime.date($0) },
            reviewRequests: Dictionary(uniqueKeysWithValues: mine.map { (String($0.key.dropLast(suffix.count)), $0.value) })
        )
    }

    func summary(of pr: PrRecord) -> PrSummary { summary(of: pr, context(pr.account)) }

    private func summary(of pr: PrRecord, _ context: FocusContext) -> PrSummary {
        let snoozed = context.snoozedUntil(pr.key).flatMap { $0 > context.now ? GitHubTime.iso($0) : nil }
        return PrSummary(
            owner: pr.owner,
            repo: pr.repo,
            number: pr.number,
            key: pr.key,
            account: pr.account,
            title: pr.title,
            url: pr.url,
            author: pr.author,
            isMine: pr.isMine(pr.account),
            isDraft: pr.isDraft,
            state: pr.state,
            headRef: pr.headRef,
            baseRef: pr.baseRef,
            headSha: pr.headSha,
            createdAt: pr.createdAt,
            updatedAt: pr.updatedAt,
            mergedAt: pr.mergedAt,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changedFiles,
            labels: pr.labels,
            checks: FocusRules.checkSummary(pr.checks),
            reviewDecision: pr.reviewDecision,
            approvedBy: pr.latestReviews.filter { $0.state == .approved }.map(\.login),
            mergeable: pr.mergeable,
            bucket: FocusRules.bucket(for: pr, context),
            reason: FocusRules.reason(for: pr, context),
            workItemIds: FocusRules.workItemIds(title: pr.title, body: pr.body, headRef: pr.headRef),
            snoozedUntil: snoozed,
            autoMerge: pr.autoMerge,
            reviewedHeadSha: pr.myReview(pr.account)?.commitSha,
            requestedReviewerLogins: pr.requestedReviewers,
            requestedTeams: pr.requestedTeams,
            latestReviews: pr.latestReviews.map { PrLatestReview(login: $0.login, state: $0.state, commitSha: $0.commitSha, submittedAt: $0.submittedAt) },
            priorityScore: FocusRules.score(of: pr, context),
            failedChecks: FocusRules.failedChecks(pr.checks),
            reviewRequestedAt: reviewRequestedAt(pr, context)
        )
    }

    /// Since when the open review is asked: yours while it waits on you (GitHub's request, else when this phone first
    /// saw it), else the first of the reviewers still pending.
    private func reviewRequestedAt(_ pr: PrRecord, _ context: FocusContext) -> String? {
        let times = pr.reviewRequestTimes
        if pr.isWaitingOnMe(context.login, teams: context.teams) {
            let mine = [PrRecord.reviewerKey(login: context.login)] + FocusRules.matchedTeams(pr.requestedTeams, mine: context.teams).map(PrRecord.reviewerKey(team:))
            return mine.compactMap { times[$0] }.min() ?? context.reviewRequestedAt(pr.key)
        }
        let pending = pr.requestedReviewers.map(PrRecord.reviewerKey(login:)) + pr.requestedTeams.map(PrRecord.reviewerKey(team:))
        return pending.compactMap { times[$0] }.min()
    }

    private func buildFocus() -> Focus {
        let contexts = Dictionary(uniqueKeysWithValues: logins.map { ($0, context($0)) })
        let open = records.values.filter { $0.state == .open }
        let ranked = open.map { summary(of: $0, contexts[$0.account] ?? context($0.account)) }.sorted { a, b in
            let (rankA, rankB) = (rank(a), rank(b))
            if FocusRules.comesFirst(rankA, rankB) { return true }
            if FocusRules.comesFirst(rankB, rankA) { return false }
            return a.key < b.key
        }
        var counts = Dictionary(uniqueKeysWithValues: FocusRules.buckets.map { ($0.rawValue, 0) })
        for summary in ranked { counts[summary.bucket.rawValue, default: 0] += 1 }
        return Focus(
            generatedAt: GitHubTime.iso(clock()),
            counts: counts,
            pullRequests: ranked,
            agentsWaiting: [],
            teams: Dictionary(uniqueKeysWithValues: logins.map { ($0.lowercased(), teamsOf($0)) }),
            staleAfterDays: settings.staleAfterDays
        )
    }

    private func rank(_ summary: PrSummary) -> FocusRules.Rank {
        FocusRules.Rank(bucket: summary.bucket, score: summary.priorityScore ?? 0, updatedAt: summary.updatedAt, size: summary.additions + summary.deletions)
    }

    /// Rebuilds the list from what's known (no GitHub calls) and keeps it for the next launch.
    @discardableResult
    func publishFocus() -> Focus {
        let focus = buildFocus()
        current = focus
        store.set(focus, forKey: Self.focusStoreKey)
        return focus
    }

    /// After a write: forget the cached detail and read the list again once GitHub has caught up.
    func changed(_ key: PrKey) {
        detailCache[key.key] = nil
        detailReads[key.key] = nil
        changedAt = clock()
    }

    // MARK: - Repositories

    /// Where the pull request list comes from and how much of it the last poll read.
    func repositories() -> PrRepositories {
        let searchesCut = bySearch.values.contains { $0.values.contains(where: \.cutOff) }
        return PrRepositories(
            source: settings.repositories.isEmpty ? .none : .config,
            desktopName: nil,
            updatedAt: nil,
            repositories: settings.repositories.map { name in
                let read = byRepository[name.lowercased()]
                return PrRepositories.Repository(name: name, open: read?.records.count ?? 0, polledAt: read?.polledAt, ok: read?.ok ?? true, error: read?.error)
            },
            includeInvolving: settings.includeInvolving,
            includeTeamRequests: settings.includeTeamRequests,
            polledAt: polledAt.map(GitHubTime.iso),
            cutOff: searchesCut || byRepository.values.contains(where: \.cutOff)
        )
    }

    func setRepositoryPreferences(_ preferences: PrRepositoryPreferences) -> PrRepositories {
        var next = settings
        if let involving = preferences.includeInvolving { next.includeInvolving = involving }
        if let teams = preferences.includeTeamRequests { next.includeTeamRequests = teams }
        update(next)
        return repositories()
    }

    /// Which repositories to list every open pull request of.
    @discardableResult
    func watch(_ repositories: [String]) -> PrRepositories {
        var next = settings
        next.repositories = GitHubSettings.cleanRepositories(repositories)
        update(next)
        return self.repositories()
    }

    /// The next read of the list uses the new settings and reads every repository.
    private func update(_ next: GitHubSettings) {
        guard next != settings else { return }
        settings = next
        store.set(settings, forKey: GitHubSettings.storeKey)
        repositoriesDue = true
        polledAt = nil
    }
}
