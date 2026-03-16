using System.IO;
using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IAzureDevOpsService
{
    Task<IReadOnlyList<AdoQuery>> GetQueriesAsync(CancellationToken ct = default);
    Task<IReadOnlyList<int>> ExecuteQueryAsync(Guid queryId, CancellationToken ct = default);
    Task<IReadOnlyList<WorkItem>> GetWorkItemsAsync(IReadOnlyList<int> ids, CancellationToken ct = default);
    Task<WorkItem> GetWorkItemAsync(int id, CancellationToken ct = default);
    Task<WorkItem> CreateWorkItemAsync(string workItemType, IReadOnlyList<JsonPatchOperation> fields, CancellationToken ct = default);
    Task<WorkItem> UpdateWorkItemAsync(int id, IReadOnlyList<JsonPatchOperation> fields, CancellationToken ct = default);
    Task DeleteWorkItemAsync(int id, CancellationToken ct = default);
    Task<Stream> DownloadAttachmentAsync(Guid attachmentId, string fileName, CancellationToken ct = default);
    Task<string?> TestConnectionAsync(string organization, string project, string pat, CancellationToken ct = default);
    Task<string?> GetCurrentUserDisplayNameAsync(CancellationToken ct = default);
}
