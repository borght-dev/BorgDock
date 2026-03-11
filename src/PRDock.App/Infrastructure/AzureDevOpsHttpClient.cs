using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using PRDock.App.Services;

namespace PRDock.App.Infrastructure;

public sealed class AzureDevOpsHttpClient
{
    private static readonly JsonSerializerOptions AdoJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ISettingsService _settingsService;
    private readonly ILogger<AzureDevOpsHttpClient> _logger;

    public event Action? AuthenticationFailed;

    public AzureDevOpsHttpClient(
        IHttpClientFactory httpClientFactory,
        ISettingsService settingsService,
        ILogger<AzureDevOpsHttpClient> logger)
    {
        _httpClientFactory = httpClientFactory;
        _settingsService = settingsService;
        _logger = logger;
    }

    public bool IsConfigured
    {
        get
        {
            var s = _settingsService.CurrentSettings.AzureDevOps;
            return !string.IsNullOrWhiteSpace(s.Organization)
                && !string.IsNullOrWhiteSpace(s.Project)
                && !string.IsNullOrWhiteSpace(s.PersonalAccessToken);
        }
    }

    private string BaseUrl
    {
        get
        {
            var s = _settingsService.CurrentSettings.AzureDevOps;
            return $"https://dev.azure.com/{Uri.EscapeDataString(s.Organization)}/{Uri.EscapeDataString(s.Project)}/_apis/";
        }
    }

    private AuthenticationHeaderValue GetAuthHeader()
    {
        var pat = _settingsService.CurrentSettings.AzureDevOps.PersonalAccessToken ?? "";
        var bytes = Encoding.ASCII.GetBytes($":{pat}");
        return new AuthenticationHeaderValue("Basic", Convert.ToBase64String(bytes));
    }

    public async Task<T?> GetAsync<T>(string relativeUrl, CancellationToken ct = default)
    {
        var url = BuildUrl(relativeUrl);
        _logger.LogDebug("ADO GET {Url}", url);

        var client = _httpClientFactory.CreateClient("AzureDevOps");
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = GetAuthHeader();

        var response = await client.SendAsync(request, ct);
        return await HandleResponse<T>(response, url, ct);
    }

    public async Task<T?> PostAsync<T>(string relativeUrl, object body, string? contentType = null, CancellationToken ct = default)
    {
        var url = BuildUrl(relativeUrl);
        _logger.LogDebug("ADO POST {Url}", url);

        var client = _httpClientFactory.CreateClient("AzureDevOps");
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = GetAuthHeader();

        var json = JsonSerializer.Serialize(body, AdoJsonOptions);
        request.Content = new StringContent(json, Encoding.UTF8, contentType ?? "application/json");

        var response = await client.SendAsync(request, ct);
        return await HandleResponse<T>(response, url, ct);
    }

    public async Task<T?> PatchAsync<T>(string relativeUrl, object body, string? contentType = null, CancellationToken ct = default)
    {
        var url = BuildUrl(relativeUrl);
        _logger.LogDebug("ADO PATCH {Url}", url);

        var client = _httpClientFactory.CreateClient("AzureDevOps");
        using var request = new HttpRequestMessage(HttpMethod.Patch, url);
        request.Headers.Authorization = GetAuthHeader();

        var json = JsonSerializer.Serialize(body, AdoJsonOptions);
        request.Content = new StringContent(json, Encoding.UTF8, contentType ?? "application/json");

        var response = await client.SendAsync(request, ct);
        return await HandleResponse<T>(response, url, ct);
    }

    public async Task DeleteAsync(string relativeUrl, CancellationToken ct = default)
    {
        var url = BuildUrl(relativeUrl);
        _logger.LogDebug("ADO DELETE {Url}", url);

        var client = _httpClientFactory.CreateClient("AzureDevOps");
        using var request = new HttpRequestMessage(HttpMethod.Delete, url);
        request.Headers.Authorization = GetAuthHeader();

        var response = await client.SendAsync(request, ct);

        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            _logger.LogWarning("ADO auth failure ({StatusCode}) for {Url}", (int)response.StatusCode, url);
            AuthenticationFailed?.Invoke();
            throw new HttpRequestException($"Azure DevOps authentication failed ({(int)response.StatusCode}).");
        }

        response.EnsureSuccessStatusCode();
    }

    public async Task<Stream> GetStreamAsync(string relativeUrl, CancellationToken ct = default)
    {
        var url = BuildUrl(relativeUrl);
        _logger.LogDebug("ADO GET stream {Url}", url);

        var client = _httpClientFactory.CreateClient("AzureDevOps");
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = GetAuthHeader();

        var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            AuthenticationFailed?.Invoke();
            throw new HttpRequestException($"Azure DevOps authentication failed ({(int)response.StatusCode}).");
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStreamAsync(ct);
    }

    /// <summary>
    /// Tests the connection by making a simple API call.
    /// Returns null on success or an error message on failure.
    /// </summary>
    public async Task<string?> TestConnectionAsync(string organization, string project, string pat, CancellationToken ct = default)
    {
        try
        {
            var url = $"https://dev.azure.com/{Uri.EscapeDataString(organization)}/{Uri.EscapeDataString(project)}/_apis/projects/{Uri.EscapeDataString(project)}?api-version=7.1";
            var client = _httpClientFactory.CreateClient("AzureDevOps");
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            var bytes = Encoding.ASCII.GetBytes($":{pat}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(bytes));

            var response = await client.SendAsync(request, ct);

            if (response.StatusCode == HttpStatusCode.Unauthorized)
                return "Invalid Personal Access Token.";
            if (response.StatusCode == HttpStatusCode.NotFound)
                return "Organization or project not found.";

            response.EnsureSuccessStatusCode();
            return null;
        }
        catch (HttpRequestException ex)
        {
            return $"Connection failed: {ex.Message}";
        }
        catch (TaskCanceledException)
        {
            return "Connection timed out.";
        }
    }

    private string BuildUrl(string relativeUrl)
    {
        var separator = relativeUrl.Contains('?') ? "&" : "?";
        return $"{BaseUrl}{relativeUrl}{separator}api-version=7.1";
    }

    private async Task<T?> HandleResponse<T>(HttpResponseMessage response, string url, CancellationToken ct)
    {
        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            _logger.LogWarning("ADO auth failure ({StatusCode}) for {Url}", (int)response.StatusCode, url);
            AuthenticationFailed?.Invoke();
            throw new HttpRequestException($"Azure DevOps authentication failed ({(int)response.StatusCode}).");
        }

        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync(ct);
        return JsonSerializer.Deserialize<T>(body, AdoJsonOptions);
    }
}
