using System.Collections.Concurrent;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using PRDock.App.Services;

namespace PRDock.App.Infrastructure;

public sealed class GitHubHttpClient
{
    private static readonly JsonSerializerOptions GitHubJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IGitHubAuthService _authService;
    private readonly IRetryHandler _retryHandler;
    private readonly ILogger<GitHubHttpClient> _logger;
    private readonly ConcurrentDictionary<string, (string Etag, string Body)> _etagCache = new();

    public int RateLimitRemaining { get; private set; } = -1;
    public int RateLimitTotal { get; private set; } = -1;
    public DateTimeOffset? RateLimitReset { get; private set; }

    public bool IsRateLimitLow => RateLimitRemaining >= 0 && RateLimitRemaining < 500;

    public event Action? AuthenticationFailed;

    public GitHubHttpClient(
        IHttpClientFactory httpClientFactory,
        IGitHubAuthService authService,
        IRetryHandler retryHandler,
        ILogger<GitHubHttpClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _authService = authService;
        _retryHandler = retryHandler;
        _logger = logger;
    }

    public async Task<T?> GetAsync<T>(string url, CancellationToken ct = default)
    {
        var response = await GetRawAsync(url, ct);

        if (response.StatusCode == HttpStatusCode.NotModified)
        {
            if (_etagCache.TryGetValue(url, out var cached))
            {
                _logger.LogDebug("ETag cache hit for {Url}", url);
                return JsonSerializer.Deserialize<T>(cached.Body, GitHubJsonOptions);
            }
        }

        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            _logger.LogWarning("Authentication failure ({StatusCode}) for {Url}", (int)response.StatusCode, url);
            AuthenticationFailed?.Invoke();
            throw new HttpRequestException($"GitHub API authentication failed ({(int)response.StatusCode}). Please re-authenticate.");
        }

        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync(ct);

        if (response.Headers.ETag is not null)
        {
            _etagCache[url] = (response.Headers.ETag.Tag, body);
        }

        return JsonSerializer.Deserialize<T>(body, GitHubJsonOptions);
    }

    public async Task<HttpResponseMessage> GetRawAsync(string url, CancellationToken ct = default)
    {
        _logger.LogDebug("HTTP GET {Url}", url);

        var response = await _retryHandler.ExecuteAsync(async innerCt =>
        {
            var client = _httpClientFactory.CreateClient("GitHub");
            using var request = new HttpRequestMessage(HttpMethod.Get, url);

            var token = await _authService.GetTokenAsync(innerCt);
            if (!string.IsNullOrEmpty(token))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }

            if (_etagCache.TryGetValue(url, out var cached))
            {
                request.Headers.IfNoneMatch.Add(new EntityTagHeaderValue(cached.Etag));
            }

            return await client.SendAsync(request, innerCt);
        }, ct);

        _logger.LogDebug("HTTP {StatusCode} for {Url}", (int)response.StatusCode, url);
        ParseRateLimitHeaders(response);

        if (IsRateLimitLow)
        {
            _logger.LogWarning(
                "GitHub API rate limit low: {Remaining}/{Total}, resets at {Reset}",
                RateLimitRemaining, RateLimitTotal, RateLimitReset);
        }

        return response;
    }

    private void ParseRateLimitHeaders(HttpResponseMessage response)
    {
        if (response.Headers.TryGetValues("X-RateLimit-Remaining", out var remainingValues))
        {
            var value = remainingValues.FirstOrDefault();
            if (int.TryParse(value, out var remaining))
            {
                RateLimitRemaining = remaining;
            }
        }

        if (response.Headers.TryGetValues("X-RateLimit-Limit", out var limitValues))
        {
            var value = limitValues.FirstOrDefault();
            if (int.TryParse(value, out var total))
            {
                RateLimitTotal = total;
            }
        }

        if (response.Headers.TryGetValues("X-RateLimit-Reset", out var resetValues))
        {
            var value = resetValues.FirstOrDefault();
            if (long.TryParse(value, out var resetUnix))
            {
                RateLimitReset = DateTimeOffset.FromUnixTimeSeconds(resetUnix);
            }
        }
    }
}
