import Foundation

// Swift mirror of the GitHub and CI parts of shared/src/borgdock.ts: Focus, pull requests, reviews and related
// CI failures. Names and optionality follow the TypeScript types; timestamps stay ISO strings. `CheckState` and
// `Tone` live in ios/Shared. Change both files together.

// MARK: - Focus and pull requests

enum FocusBucket: String, ResilientEnum, CaseIterable {
    case you, wait, ready, stale
    static let fallback = FocusBucket.wait
}

struct Person: Codable, Hashable, Sendable {
    let login: String
    let name: String?
    let avatarUrl: String?

    var displayName: String { name ?? login }
    var firstName: String { displayName.split(separator: " ").first.map(String.init) ?? displayName }
}

struct PrLabel: Codable, Hashable, Sendable {
    let name: String
    let color: String
}

struct CheckSummary: Codable, Hashable, Sendable {
    let total: Int
    let passed: Int
    let failed: Int
    let pending: Int
    let skipped: Int
    /// One per check for the check bar, failures first; at most 12.
    let segments: [CheckState]
}

enum PrReasonIcon: String, ResilientEnum {
    case review, rerun, comment, approved, failing, clock, conflict, merge
    static let fallback = PrReasonIcon.clock
}

/// Why a pull request is in its bucket: "Sanne asked for your review".
struct PrReason: Codable, Hashable, Sendable {
    let text: String
    let tone: Tone
    let icon: PrReasonIcon
}

enum PrState: String, ResilientEnum {
    case open, merged, closed
    static let fallback = PrState.open
}

enum ReviewDecision: String, ResilientEnum {
    case approved
    case changesRequested = "changes_requested"
    case reviewRequired = "review_required"
    static let fallback = ReviewDecision.reviewRequired
}

enum Mergeable: String, ResilientEnum {
    case mergeable, conflicting, unknown
    static let fallback = Mergeable.unknown
}

struct PrSummary: Codable, Hashable, Sendable, Identifiable {
    let owner: String
    let repo: String
    let number: Int
    /// `owner/repo#number`, the key everywhere.
    let key: String
    /// The GitHub account BorgDock read it with.
    let account: String
    let title: String
    let url: String
    let author: Person
    let isMine: Bool
    let isDraft: Bool
    let state: PrState
    let headRef: String
    let baseRef: String
    let headSha: String
    let createdAt: String
    let updatedAt: String
    let mergedAt: String?
    let additions: Int
    let deletions: Int
    let changedFiles: Int
    let labels: [PrLabel]
    let checks: CheckSummary
    let reviewDecision: ReviewDecision?
    let approvedBy: [String]
    let mergeable: Mergeable
    let bucket: FocusBucket
    let reason: PrReason
    /// AB# numbers in the title, body or branch.
    let workItemIds: [Int]
    let snoozedUntil: String?
    let autoMerge: Bool
    /// The head commit of your last review, for re-reviews; null if you never reviewed it.
    let reviewedHeadSha: String?

    var id: String { key }
    var prKey: PrKey { PrKey(owner: owner, repo: repo, number: number) }
}

struct AgentWaiting: Codable, Hashable, Sendable, Identifiable {
    let itemId: Int?
    let threadId: String
    let title: String
    let detail: String
    let tone: Tone

    var id: String { threadId }
}

/// GET /api/focus. `accounts` (GithubAccountStatus[]) is left to the platform models.
struct Focus: Codable, Hashable, Sendable {
    let generatedAt: String
    let counts: [String: Int]
    /// Open pull requests that involve you, in bucket order, then most urgent first.
    let pullRequests: [PrSummary]
    let agentsWaiting: [AgentWaiting]

    func count(_ bucket: FocusBucket) -> Int { counts[bucket.rawValue] ?? 0 }
}

// MARK: - Checks

struct AlsoOnBase: Codable, Hashable, Sendable {
    let since: String?
    let claimedBy: Person?
}

struct CheckFailure: Codable, Hashable, Sendable {
    let step: String?
    /// One line: the assertion or error.
    let summary: String?
    /// A few lines of the log around it, sanitised.
    let snippet: String?
    /// file:line when the log names one.
    let location: String?
    let newInThisPr: Bool
    /// Set when the same failure is red on the base branch too.
    let alsoOnBase: AlsoOnBase?
    let groupId: String?
}

