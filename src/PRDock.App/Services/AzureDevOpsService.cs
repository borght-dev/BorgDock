using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PRDock.App.Infrastructure;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed class AzureDevOpsService : IAzureDevOpsService
{
    private readonly AzureDevOpsHttpClient _httpClient;
    private readonly ISettingsService _settingsService;
    private readonly ILogger<AzureDevOpsService> _logger;

    public AzureDevOpsService(
        AzureDevOpsHttpClient httpClient,
        ISettingsService settingsService,
        ILogger<AzureDevOpsService> logger)
    {
        _httpClient = httpClient;
        _settingsService = settingsService;
        _logger = logger;
    }

    public async Task<IReadOnlyList<AdoQuery>> GetQueriesAsync(CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync<AdoQueryListResponse>(
            "wit/queries?$depth=2&$expand=minimal", ct);
        return response?.Value ?? [];
    }

    public async Task<IReadOnlyList<int>> ExecuteQueryAsync(Guid queryId, CancellationToken ct = default)
    {
        var response = await _httpClient.GetAsync<AdoQueryResult>(
            $"wit/wiql/{queryId}", ct);
        return response?.WorkItems.Select(w => w.Id).ToList() ?? [];
    }

    public async Task<IReadOnlyList<WorkItem>> GetWorkItemsAsync(IReadOnlyList<int> ids, CancellationToken ct = default)
    {
        if (ids.Count == 0) return [];

        var results = new List<WorkItem>();

        // Batch in groups of 200 (ADO limit)
        foreach (var batch in ids.Chunk(200))
        {
            var idList = string.Join(",", batch);
            var response = await _httpClient.GetAsync<AdoWorkItemListResponse>(
                $"wit/workitems?ids={idList}&$expand=relations", ct);

            if (response?.Value is not null)
            {
                foreach (var wi in response.Value)
                    EnrichHtmlUrl(wi);
                results.AddRange(response.Value);
            }
        }

        return results;
    }

    public async Task<WorkItem> GetWorkItemAsync(int id, CancellationToken ct = default)
    {
        var wi = await _httpClient.GetAsync<WorkItem>(
            $"wit/workitems/{id}?$expand=relations", ct);
        if (wi is null) throw new InvalidOperationException($"Work item {id} not found.");
        EnrichHtmlUrl(wi);
        return wi;
    }

    public async Task<WorkItem> CreateWorkItemAsync(string workItemType, IReadOnlyList<JsonPatchOperation> fields, CancellationToken ct = default)
    {
        var encodedType = Uri.EscapeDataString(workItemType);
        var wi = await _httpClient.PostAsync<WorkItem>(
            $"wit/workitems/${encodedType}", fields, "application/json-patch+json", ct);
        if (wi is null) throw new InvalidOperationException("Failed to create work item.");
        EnrichHtmlUrl(wi);
        return wi;
    }

    public async Task<WorkItem> UpdateWorkItemAsync(int id, IReadOnlyList<JsonPatchOperation> fields, CancellationToken ct = default)
    {
        var wi = await _httpClient.PatchAsync<WorkItem>(
            $"wit/workitems/{id}", fields, "application/json-patch+json", ct);
        if (wi is null) throw new InvalidOperationException($"Failed to update work item {id}.");
        EnrichHtmlUrl(wi);
        return wi;
    }

    public async Task DeleteWorkItemAsync(int id, CancellationToken ct = default)
    {
        await _httpClient.DeleteAsync($"wit/workitems/{id}", ct);
    }

    public async Task<Stream> DownloadAttachmentAsync(Guid attachmentId, string fileName, CancellationToken ct = default)
    {
        var encodedName = Uri.EscapeDataString(fileName);
        return await _httpClient.GetStreamAsync(
            $"wit/attachments/{attachmentId}?fileName={encodedName}", ct);
    }

    public Task<string?> TestConnectionAsync(string organization, string project, string pat, CancellationToken ct = default)
    {
        return _httpClient.TestConnectionAsync(organization, project, pat, ct);
    }

    public async Task<string?> GetCurrentUserDisplayNameAsync(CancellationToken ct = default)
    {
        var response = await _httpClient.GetOrgLevelAsync<ConnectionDataResponse>("connectionData", ct);
        return response?.AuthenticatedUser?.ProviderDisplayName;
    }

    private void EnrichHtmlUrl(WorkItem wi)
    {
        var s = _settingsService.CurrentSettings.AzureDevOps;
        wi.HtmlUrl = $"https://dev.azure.com/{Uri.EscapeDataString(s.Organization)}/{Uri.EscapeDataString(s.Project)}/_workitems/edit/{wi.Id}";
    }

    // Response wrappers for ADO list endpoints
    private sealed class AdoQueryListResponse
    {
        public List<AdoQuery> Value { get; set; } = [];
    }

    private sealed class AdoWorkItemListResponse
    {
        public List<WorkItem> Value { get; set; } = [];
    }

    private sealed class ConnectionDataResponse
    {
        public AuthenticatedUserInfo? AuthenticatedUser { get; set; }
    }

    private sealed class AuthenticatedUserInfo
    {
        public string ProviderDisplayName { get; set; } = "";
    }
}
