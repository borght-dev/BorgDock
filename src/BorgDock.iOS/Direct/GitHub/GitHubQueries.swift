import Foundation

// The GraphQL BorgDock sends and how its answers become records: the port of the server's `github/queries.ts`. Every
// search answer carries everything Focus needs: reviews, requests, the head commit's checks and the newest commit ids.

enum GitHubQueries {
    private static let checkContexts = """
      nodes {
        __typename
        ... on CheckRun {
          databaseId name status conclusion startedAt completedAt detailsUrl
          checkSuite { workflowRun { databaseId runNumber workflow { name } } }
        }
        ... on StatusContext { context state targetUrl createdAt }
      }
    """

    private static let pullRequestFields = """
      id number title body url isDraft state createdAt updatedAt mergedAt
      additions deletions changedFiles headRefName baseRefName headRefOid isCrossRepository mergeable reviewDecision
      autoMergeRequest { enabledAt }
      author { login avatarUrl ... on User { name } }
      repository { name owner { login } defaultBranchRef { name } }
      labels(first: 20) { nodes { name color } }
      reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug } } } }
      requested: timelineItems(last: 20, itemTypes: [REVIEW_REQUESTED_EVENT]) {
        nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer { __typename ... on User { login } ... on Team { slug } } } }
      }
      latestReviews(first: 25) { nodes { state submittedAt author { login } commit { oid } } }
      head: commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { \(checkContexts) } } } } }
      recent: commits(last: 20) { nodes { commit { oid } } }
    """

    /// Each search is its own request, a page at a time: with every check of every head commit, 40 pull requests in
    /// one answer took GitHub longer than its 10 s limit (a 504), and 25 took 8 s.
    static let focusPageSize = 20
    static let focusMaxPages = 5
    /// A repository's search reads to the end, up to this many pages; past it the list says it was cut off.
    static let repositoryMaxPages = 20

    static let focus = """
      query FocusSearch($query: String!, $after: String) {
        viewer { login }
        found: search(query: $query, type: ISSUE, first: \(focusPageSize), after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes { ... on PullRequest { \(pullRequestFields) } }
        }
      }
    """

    static let viewer = "query Viewer { viewer { login name avatarUrl } }"

    static let teams = """
      query ViewerTeams($login: String!) {
        viewer { organizations(first: 20) { nodes { teams(first: 50, userLogins: [$login]) { nodes { slug } } } } }
      }
    """

    static let detail = """
      query PrDetail($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          squashMergeAllowed mergeCommitAllowed rebaseMergeAllowed deleteBranchOnMerge viewerPermission viewerDefaultMergeMethod
          pullRequest(number: $number) {
            \(pullRequestFields)
            commits { totalCount }
            reviews(last: 50) { nodes { state submittedAt body author { login avatarUrl ... on User { name } } } }
            reviewRequestsFull: reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login name avatarUrl } ... on Team { slug name avatarUrl } } } }
          }
        }
      }
    """

    static let head = """
      query PrHead($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) { pullRequest(number: $number) { id headRefOid state headRefName isCrossRepository
          head: commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { \(checkContexts) } } } } } } }
      }
    """

    static let conversation = """
      query PrConversation($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100) { nodes { id path line originalLine startLine diffSide isOutdated isResolved
              comments(first: 50) { nodes { id body createdAt diffHunk author { login avatarUrl ... on User { name } } reactionGroups { content reactors { totalCount } } } } } }
            comments(last: 100) { nodes { id body createdAt author { login avatarUrl ... on User { name } } reactionGroups { content reactors { totalCount } } } }
          }
        }
      }
    """

    static let reply = """
      mutation Reply($threadId: ID!, $body: String!) { addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) { comment { id } } }
    """

    static let resolve = """
      mutation Resolve($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } } }
    """

    static let autoMerge = """
      mutation AutoMerge($id: ID!, $method: PullRequestMergeMethod!, $headline: String, $body: String, $head: GitObjectID) {
        enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $method, commitHeadline: $headline, commitBody: $body, expectedHeadOid: $head }) { clientMutationId }
      }
    """

    static let bypassMerge = """
      mutation BypassMerge($id: ID!, $method: PullRequestMergeMethod!, $headline: String, $body: String, $head: GitObjectID!) {
        mergePullRequest(input: { pullRequestId: $id, mergeMethod: $method, commitHeadline: $headline, commitBody: $body, expectedHeadOid: $head }) {
          pullRequest { merged }
        }
      }
    """
}