struct CheckRun: Codable, Hashable, Sendable, Identifiable {
    let id: Int
    let name: String
    let workflow: String?
    let state: CheckState
    let startedAt: String?
    let completedAt: String?
    let durationSeconds: Int?
    let url: String
    let runId: Int?
    let jobId: Int?
    /// Only for failed checks; null while BorgDock hasn't read the log yet.
    let failure: CheckFailure?
}

enum PrReviewState: String, ResilientEnum {
    case approved
    case changesRequested = "changes_requested"
    case commented, dismissed, pending
    static let fallback = PrReviewState.commented
}

struct PrReview: Codable, Hashable, Sendable {
    let author: Person
    let state: PrReviewState
    let at: String
    let body: String
}

enum MergeMethod: String, ResilientEnum, CaseIterable {
    case squash, merge, rebase
    static let fallback = MergeMethod.squash
}

struct ProofImage: Codable, Hashable, Sendable {
    let url: String
    let alt: String
}

/// GET /api/prs/:owner/:repo/:number. `PrSummary & {…}` in TypeScript: the summary decodes from the same object.
@dynamicMemberLookup
struct PrDetail: Codable, Hashable, Sendable {
    let summary: PrSummary
    /// Markdown.
    let body: String
    let commits: Int
    let reviews: [PrReview]
    let requestedReviewers: [Person]
    let requestedFromYou: Bool
    let checkRuns: [CheckRun]
    let proofImages: [ProofImage]
    let allowedMergeMethods: [MergeMethod]
    let defaultMergeMethod: MergeMethod
    let deleteBranchOnMerge: Bool
    let viewerCanMerge: Bool
    let workItems: [WorkItemSummary]
    /// T3 threads working on this branch.
    let threads: [ThreadSummary]

    subscript<T>(dynamicMember keyPath: KeyPath<PrSummary, T>) -> T { summary[keyPath: keyPath] }

    private enum CodingKeys: String, CodingKey {
        case body, commits, reviews, requestedReviewers, requestedFromYou, checkRuns, proofImages, allowedMergeMethods
        case defaultMergeMethod, deleteBranchOnMerge, viewerCanMerge, workItems, threads
    }

    init(from decoder: Decoder) throws {
        summary = try PrSummary(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        body = try container.decode(String.self, forKey: .body)
        commits = try container.decode(Int.self, forKey: .commits)
        reviews = try container.decode([PrReview].self, forKey: .reviews)
        requestedReviewers = try container.decode([Person].self, forKey: .requestedReviewers)
        requestedFromYou = try container.decode(Bool.self, forKey: .requestedFromYou)
        checkRuns = try container.decode([CheckRun].self, forKey: .checkRuns)
        proofImages = try container.decode([ProofImage].self, forKey: .proofImages)
        allowedMergeMethods = try container.decode([MergeMethod].self, forKey: .allowedMergeMethods)
        defaultMergeMethod = try container.decode(MergeMethod.self, forKey: .defaultMergeMethod)
        deleteBranchOnMerge = try container.decode(Bool.self, forKey: .deleteBranchOnMerge)
        viewerCanMerge = try container.decode(Bool.self, forKey: .viewerCanMerge)
        workItems = try container.decode([WorkItemSummary].self, forKey: .workItems)
        threads = try container.decode([ThreadSummary].self, forKey: .threads)
    }

    func encode(to encoder: Encoder) throws {
        try summary.encode(to: encoder)
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(body, forKey: .body)
        try container.encode(commits, forKey: .commits)
        try container.encode(reviews, forKey: .reviews)
        try container.encode(requestedReviewers, forKey: .requestedReviewers)
        try container.encode(requestedFromYou, forKey: .requestedFromYou)
        try container.encode(checkRuns, forKey: .checkRuns)
        try container.encode(proofImages, forKey: .proofImages)
        try container.encode(allowedMergeMethods, forKey: .allowedMergeMethods)
        try container.encode(defaultMergeMethod, forKey: .defaultMergeMethod)
        try container.encode(deleteBranchOnMerge, forKey: .deleteBranchOnMerge)
        try container.encode(viewerCanMerge, forKey: .viewerCanMerge)
        try container.encode(workItems, forKey: .workItems)
        try container.encode(threads, forKey: .threads)
    }
}

enum PrFileStatus: String, ResilientEnum {
    case added, modified, removed, renamed
    static let fallback = PrFileStatus.modified
}

struct PrFile: Codable, Hashable, Sendable, Identifiable {
    let path: String
    let previousPath: String?
    let status: PrFileStatus
    let additions: Int
    let deletions: Int
    /// GitHub's unified patch for the file; null for binary or very large files.
    let patch: String?
    /// Touched by a commit after your last review.
    let changedSinceReview: Bool

