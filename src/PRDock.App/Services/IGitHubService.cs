using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IGitHubService
{
    Task<IReadOnlyList<PullRequest>> GetOpenPullRequestsAsync(string owner, string repo, CancellationToken ct = default);
    Task<PullRequest> GetPullRequestAsync(string owner, string repo, int prNumber, CancellationToken ct = default);
    Task<IReadOnlyList<ClaudeReviewComment>> GetPullRequestReviewCommentsAsync(string owner, string repo, int prNumber, string botUsername, CancellationToken ct = default);
    Task<IReadOnlyList<PullRequestCommit>> GetPullRequestCommitsAsync(string owner, string repo, int prNumber, CancellationToken ct = default);
    Task<IReadOnlyList<PullRequestFileChange>> GetPullRequestFilesAsync(string owner, string repo, int prNumber, CancellationToken ct = default);
    Task<IReadOnlyList<ClaudeReviewComment>> GetAllPullRequestCommentsAsync(string owner, string repo, int prNumber, CancellationToken ct = default);
    Task SubmitReviewAsync(string owner, string repo, int prNumber, string reviewEvent, string? body = null, CancellationToken ct = default);
    Task PostCommentAsync(string owner, string repo, int prNumber, string body, CancellationToken ct = default);
}
