using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed class GitHubService : IGitHubService
{
    private static readonly JsonSerializerOptions GitHubJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IGitHubAuthService _authService;
    private readonly ISettingsService _settingsService;
    private readonly ILogger<GitHubService> _logger;

    public GitHubService(
        IHttpClientFactory httpClientFactory,
        IGitHubAuthService authService,
        ISettingsService settingsService,
        ILogger<GitHubService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _authService = authService;
        _settingsService = settingsService;
        _logger = logger;
    }

    public async Task<IReadOnlyList<PullRequest>> GetOpenPullRequestsAsync(
        string owner, string repo, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);

        var url = $"repos/{owner}/{repo}/pulls?state=open";
        _logger.LogInformation("Fetching open PRs for {Owner}/{Repo} — GET {Url}", owner, repo, url);

        var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        var dtos = await response.Content.ReadFromJsonAsync<List<GitHubPullRequestDto>>(GitHubJsonOptions, ct)
            ?? [];

        var pullRequests = new List<PullRequest>(dtos.Count);

        foreach (var dto in dtos)
        {
            var pr = MapToPullRequest(dto, owner, repo);

            var reviews = await FetchReviewsAsync(client, owner, repo, dto.Number, ct);
            pr.ReviewStatus = AggregateReviewStatus(reviews);

            pullRequests.Add(pr);
        }

        _logger.LogInformation("Fetched {Count} open PRs for {Owner}/{Repo}", pullRequests.Count, owner, repo);
        return pullRequests;
    }

    public async Task<PullRequest> GetPullRequestAsync(
        string owner, string repo, int prNumber, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var url = $"repos/{owner}/{repo}/pulls/{prNumber}";
        var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        var dto = await response.Content.ReadFromJsonAsync<GitHubPullRequestDto>(GitHubJsonOptions, ct)
            ?? throw new InvalidOperationException("Failed to deserialize PR");

        return MapToPullRequest(dto, owner, repo);
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(CancellationToken ct = default)
    {
        var client = _httpClientFactory.CreateClient("GitHub");

        var token = await _authService.GetTokenAsync(ct);
        if (!string.IsNullOrEmpty(token))
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            _logger.LogDebug("Auth token set ({Length} chars)", token.Length);
        }
        else
        {
            _logger.LogWarning("No auth token available — API calls will be unauthenticated");
        }

        return client;
    }

    private async Task<List<GitHubReviewDto>> FetchReviewsAsync(
        HttpClient client, string owner, string repo, int prNumber, CancellationToken ct)
    {
        try
        {
            var response = await client.GetAsync($"repos/{owner}/{repo}/pulls/{prNumber}/reviews", ct);
            response.EnsureSuccessStatusCode();

            return await response.Content.ReadFromJsonAsync<List<GitHubReviewDto>>(GitHubJsonOptions, ct)
                ?? [];
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Failed to fetch reviews for PR #{Number} in {Owner}/{Repo}", prNumber, owner, repo);
            return [];
        }
    }

    public async Task<IReadOnlyList<ClaudeReviewComment>> GetPullRequestReviewCommentsAsync(
        string owner, string repo, int prNumber, string botUsername, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);

        // Fetch both review comments (inline on diffs) and issue comments (top-level)
        var comments = new List<ClaudeReviewComment>();

        // 1. PR review comments (inline code comments)
        try
        {
            var url = $"repos/{owner}/{repo}/pulls/{prNumber}/comments";
            _logger.LogDebug("Fetching PR review comments from {Url}", url);

            var response = await client.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            var dtos = await response.Content.ReadFromJsonAsync<List<GitHubPrReviewCommentDto>>(GitHubJsonOptions, ct) ?? [];

            foreach (var dto in dtos)
            {
                var login = dto.User?.Login ?? "";
                if (!login.Contains(botUsername, StringComparison.OrdinalIgnoreCase))
                    continue;

                var comment = new ClaudeReviewComment
                {
                    Id = dto.Id.ToString(),
                    Author = login,
                    Body = dto.Body ?? "",
                    FilePath = dto.Path,
                    LineNumber = dto.Line ?? dto.OriginalLine,
                    CreatedAt = dto.CreatedAt,
                    HtmlUrl = dto.HtmlUrl ?? ""
                };
                comment.Severity = ClaudeReviewComment.DetectSeverity(comment.Body);
                comments.Add(comment);
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Failed to fetch PR review comments for {Owner}/{Repo}#{Number}", owner, repo, prNumber);
        }

        // 2. Issue comments (top-level PR comments)
        try
        {
            var url = $"repos/{owner}/{repo}/issues/{prNumber}/comments";
            _logger.LogDebug("Fetching issue comments from {Url}", url);

            var response = await client.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();

            var dtos = await response.Content.ReadFromJsonAsync<List<GitHubIssueCommentDto>>(GitHubJsonOptions, ct) ?? [];

            foreach (var dto in dtos)
            {
                var login = dto.User?.Login ?? "";
                if (!login.Contains(botUsername, StringComparison.OrdinalIgnoreCase))
                    continue;

                var comment = new ClaudeReviewComment
                {
                    Id = dto.Id.ToString(),
                    Author = login,
                    Body = dto.Body ?? "",
                    CreatedAt = dto.CreatedAt,
                    HtmlUrl = dto.HtmlUrl ?? ""
                };

                // Split structured reviews (with Issues/Positives sections) into individual items
                var splitItems = ClaudeReviewComment.SplitStructuredReview(comment);
                if (splitItems.Count > 1)
                {
                    comments.AddRange(splitItems);
                }
                else
                {
                    comment.Severity = ClaudeReviewComment.DetectSeverity(comment.Body);
                    comments.Add(comment);
                }
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Failed to fetch issue comments for {Owner}/{Repo}#{Number}", owner, repo, prNumber);
        }

        _logger.LogDebug("Found {Count} Claude review comments for PR #{Number}", comments.Count, prNumber);
        return comments;
    }

    public async Task<IReadOnlyList<PullRequestCommit>> GetPullRequestCommitsAsync(
        string owner, string repo, int prNumber, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var url = $"repos/{owner}/{repo}/pulls/{prNumber}/commits";
        _logger.LogDebug("Fetching commits for PR #{Number} from {Url}", prNumber, url);

        var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        var dtos = await response.Content.ReadFromJsonAsync<List<GitHubCommitDto>>(GitHubJsonOptions, ct) ?? [];
        return dtos.Select(d => new PullRequestCommit
        {
            Sha = d.Sha ?? "",
            Message = d.Commit?.Message ?? "",
            AuthorLogin = d.Author?.Login ?? d.Commit?.Author?.Name ?? "",
            AuthorAvatarUrl = d.Author?.AvatarUrl ?? "",
            Date = d.Commit?.Author?.Date ?? DateTimeOffset.MinValue
        }).ToList();
    }

    public async Task<IReadOnlyList<PullRequestFileChange>> GetPullRequestFilesAsync(
        string owner, string repo, int prNumber, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var url = $"repos/{owner}/{repo}/pulls/{prNumber}/files";
        _logger.LogDebug("Fetching files for PR #{Number} from {Url}", prNumber, url);

        var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        var dtos = await response.Content.ReadFromJsonAsync<List<GitHubFileChangeDto>>(GitHubJsonOptions, ct) ?? [];
        return dtos.Select(d => new PullRequestFileChange
        {
            Filename = d.Filename ?? "",
            Status = d.Status ?? "",
            Additions = d.Additions,
            Deletions = d.Deletions,
            Patch = d.Patch,
            PreviousFilename = d.PreviousFilename
        }).ToList();
    }

    public async Task<IReadOnlyList<ClaudeReviewComment>> GetAllPullRequestCommentsAsync(
        string owner, string repo, int prNumber, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var comments = new List<ClaudeReviewComment>();

        // PR review comments (inline on diffs)
        try
        {
            var response = await client.GetAsync($"repos/{owner}/{repo}/pulls/{prNumber}/comments", ct);
            response.EnsureSuccessStatusCode();
            var dtos = await response.Content.ReadFromJsonAsync<List<GitHubPrReviewCommentDto>>(GitHubJsonOptions, ct) ?? [];

            foreach (var dto in dtos)
            {
                comments.Add(new ClaudeReviewComment
                {
                    Id = dto.Id.ToString(),
                    Author = dto.User?.Login ?? "",
                    Body = dto.Body ?? "",
                    FilePath = dto.Path,
                    LineNumber = dto.Line ?? dto.OriginalLine,
                    CreatedAt = dto.CreatedAt,
                    HtmlUrl = dto.HtmlUrl ?? "",
                    Severity = ClaudeReviewComment.DetectSeverity(dto.Body ?? "")
                });
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Failed to fetch PR review comments for {Owner}/{Repo}#{Number}", owner, repo, prNumber);
        }

        // Issue comments (top-level)
        try
        {
            var response = await client.GetAsync($"repos/{owner}/{repo}/issues/{prNumber}/comments", ct);
            response.EnsureSuccessStatusCode();
            var dtos = await response.Content.ReadFromJsonAsync<List<GitHubIssueCommentDto>>(GitHubJsonOptions, ct) ?? [];

            foreach (var dto in dtos)
            {
                comments.Add(new ClaudeReviewComment
                {
                    Id = dto.Id.ToString(),
                    Author = dto.User?.Login ?? "",
                    Body = dto.Body ?? "",
                    CreatedAt = dto.CreatedAt,
                    HtmlUrl = dto.HtmlUrl ?? "",
                    Severity = ClaudeReviewComment.DetectSeverity(dto.Body ?? "")
                });
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Failed to fetch issue comments for {Owner}/{Repo}#{Number}", owner, repo, prNumber);
        }

        return comments.OrderBy(c => c.CreatedAt).ToList();
    }

    public async Task SubmitReviewAsync(
        string owner, string repo, int prNumber, string reviewEvent, string? body = null, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var url = $"repos/{owner}/{repo}/pulls/{prNumber}/reviews";
        _logger.LogInformation("Submitting review ({Event}) for {Owner}/{Repo} PR #{Number}", reviewEvent, owner, repo, prNumber);

        var payload = new Dictionary<string, string> { ["event"] = reviewEvent };
        if (!string.IsNullOrWhiteSpace(body))
            payload["body"] = body;

        var response = await client.PostAsJsonAsync(url, payload, GitHubJsonOptions, ct);
        response.EnsureSuccessStatusCode();
    }

    public async Task PostCommentAsync(
        string owner, string repo, int prNumber, string body, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var url = $"repos/{owner}/{repo}/issues/{prNumber}/comments";
        _logger.LogInformation("Posting comment on {Owner}/{Repo} PR #{Number}", owner, repo, prNumber);

        var payload = new { body };
        var response = await client.PostAsJsonAsync(url, payload, GitHubJsonOptions, ct);
        response.EnsureSuccessStatusCode();
    }

    internal static ReviewStatus AggregateReviewStatus(List<GitHubReviewDto> reviews)
    {
        if (reviews.Count == 0)
            return ReviewStatus.None;

        // Take the latest review per user (GitHub returns reviews in chronological order)
        var latestByUser = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var review in reviews)
        {
            var login = review.User?.Login ?? "";
            var state = review.State ?? "";
            if (!string.IsNullOrEmpty(login) && !string.IsNullOrEmpty(state))
            {
                latestByUser[login] = state;
            }
        }

        if (latestByUser.Count == 0)
            return ReviewStatus.None;

        // Precedence: CHANGES_REQUESTED > APPROVED > COMMENTED > PENDING > None
        var states = latestByUser.Values.ToList();

        if (states.Any(s => s.Equals("CHANGES_REQUESTED", StringComparison.OrdinalIgnoreCase)))
            return ReviewStatus.ChangesRequested;

        if (states.Any(s => s.Equals("APPROVED", StringComparison.OrdinalIgnoreCase)))
            return ReviewStatus.Approved;

        if (states.Any(s => s.Equals("COMMENTED", StringComparison.OrdinalIgnoreCase)))
            return ReviewStatus.Commented;

        if (states.Any(s => s.Equals("PENDING", StringComparison.OrdinalIgnoreCase)))
            return ReviewStatus.Pending;

        return ReviewStatus.None;
    }

    private static PullRequest MapToPullRequest(GitHubPullRequestDto dto, string owner, string repo)
    {
        return new PullRequest
        {
            Number = dto.Number,
            Title = dto.Title ?? "",
            HeadRef = dto.Head?.Ref ?? "",
            BaseRef = dto.Base?.Ref ?? "",
            AuthorLogin = dto.User?.Login ?? "",
            AuthorAvatarUrl = dto.User?.AvatarUrl ?? "",
            State = dto.State ?? "open",
            CreatedAt = dto.CreatedAt,
            UpdatedAt = dto.UpdatedAt,
            IsDraft = dto.Draft,
            Mergeable = dto.Mergeable,
            HtmlUrl = dto.HtmlUrl ?? "",
            Body = dto.Body ?? "",
            RepoOwner = owner,
            RepoName = repo,
            CommentCount = dto.Comments,
            Additions = dto.Additions,
            Deletions = dto.Deletions,
            ChangedFiles = dto.ChangedFiles,
            CommitCount = dto.Commits,
            Labels = dto.Labels?.Select(l => l.Name ?? "").Where(n => n.Length > 0).ToList() ?? []
        };
    }

    // --- Internal DTOs for GitHub API JSON mapping ---

    internal sealed class GitHubPullRequestDto
    {
        public int Number { get; set; }
        public string? Title { get; set; }
        public string? Body { get; set; }
        public string? State { get; set; }
        [JsonPropertyName("html_url")]
        public string? HtmlUrl { get; set; }
        [JsonPropertyName("created_at")]
        public DateTime CreatedAt { get; set; }
        [JsonPropertyName("updated_at")]
        public DateTime UpdatedAt { get; set; }
        public bool Draft { get; set; }
        public bool? Mergeable { get; set; }
        public int Comments { get; set; }
        public int Additions { get; set; }
        public int Deletions { get; set; }
        [JsonPropertyName("changed_files")]
        public int ChangedFiles { get; set; }
        public int Commits { get; set; }
        public GitHubUserDto? User { get; set; }
        public GitHubRefDto? Head { get; set; }
        public GitHubRefDto? Base { get; set; }
        public List<GitHubLabelDto>? Labels { get; set; }
    }

    internal sealed class GitHubUserDto
    {
        public string? Login { get; set; }
        [JsonPropertyName("avatar_url")]
        public string? AvatarUrl { get; set; }
    }

    internal sealed class GitHubRefDto
    {
        public string? Ref { get; set; }
    }

    internal sealed class GitHubLabelDto
    {
        public string? Name { get; set; }
    }

    internal sealed class GitHubReviewDto
    {
        public string? State { get; set; }
        public GitHubUserDto? User { get; set; }
    }

    internal sealed class GitHubPrReviewCommentDto
    {
        public long Id { get; set; }
        public string? Body { get; set; }
        public string? Path { get; set; }
        public int? Line { get; set; }
        [JsonPropertyName("original_line")]
        public int? OriginalLine { get; set; }
        [JsonPropertyName("html_url")]
        public string? HtmlUrl { get; set; }
        [JsonPropertyName("created_at")]
        public DateTimeOffset CreatedAt { get; set; }
        public GitHubUserDto? User { get; set; }
    }

    internal sealed class GitHubIssueCommentDto
    {
        public long Id { get; set; }
        public string? Body { get; set; }
        [JsonPropertyName("html_url")]
        public string? HtmlUrl { get; set; }
        [JsonPropertyName("created_at")]
        public DateTimeOffset CreatedAt { get; set; }
        public GitHubUserDto? User { get; set; }
    }

    internal sealed class GitHubCommitDto
    {
        public string? Sha { get; set; }
        public GitHubCommitDetailDto? Commit { get; set; }
        public GitHubUserDto? Author { get; set; }
    }

    internal sealed class GitHubCommitDetailDto
    {
        public string? Message { get; set; }
        public GitHubCommitAuthorDto? Author { get; set; }
    }

    internal sealed class GitHubCommitAuthorDto
    {
        public string? Name { get; set; }
        public DateTimeOffset? Date { get; set; }
    }

    internal sealed class GitHubFileChangeDto
    {
        public string? Filename { get; set; }
        public string? Status { get; set; }
        public int Additions { get; set; }
        public int Deletions { get; set; }
        public string? Patch { get; set; }
        [JsonPropertyName("previous_filename")]
        public string? PreviousFilename { get; set; }
    }
}
