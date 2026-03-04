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
    private readonly ISettingsService _settingsService;
    private readonly ILogger<GitHubService> _logger;

    public GitHubService(
        IHttpClientFactory httpClientFactory,
        ISettingsService settingsService,
        ILogger<GitHubService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _settingsService = settingsService;
        _logger = logger;
    }

    public async Task<IReadOnlyList<PullRequest>> GetOpenPullRequestsAsync(
        string owner, string repo, CancellationToken ct = default)
    {
        var client = CreateAuthenticatedClient();

        _logger.LogInformation("Fetching open PRs for {Owner}/{Repo}", owner, repo);

        var response = await client.GetAsync($"repos/{owner}/{repo}/pulls?state=open", ct);
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

    private HttpClient CreateAuthenticatedClient()
    {
        var client = _httpClientFactory.CreateClient("GitHub");
        var pat = _settingsService.CurrentSettings.GitHub.PersonalAccessToken;

        if (!string.IsNullOrEmpty(pat))
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", pat);
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
            RepoOwner = owner,
            RepoName = repo,
            CommentCount = dto.Comments,
            Labels = dto.Labels?.Select(l => l.Name ?? "").Where(n => n.Length > 0).ToList() ?? []
        };
    }

    // --- Internal DTOs for GitHub API JSON mapping ---

    internal sealed class GitHubPullRequestDto
    {
        public int Number { get; set; }
        public string? Title { get; set; }
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
}
