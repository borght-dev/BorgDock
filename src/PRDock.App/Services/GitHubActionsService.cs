using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed class GitHubActionsService : IGitHubActionsService
{
    private static readonly JsonSerializerOptions GitHubJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IGitHubAuthService _authService;
    private readonly ILogger<GitHubActionsService> _logger;

    public GitHubActionsService(
        IHttpClientFactory httpClientFactory,
        IGitHubAuthService authService,
        ILogger<GitHubActionsService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _authService = authService;
        _logger = logger;
    }

    public async Task<IReadOnlyList<CheckSuite>> GetCheckSuitesAsync(
        string owner, string repo, string sha, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var url = $"repos/{owner}/{repo}/commits/{sha}/check-suites";

        _logger.LogDebug("Fetching check suites from {Url}", url);

        var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync(ct);
        var wrapper = JsonSerializer.Deserialize<CheckSuitesResponse>(json, GitHubJsonOptions);

        return wrapper?.CheckSuites?.Select(dto => new CheckSuite
        {
            Id = dto.Id,
            Status = dto.Status ?? "",
            Conclusion = dto.Conclusion,
            HeadSha = dto.HeadSha ?? ""
        }).ToList().AsReadOnly() ?? new List<CheckSuite>().AsReadOnly();
    }

    public async Task<IReadOnlyList<CheckRun>> GetCheckRunsAsync(
        string owner, string repo, long checkSuiteId, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var url = $"repos/{owner}/{repo}/check-suites/{checkSuiteId}/check-runs";

        _logger.LogDebug("Fetching check runs from {Url}", url);

        var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync(ct);
        var wrapper = JsonSerializer.Deserialize<CheckRunsResponse>(json, GitHubJsonOptions);

        return wrapper?.CheckRuns?.Select(dto => new CheckRun
        {
            Id = dto.Id,
            Name = dto.Name ?? "",
            Status = dto.Status ?? "",
            Conclusion = dto.Conclusion,
            StartedAt = dto.StartedAt,
            CompletedAt = dto.CompletedAt,
            HtmlUrl = dto.HtmlUrl ?? "",
            CheckSuiteId = checkSuiteId
        }).ToList().AsReadOnly() ?? new List<CheckRun>().AsReadOnly();
    }

    public async Task<IReadOnlyList<WorkflowJob>> GetWorkflowJobsAsync(
        string owner, string repo, long runId, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var url = $"repos/{owner}/{repo}/actions/runs/{runId}/jobs";

        _logger.LogDebug("Fetching workflow jobs from {Url}", url);

        var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync(ct);
        var wrapper = JsonSerializer.Deserialize<WorkflowJobsResponse>(json, GitHubJsonOptions);

        return wrapper?.Jobs?.Select(dto => new WorkflowJob
        {
            Id = dto.Id,
            Name = dto.Name ?? "",
            Status = dto.Status ?? "",
            Conclusion = dto.Conclusion,
            StartedAt = dto.StartedAt,
            CompletedAt = dto.CompletedAt,
            RunId = runId,
            HtmlUrl = dto.HtmlUrl ?? ""
        }).ToList().AsReadOnly() ?? new List<WorkflowJob>().AsReadOnly();
    }

    public async Task<string> GetJobLogAsync(
        string owner, string repo, long jobId, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var url = $"repos/{owner}/{repo}/actions/jobs/{jobId}/logs";

        _logger.LogDebug("Fetching job log from {Url}", url);

        var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        return await response.Content.ReadAsStringAsync(ct);
    }

    public async Task ReRunWorkflowAsync(
        string owner, string repo, long runId, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var url = $"repos/{owner}/{repo}/actions/runs/{runId}/rerun";

        _logger.LogDebug("Re-running workflow at {Url}", url);

        var response = await client.PostAsync(url, null, ct);
        response.EnsureSuccessStatusCode();
    }

    public async Task<IReadOnlyList<string>> GetPullRequestFilesAsync(
        string owner, string repo, int prNumber, CancellationToken ct = default)
    {
        var client = await CreateAuthenticatedClientAsync(ct);
        var url = $"repos/{owner}/{repo}/pulls/{prNumber}/files";

        _logger.LogDebug("Fetching PR files from {Url}", url);

        var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync(ct);
        var files = JsonSerializer.Deserialize<List<PrFileDto>>(json, GitHubJsonOptions);

        return files?.Select(f => f.Filename ?? "").Where(f => f.Length > 0).ToList().AsReadOnly()
            ?? new List<string>().AsReadOnly();
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(CancellationToken ct)
    {
        var client = _httpClientFactory.CreateClient("GitHub");
        var token = await _authService.GetTokenAsync(ct);
        if (!string.IsNullOrEmpty(token))
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        return client;
    }

    // DTOs for GitHub API deserialization

    private sealed class CheckSuitesResponse
    {
        public int TotalCount { get; set; }
        public List<CheckSuiteDto>? CheckSuites { get; set; }
    }

    private sealed class CheckRunsResponse
    {
        public int TotalCount { get; set; }
        public List<CheckRunDto>? CheckRuns { get; set; }
    }

    private sealed class CheckSuiteDto
    {
        public long Id { get; set; }
        public string? Status { get; set; }
        public string? Conclusion { get; set; }
        public string? HeadSha { get; set; }
    }

    private sealed class CheckRunDto
    {
        public long Id { get; set; }
        public string? Name { get; set; }
        public string? Status { get; set; }
        public string? Conclusion { get; set; }
        public DateTime? StartedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
        public string? HtmlUrl { get; set; }
    }

    private sealed class WorkflowJobsResponse
    {
        public int TotalCount { get; set; }
        public List<WorkflowJobDto>? Jobs { get; set; }
    }

    private sealed class WorkflowJobDto
    {
        public long Id { get; set; }
        public string? Name { get; set; }
        public string? Status { get; set; }
        public string? Conclusion { get; set; }
        public DateTimeOffset? StartedAt { get; set; }
        public DateTimeOffset? CompletedAt { get; set; }
        public string? HtmlUrl { get; set; }
    }

    private sealed class PrFileDto
    {
        public string? Filename { get; set; }
    }
}