    var id: String { path }
}

/// GET /api/prs/:owner/:repo/:number/files
struct PrFiles: Codable, Hashable, Sendable {
    let headSha: String
    let reviewedHeadSha: String?
    let files: [PrFile]
}

struct Reaction: Codable, Hashable, Sendable {
    let content: String
    let count: Int
}

struct PrComment: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let author: Person
    let body: String
    let at: String
    let reactions: [Reaction]
}

struct ReviewThread: Codable, Hashable, Sendable, Identifiable {
    let id: String
    let path: String?
    let line: Int?
    /// The few diff lines the thread was left on.
    let diffHunk: String?
    let isResolved: Bool
    let comments: [PrComment]
}

/// GET /api/prs/:owner/:repo/:number/comments
struct PrConversation: Codable, Hashable, Sendable {
    let threads: [ReviewThread]
    let comments: [PrComment]
}

/// POST /api/prs/:owner/:repo/:number/comments: a top-level comment, or a reply when threadId is set.
struct PostCommentRequest: Codable, Hashable, Sendable {
    let body: String
    var threadId: String?
}

enum ReviewEvent: String, Codable, Hashable, Sendable {
    case approve = "APPROVE"
    case requestChanges = "REQUEST_CHANGES"
    case comment = "COMMENT"
}

enum DiffSide: String, Codable, Hashable, Sendable {
    case right = "RIGHT"
    case left = "LEFT"
}

struct ReviewLineComment: Codable, Hashable, Sendable {
    let path: String
    let line: Int
    let side: DiffSide
    let body: String
}

/// POST /api/prs/:owner/:repo/:number/reviews (signed). 409 when headSha moved on.
struct SubmitReviewRequest: Codable, Hashable, Sendable {
    let event: ReviewEvent
    let body: String
    let headSha: String
    let comments: [ReviewLineComment]
}

struct SubmitReviewResponse: Codable, Hashable, Sendable {
    let ok: Bool
    let reviewId: String?

    private enum CodingKeys: String, CodingKey { case ok, reviewId }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ok = try container.decode(Bool.self, forKey: .ok)
        // GitHub's review ids are numbers; accept either.
        if let text = try? container.decodeIfPresent(String.self, forKey: .reviewId) {
            reviewId = text
        } else {
            reviewId = (try? container.decodeIfPresent(Int.self, forKey: .reviewId)).flatMap { $0.map(String.init) }
        }
    }
}

/// POST /api/prs/:owner/:repo/:number/merge (signed). 409 when headSha moved on.
struct MergeRequest: Codable, Hashable, Sendable {
    let method: MergeMethod
    let commitTitle: String
    let commitMessage: String
    let deleteBranch: Bool
    let headSha: String
}

/// `autoMerge` true: checks were still running, so GitHub merges when they pass.
struct MergeResponse: Codable, Hashable, Sendable {
    let merged: Bool
    let autoMerge: Bool
    let message: String
}

struct RerunResponse: Codable, Hashable, Sendable {
    let reruns: Int
}

/// POST /api/prs/:owner/:repo/:number/snooze; until null clears it.
struct SnoozeRequest: Codable, Hashable, Sendable {
    let until: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(until, forKey: .until)
    }

    private enum CodingKeys: String, CodingKey { case until }
}

// MARK: - Related CI failures

struct CiSuspect: Codable, Hashable, Sendable {
    let sha: String
    let message: String
}

struct CiBranchHit: Codable, Hashable, Sendable, Identifiable {
    let branch: String
    /// Null for the base branch.
    let prKey: String?
    let title: String?
    let failures: Int
    let sha: String
    /// For the base branch: the first red commit, the likely cause.
    let suspect: CiSuspect?

    var id: String { prKey ?? branch }
}

struct CiClaim: Codable, Hashable, Sendable {
    let by: Person
    let at: String
    let note: String?
}

struct CiFailureGroup: Codable, Hashable, Sendable, Identifiable {
    let id: String
    /// "e2e / checkout › keeps the basket on timeout"
    let title: String
    /// The assertion or error lines.
    let signal: String
    let location: String?
    let firstFailedAt: String
    let lastFailedAt: String
    let failures: Int
    let branches: [CiBranchHit]
    let claim: CiClaim?
}

/// POST /api/ci/groups/:id/claim
struct ClaimRequest: Codable, Hashable, Sendable {
    let note: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(note, forKey: .note)
    }

    private enum CodingKeys: String, CodingKey { case note }
}