// MARK: - Answers

/// GraphQL's `{ nodes: [...] }` around every list.
struct Nodes<Node: Decodable & Sendable>: Decodable, Sendable {
    let nodes: [Node]
}

/// A node that may be something else than asked for: a search for pull requests answers `{}` for an issue.
struct Lenient<Value: Decodable & Sendable>: Decodable, Sendable {
    let value: Value?

    init(from decoder: Decoder) throws { value = try? Value(from: decoder) }
}

struct RawActor: Decodable, Sendable {
    let login: String
    let avatarUrl: String?
    let name: String?

    var person: Person { Person(login: login, name: name, avatarUrl: avatarUrl) }
}

extension Optional where Wrapped == RawActor {
    /// A deleted account is GitHub's "ghost".
    var person: Person { self?.person ?? Person(login: "ghost", name: nil, avatarUrl: nil) }
}

struct RawContext: Decodable, Sendable {
    struct Suite: Decodable, Sendable {
        struct Run: Decodable, Sendable {
            struct Workflow: Decodable, Sendable { let name: String }

            let databaseId: Int
            let runNumber: Int?
            let workflow: Workflow?
        }

        let workflowRun: Run?
    }

    let typename: String
    // A check run
    let databaseId: Int?
    let name: String?
    let status: String?
    let conclusion: String?
    let startedAt: String?
    let completedAt: String?
    let detailsUrl: String?
    let checkSuite: Suite?
    // A commit status
    let context: String?
    let state: String?
    let targetUrl: String?
    let createdAt: String?

    private enum CodingKeys: String, CodingKey {
        case typename = "__typename"
        case databaseId, name, status, conclusion, startedAt, completedAt, detailsUrl, checkSuite, context, state, targetUrl, createdAt
    }
}

/// The head commit's checks, as `commits(last: 1)` nests them.
struct RawHead: Decodable, Sendable {
    struct Node: Decodable, Sendable {
        struct Commit: Decodable, Sendable {
            struct Rollup: Decodable, Sendable { let contexts: Nodes<RawContext> }

            let statusCheckRollup: Rollup?
        }

        let commit: Commit
    }

    let nodes: [Node]

    var checks: [CheckContext] { GitHubMapping.contexts(nodes.first?.commit.statusCheckRollup?.contexts.nodes ?? []) }
}

struct RawPullRequest: Decodable, Sendable {
    struct Repository: Decodable, Sendable {
        struct Owner: Decodable, Sendable { let login: String }
        struct Branch: Decodable, Sendable { let name: String }

        let name: String
        let owner: Owner
        let defaultBranchRef: Branch?
    }

    struct ReviewRequest: Decodable, Sendable {
        struct Reviewer: Decodable, Sendable {
            let typename: String
            let login: String?
            let slug: String?
            let name: String?
            let avatarUrl: String?

            private enum CodingKeys: String, CodingKey {
                case typename = "__typename"
                case login, slug, name, avatarUrl
            }
        }

        let requestedReviewer: Reviewer?
    }

    /// A review request as the timeline has it: who was asked, and when.
    struct RequestEvent: Decodable, Sendable {
        let createdAt: String
        let requestedReviewer: ReviewRequest.Reviewer?
    }

    struct LatestReview: Decodable, Sendable {
        struct Commit: Decodable, Sendable { let oid: String }

        let state: String
        let submittedAt: String?
        let author: RawActor?
        let commit: Commit?
    }

    struct RecentCommit: Decodable, Sendable {
        struct Commit: Decodable, Sendable { let oid: String }

        let commit: Commit
    }

    struct AutoMerge: Decodable, Sendable { let enabledAt: String? }

    let id: String
    let number: Int
    let title: String
    let body: String?
    let url: String
    let isDraft: Bool
    let state: String
    let createdAt: String
    let updatedAt: String
    let mergedAt: String?
    let additions: Int
    let deletions: Int
    let changedFiles: Int
    let headRefName: String
    let baseRefName: String
    let headRefOid: String
    let isCrossRepository: Bool
    let mergeable: String
    let reviewDecision: String?
    let autoMergeRequest: AutoMerge?
    let author: RawActor?
    let repository: Repository
    let labels: Nodes<PrLabel>?
    let reviewRequests: Nodes<ReviewRequest>?
    /// The newest review requests of the timeline; an answer without them still reads.
    let requested: Nodes<Lenient<RequestEvent>>?
    let latestReviews: Nodes<LatestReview>?
    let head: RawHead
    let recent: Nodes<RecentCommit>
}

