import Foundation

/// What the pull request screens ask of whoever reads GitHub for them: the BorgDock server (`APIClient`), or GitHub
/// itself from this phone (`GitHubDirect`).
protocol PullRequestBackend: Sendable {
    /// The open pull requests. `fresh` reads GitHub now instead of answering from the last poll (pull to refresh).
    func focus(fresh: Bool) async throws -> Focus
    /// Merged in the last week, in the repositories read and where it involves you: what BorgDock Review's search
    /// shows beside the open ones. The server keeps no such list and answers none.
    func mergedThisWeek() async throws -> [PrSummary]
    func pullRequest(_ key: PrKey) async throws -> PrDetail
    func pullRequestFiles(_ key: PrKey) async throws -> PrFiles
    /// What changed between the commit you reviewed and the head: a re-review's own, shorter diff. Nil when there is
    /// none to give: you never reviewed it, nothing was pushed since, or a force-push dropped the commit you reviewed.
    func pullRequestFilesSinceReview(_ key: PrKey) async throws -> PrFiles?
    func conversation(_ key: PrKey) async throws -> PrConversation
    func postComment(_ key: PrKey, _ request: PostCommentRequest) async throws -> OKResponse
    func resolveThread(_ key: PrKey, threadId: String) async throws -> OKResponse
    func submitReview(_ key: PrKey, _ request: SubmitReviewRequest) async throws -> SubmitReviewResponse
    func merge(_ key: PrKey, _ request: MergeRequest, bypass: Bool) async throws -> MergeResponse
    func rerunFailed(_ key: PrKey) async throws -> RerunResponse
    func snooze(_ key: PrKey, until: Date?) async throws -> OKResponse
    func repositories() async throws -> PrRepositories
    func setRepositoryPreferences(_ preferences: PrRepositoryPreferences) async throws -> PrRepositories
    func ciGroups() async throws -> [CiFailureGroup]
    func ciGroup(_ id: String) async throws -> CiFailureGroup
    func claimCiGroup(_ id: String, note: String?) async throws -> CiFailureGroup
    func releaseCiGroup(_ id: String) async throws -> CiFailureGroup
}

/// What the work item page asks of whoever reads Azure DevOps for it: the BorgDock server, or Azure DevOps itself.
protocol WorkItemBackend: Sendable {
    func item(_ id: Int) async throws -> ItemDetail
    /// Posts a comment on the item as you. Markdown; it never changes a state.
    func postItemComment(itemId: Int, text: String) async throws -> ItemComment
    /// Where an image or attachment in an item's text loads from.
    func resolve(_ pathOrURL: String) -> URL?
}

extension PullRequestBackend {
    func merge(_ key: PrKey, _ request: MergeRequest) async throws -> MergeResponse {
        try await merge(key, request, bypass: false)
    }

    /// The server has no such read; its re-reviews mark the files that changed and show the whole diff.
    func pullRequestFilesSinceReview(_ key: PrKey) async throws -> PrFiles? { nil }
}
