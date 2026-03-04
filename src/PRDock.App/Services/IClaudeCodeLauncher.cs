using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IClaudeCodeLauncher
{
    Task<int> LaunchFixAsync(
        PullRequest pr,
        string checkName,
        List<ParsedError> errors,
        List<string> changedFiles,
        string rawLog,
        string worktreePath,
        RepoSettings repoSettings,
        CancellationToken ct = default);

    Task<int> LaunchConflictResolutionAsync(
        PullRequest pr,
        string worktreePath,
        RepoSettings repoSettings,
        CancellationToken ct = default);

    void CleanupOldPromptFiles(int maxAgeDays = 7);
}