struct FocusPage: Decodable, Sendable {
    struct Viewer: Decodable, Sendable { let login: String }
    struct PageInfo: Decodable, Sendable {
        let hasNextPage: Bool
        let endCursor: String?
    }
    struct Found: Decodable, Sendable {
        let pageInfo: PageInfo
        let nodes: [Lenient<RawPullRequest>]
    }

    let viewer: Viewer
    let found: Found
}

struct RawViewer: Decodable, Sendable {
    let viewer: RawActor
}

struct RawTeams: Decodable, Sendable {
    struct Team: Decodable, Sendable { let slug: String }
    struct Organization: Decodable, Sendable { let teams: Nodes<Team> }
    struct Viewer: Decodable, Sendable { let organizations: Nodes<Organization> }

    let viewer: Viewer

    var slugs: [String] { viewer.organizations.nodes.flatMap { $0.teams.nodes.map(\.slug) } }
}

struct RawReview: Decodable, Sendable {
    let state: String
    let submittedAt: String?
    let body: String
    let author: RawActor?
}

struct RawDetail: Decodable, Sendable {
    /// A pull request with what only its own page reads; the shared fields decode from the same object.
    struct PullRequest: Decodable, Sendable {
        struct Commits: Decodable, Sendable { let totalCount: Int }

        let shared: RawPullRequest
        let commits: Commits
        let reviews: Nodes<RawReview>
        let reviewRequestsFull: Nodes<RawPullRequest.ReviewRequest>

        private enum CodingKeys: String, CodingKey { case commits, reviews, reviewRequestsFull }

        init(from decoder: Decoder) throws {
            shared = try RawPullRequest(from: decoder)
            let container = try decoder.container(keyedBy: CodingKeys.self)
            commits = try container.decode(Commits.self, forKey: .commits)
            reviews = try container.decode(Nodes<RawReview>.self, forKey: .reviews)
            reviewRequestsFull = try container.decode(Nodes<RawPullRequest.ReviewRequest>.self, forKey: .reviewRequestsFull)
        }
    }

    struct Repository: Decodable, Sendable {
        let squashMergeAllowed: Bool
        let mergeCommitAllowed: Bool
        let rebaseMergeAllowed: Bool
        let deleteBranchOnMerge: Bool
        let viewerPermission: String?
        let viewerDefaultMergeMethod: String
        let pullRequest: PullRequest?
    }

    let repository: Repository?
}

struct RawHeadAnswer: Decodable, Sendable {
    struct PullRequest: Decodable, Sendable {
        let id: String
        let headRefOid: String
        let state: String
        let headRefName: String
        let isCrossRepository: Bool
        let head: RawHead
    }

    struct Repository: Decodable, Sendable { let pullRequest: PullRequest? }

    let repository: Repository?
}

struct RawConversation: Decodable, Sendable {
    struct Reactions: Decodable, Sendable {
        struct Reactors: Decodable, Sendable { let totalCount: Int }

        let content: String
        let reactors: Reactors
    }

    struct Comment: Decodable, Sendable {
        let id: String
        let body: String
        let createdAt: String
        let diffHunk: String?
        let author: RawActor?
        let reactionGroups: [Reactions]?
    }

    struct Thread: Decodable, Sendable {
        let id: String
        let path: String?
        let line: Int?
        let originalLine: Int?
        let startLine: Int?
        let diffSide: String?
        let isOutdated: Bool?
        let isResolved: Bool
        let comments: Nodes<Comment>
    }

    struct PullRequest: Decodable, Sendable {
        let reviewThreads: Nodes<Thread>
        let comments: Nodes<Comment>
    }

    struct Repository: Decodable, Sendable { let pullRequest: PullRequest? }

    let repository: Repository?
}

// MARK: - Mapping

