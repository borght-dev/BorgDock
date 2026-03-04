using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IWorktreeService
{
    Task<List<WorktreeInfo>> DiscoverWorktreesAsync(string basePath, CancellationToken ct = default);
    Task<string> FindOrCreateWorktreeAsync(string basePath, string subfolder, string branchName, CancellationToken ct = default);
    Task<bool> CheckLocalChangesAsync(string repoPath, string branchName, CancellationToken ct = default);
    Task RemoveWorktreeAsync(string basePath, string worktreePath, CancellationToken ct = default);
}
