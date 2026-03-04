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
    private readonly ILogger<GitHubHttpClient> _logger;
    private readonly ConcurrentDictionary<string, (string Etag, string Body)> _etagCache = new();

    public int RateLimitRemaining { get; private set; } = -1;
    public DateTimeOffset? RateLimitReset { get; private set; }

    public GitHubHttpClient(
        IHttpClientFactory httpClientFactory,
        IGitHubAuthService authService,
        ILogger<GitHubHttpClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _authService = authService;
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

        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync(ct);

        // Cache ETag if present
        if (response.Headers.ETag is not null)
        {
            _etagCache[url] = (response.Headers.ETag.Tag, body);
        }

        return JsonSerializer.Deserialize<T>(body, GitHubJsonOptions);
    }

    public async Task<HttpResponseMessage> GetRawAsync(string url, CancellationToken ct = default)
    {
        var client = _httpClientFactory.CreateClient("GitHub");
        using var request = new HttpRequestMessage(HttpMethod.Get, url);

        // Auth header
        var token = await _authService.GetTokenAsync(ct);
        if (!string.IsNullOrEmpty(token))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        // ETag header
        if (_etagCache.TryGetValue(url, out var cached))
        {
            request.Headers.IfNoneMatch.Add(new EntityTagHeaderValue(cached.Etag));
        }

        var response = await client.SendAsync(request, ct);

        ParseRateLimitHeaders(response);

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