enum GitHubMapping {
    private static let conclusions: [String: CheckState] = [
        "success": .success, "failure": .failure, "timed_out": .failure, "startup_failure": .failure,
        "cancelled": .neutral, "action_required": .neutral, "stale": .neutral, "neutral": .neutral, "skipped": .skipped,
    ]
    private static let statusStates: [String: CheckState] = ["success": .success, "failure": .failure, "error": .failure, "pending": .pending, "expected": .pending]
    private static let reviewStates: [String: PrLatestReview.State] = [
        "APPROVED": .approved, "CHANGES_REQUESTED": .changesRequested, "COMMENTED": .commented, "DISMISSED": .dismissed, "PENDING": .pending,
    ]

    static func contexts(_ nodes: [RawContext]) -> [CheckContext] {
        let contexts = nodes.map { node -> CheckContext in
            if node.typename == "StatusContext" {
                let state = (node.state ?? "").lowercased()
                return CheckContext(
                    id: 0, kind: .status, name: node.context ?? "status", workflow: nil, runId: nil, runNumber: nil,
                    state: statusStates[state] ?? .pending, conclusion: state.isEmpty ? nil : state,
                    startedAt: node.createdAt, completedAt: nil, url: node.targetUrl ?? ""
                )
            }
            let conclusion = node.conclusion?.lowercased()
            let done = (node.status ?? "").uppercased() == "COMPLETED"
            return CheckContext(
                id: node.databaseId ?? 0, kind: .check, name: node.name ?? "check", workflow: node.checkSuite?.workflowRun?.workflow?.name,
                runId: node.checkSuite?.workflowRun?.databaseId, runNumber: node.checkSuite?.workflowRun?.runNumber,
                state: done ? (conclusions[conclusion ?? ""] ?? .neutral) : .pending, conclusion: conclusion,
                startedAt: node.startedAt, completedAt: node.completedAt, url: node.detailsUrl ?? ""
            )
        }
        return latestAttempts(contexts)
    }

    /// A rerun leaves the old attempt in the rollup; keep the newest per check (the desktop's latestCheckContexts).
    private static func latestAttempts(_ contexts: [CheckContext]) -> [CheckContext] {
        struct Identity: Hashable {
            let kind: CheckContext.Kind
            let name: String
            let workflow: String
        }
        var order: [Identity] = []
        var latest: [Identity: CheckContext] = [:]
        for context in contexts {
            let identity = Identity(kind: context.kind, name: context.name, workflow: context.workflow ?? "")
            guard let prior = latest[identity] else {
                order.append(identity)
                latest[identity] = context
                continue
            }
            let (started, priorStarted) = (context.startedAt ?? "", prior.startedAt ?? "")
            if started > priorStarted || (context.startedAt == prior.startedAt && context.id > prior.id) { latest[identity] = context }
        }
        return order.compactMap { latest[$0] }
    }

    static func record(_ raw: RawPullRequest, account: String) -> PrRecord {
        let requests = raw.reviewRequests?.nodes.compactMap(\.requestedReviewer) ?? []
        return PrRecord(
            account: account,
            nodeId: raw.id,
            owner: raw.repository.owner.login,
            repo: raw.repository.name,
            number: raw.number,
            title: raw.title,
            body: raw.body ?? "",
            url: raw.url,
            author: raw.author.person,
            isDraft: raw.isDraft,
            state: raw.state == "MERGED" ? .merged : raw.state == "CLOSED" ? .closed : .open,
            headRef: raw.headRefName,
            baseRef: raw.baseRefName,
            headSha: raw.headRefOid,
            defaultBranch: raw.repository.defaultBranchRef?.name,
            isCrossRepository: raw.isCrossRepository,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
            mergedAt: raw.mergedAt,
            additions: raw.additions,
            deletions: raw.deletions,
            changedFiles: raw.changedFiles,
            labels: raw.labels?.nodes ?? [],
            mergeable: raw.mergeable == "MERGEABLE" ? .mergeable : raw.mergeable == "CONFLICTING" ? .conflicting : .unknown,
            autoMerge: raw.autoMergeRequest != nil,
            reviewDecision: raw.reviewDecision == "APPROVED" ? .approved : raw.reviewDecision == "CHANGES_REQUESTED" ? .changesRequested
                : raw.reviewDecision == "REVIEW_REQUIRED" ? .reviewRequired : nil,
            requestedReviewers: requests.filter { $0.typename == "User" }.compactMap(\.login).filter { !$0.isEmpty },
            requestedTeams: requests.filter { $0.typename == "Team" }.compactMap(\.slug).filter { !$0.isEmpty },
            latestReviews: (raw.latestReviews?.nodes ?? []).compactMap { review in
                guard let author = review.author, let state = reviewStates[review.state] else { return nil }
                return ReviewRecord(login: author.login, state: state, submittedAt: review.submittedAt, commitSha: review.commit?.oid)
            },
            checks: raw.head.checks,
            recentCommits: raw.recent.nodes.map(\.commit.oid),
            reviewRequestTimes: requestTimes(raw.requested?.nodes.compactMap(\.value) ?? [])
        )
    }

    /// When each reviewer was last asked, by `PrRecord.reviewerKey`.
    static func requestTimes(_ events: [RawPullRequest.RequestEvent]) -> [String: String] {
        var times: [String: String] = [:]
        for event in events {
            guard let reviewer = event.requestedReviewer else { continue }
            let key = reviewer.typename == "Team" ? reviewer.slug.map(PrRecord.reviewerKey(team:)) : reviewer.login.map(PrRecord.reviewerKey(login:))
            guard let key, event.createdAt > times[key, default: ""] else { continue }
            times[key] = event.createdAt
        }
        return times
    }

    static func reviews(_ nodes: [RawReview]) -> [PrReview] {
        nodes.compactMap { review in
            guard let state = reviewStates[review.state], let at = review.submittedAt else { return nil }
            return PrReview(author: review.author.person, state: PrReviewState(rawValue: state.rawValue) ?? .commented, at: at, body: review.body)
        }
    }

    /// Who is still asked to review, people and teams alike, as the page lists them.
    static func requestedReviewers(_ nodes: [RawPullRequest.ReviewRequest]) -> [Person] {
        nodes.compactMap(\.requestedReviewer).map { who in
            who.typename == "Team"
                ? Person(login: who.slug ?? "team", name: who.name, avatarUrl: who.avatarUrl)
                : Person(login: who.login ?? "ghost", name: who.name, avatarUrl: who.avatarUrl)
        }
    }

    static func conversation(_ pullRequest: RawConversation.PullRequest) -> PrConversation {
        PrConversation(
            threads: pullRequest.reviewThreads.nodes.map { thread in
                ReviewThread(
                    id: thread.id, path: thread.path, line: thread.line ?? thread.originalLine,
                    diffHunk: lastHunkLines(thread.comments.nodes.first?.diffHunk), isResolved: thread.isResolved,
                    comments: thread.comments.nodes.map(comment),
                    side: thread.diffSide.flatMap(DiffSide.init(rawValue:)), startLine: thread.startLine, isOutdated: thread.isOutdated
                )
            },
            comments: pullRequest.comments.nodes.map(comment)
        )
    }

    private static func comment(_ raw: RawConversation.Comment) -> PrComment {
        PrComment(
            id: raw.id, author: raw.author.person, body: raw.body, at: raw.createdAt,
            reactions: (raw.reactionGroups ?? []).filter { $0.reactors.totalCount > 0 }.map { Reaction(content: $0.content.lowercased(), count: $0.reactors.totalCount) }
        )
    }

    /// The few diff lines a thread was left on: the hunk header and the last six lines of the hunk.
    private static func lastHunkLines(_ hunk: String?) -> String? {
        guard let hunk, !hunk.isEmpty else { return nil }
        let lines = hunk.components(separatedBy: "\n")
        return lines.count <= 7 ? hunk : ([lines[0]] + lines.suffix(6)).joined(separator: "\n")
    }

    /// Images in the description, from Markdown and from the `<img>` tags GitHub's editor writes.
    static func proofImages(_ body: String) -> [ProofImage] {
        var images: [ProofImage] = []
        for match in body.matches(of: #/!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/#) {
            images.append(ProofImage(url: String(match.2), alt: String(match.1)))
        }
        for tag in body.matches(of: #/<img\b[^>]*>/#.ignoresCase()) {
            guard let source = tag.0.firstMatch(of: #/\bsrc=["']([^"']+)["']/#.ignoresCase()) else { continue }
            let alt = tag.0.firstMatch(of: #/\balt=["']([^"']*)["']/#.ignoresCase()).map { String($0.1) } ?? ""
            images.append(ProofImage(url: String(source.1), alt: alt))
        }
        var seen: Set<String> = []
        return images.filter { $0.url.hasPrefix("https://") && seen.insert($0.url).inserted }
    }
}
