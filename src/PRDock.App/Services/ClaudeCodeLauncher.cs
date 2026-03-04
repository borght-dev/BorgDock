using System.Diagnostics;
using System.IO;
using System.Text;
using Microsoft.Extensions.Logging;
using PRDock.App.Infrastructure;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed class ClaudeCodeLauncher : IClaudeCodeLauncher
{
    private static readonly string PromptsDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PRDock", "prompts");

    private readonly ISettingsService _settingsService;
    private readonly ProcessTracker _processTracker;
    private readonly ILogger<ClaudeCodeLauncher> _logger;

    public ClaudeCodeLauncher(
        ISettingsService settingsService,
        ProcessTracker processTracker,
        ILogger<ClaudeCodeLauncher> logger)
    {
        _settingsService = settingsService;
        _processTracker = processTracker;
        _logger = logger;
    }

    public async Task<int> LaunchFixAsync(
        PullRequest pr,
        string checkName,
        List<ParsedError> errors,
        List<string> changedFiles,
        string rawLog,
        string worktreePath,
        RepoSettings repoSettings,
        CancellationToken ct = default)
    {
        var promptContent = BuildFixPrompt(pr, checkName, errors, changedFiles, rawLog, repoSettings);
        var promptPath = WritePromptFile(pr.Number, SanitizeFileName(checkName), promptContent);

        _logger.LogInformation("Generated prompt file at {Path} for PR #{Number} check {Check}",
            promptPath, pr.Number, checkName);

        var pid = await LaunchWindowsTerminalAsync(pr.Number, worktreePath, promptPath, ct);

        _processTracker.Track(pid, pr.Number, $"Fix: {checkName}");

        return pid;
    }

    public async Task<int> LaunchConflictResolutionAsync(
        PullRequest pr,
        string worktreePath,
        RepoSettings repoSettings,
        CancellationToken ct = default)
    {
        var promptContent = BuildConflictPrompt(pr);
        var promptPath = WritePromptFile(pr.Number, "merge-conflict", promptContent);

        _logger.LogInformation("Generated conflict resolution prompt at {Path} for PR #{Number}",
            promptPath, pr.Number);

        var pid = await LaunchWindowsTerminalAsync(pr.Number, worktreePath, promptPath, ct);

        _processTracker.Track(pid, pr.Number, "Conflict resolution");

        return pid;
    }

    public void CleanupOldPromptFiles(int maxAgeDays = 7)
    {
        if (!Directory.Exists(PromptsDir))
            return;

        var cutoff = DateTime.UtcNow.AddDays(-maxAgeDays);
        var files = Directory.GetFiles(PromptsDir, "*.md");
        int deleted = 0;

        foreach (var file in files)
        {
            if (File.GetCreationTimeUtc(file) < cutoff)
            {
                try
                {
                    File.Delete(file);
                    deleted++;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete old prompt file: {File}", file);
                }
            }
        }

        if (deleted > 0)
            _logger.LogInformation("Cleaned up {Count} old prompt files", deleted);
    }

    internal static string BuildFixPrompt(
        PullRequest pr,
        string checkName,
        List<ParsedError> errors,
        List<string> changedFiles,
        string rawLog,
        RepoSettings repoSettings)
    {
        var sb = new StringBuilder();

        sb.AppendLine($"# Fix Failing CI Check: PR #{pr.Number}");
        sb.AppendLine();
        sb.AppendLine($"**PR:** {pr.Title} (#{pr.Number})");
        sb.AppendLine($"**URL:** {pr.HtmlUrl}");
        sb.AppendLine($"**Branch:** {pr.HeadRef} -> {pr.BaseRef}");
        sb.AppendLine($"**Author:** {pr.AuthorLogin}");
        sb.AppendLine($"**Failed Check:** {checkName}");
        sb.AppendLine();

        // Parsed errors
        if (errors.Count > 0)
        {
            sb.AppendLine("## Parsed Errors");
            sb.AppendLine();
            foreach (var error in errors)
            {
                var tag = error.IsIntroducedByPR ? "[Introduced]" : "[Pre-existing]";
                var location = !string.IsNullOrEmpty(error.FilePath)
                    ? $"{error.FilePath}:{error.Line}:{error.Column}"
                    : "unknown location";

                sb.AppendLine($"### {tag} {error.Category} {error.ErrorCode}");
                sb.AppendLine($"**Location:** {location}");
                sb.AppendLine($"**Message:** {error.Message}");

                if (error.ContextLines.Count > 0)
                {
                    sb.AppendLine("```");
                    foreach (var line in error.ContextLines)
                        sb.AppendLine(line);
                    sb.AppendLine("```");
                }
                sb.AppendLine();
            }
        }

        // Changed files
        if (changedFiles.Count > 0)
        {
            sb.AppendLine("## Files Changed in This PR");
            sb.AppendLine();
            foreach (var file in changedFiles)
                sb.AppendLine($"- {file}");
            sb.AppendLine();
        }

        // Raw log (last 500 lines)
        if (!string.IsNullOrEmpty(rawLog))
        {
            sb.AppendLine("## Raw Log (last 500 lines)");
            sb.AppendLine();
            sb.AppendLine("```");
            var lines = rawLog.Split(['\n', '\r'], StringSplitOptions.RemoveEmptyEntries);
            var startIndex = Math.Max(0, lines.Length - 500);
            for (int i = startIndex; i < lines.Length; i++)
                sb.AppendLine(lines[i]);
            sb.AppendLine("```");
            sb.AppendLine();
        }

        // Per-repo custom prompt template
        if (!string.IsNullOrEmpty(repoSettings.FixPromptTemplate))
        {
            sb.AppendLine("## Additional Context");
            sb.AppendLine();
            sb.AppendLine(repoSettings.FixPromptTemplate);
            sb.AppendLine();
        }

        // Instruction
        sb.AppendLine("## Instructions");
        sb.AppendLine();
        sb.AppendLine($"Fix the failing CI check. The errors above come from the `{checkName}` workflow. " +
                       "Analyze the errors, make the necessary code changes, and run the relevant checks locally to verify.");

        return sb.ToString();
    }

    internal static string BuildConflictPrompt(PullRequest pr)
    {
        var sb = new StringBuilder();

        sb.AppendLine($"# Resolve Merge Conflict: PR #{pr.Number}");
        sb.AppendLine();
        sb.AppendLine($"**PR:** {pr.Title} (#{pr.Number})");
        sb.AppendLine($"**URL:** {pr.HtmlUrl}");
        sb.AppendLine($"**Branch:** {pr.HeadRef} -> {pr.BaseRef}");
        sb.AppendLine($"**Author:** {pr.AuthorLogin}");
        sb.AppendLine();
        sb.AppendLine("## Instructions");
        sb.AppendLine();
        sb.AppendLine($"Merge `origin/{pr.BaseRef}` into this branch, resolve all merge conflicts " +
                       "preserving the PR's intent, run tests to verify, then commit the merge and " +
                       $"push to `origin/{pr.HeadRef}`.");

        return sb.ToString();
    }

    internal string WritePromptFile(int prNumber, string suffix, string content)
    {
        Directory.CreateDirectory(PromptsDir);

        var timestamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
        var fileName = $"{timestamp}-PR{prNumber}-{suffix}.md";
        var filePath = Path.Combine(PromptsDir, fileName);

        File.WriteAllText(filePath, content, Encoding.UTF8);
        return filePath;
    }

    private async Task<int> LaunchWindowsTerminalAsync(
        int prNumber, string worktreePath, string promptPath, CancellationToken ct)
    {
        var claudePath = _settingsService.CurrentSettings.ClaudeCode.ClaudeCodePath ?? "claude";

        var arguments = $"-w 0 new-tab --title \"CC: PR #{prNumber}\" -- " +
                        $"{claudePath} --cwd \"{worktreePath}\" --prompt-file \"{promptPath}\"";

        _logger.LogInformation("Launching: wt.exe {Arguments}", arguments);

        var startInfo = new ProcessStartInfo
        {
            FileName = "wt.exe",
            Arguments = arguments,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException(
                "Failed to start Windows Terminal. Ensure wt.exe is installed and on PATH.");

        await process.WaitForExitAsync(ct);

        // wt.exe exits quickly after launching the tab; the actual process is the tab's shell.
        // Return the wt.exe PID for tracking purposes — ProcessTracker will detect when it exits.
        return process.Id;
    }

    internal static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var sb = new StringBuilder(name.Length);
        foreach (var c in name)
        {
            sb.Append(invalid.Contains(c) ? '_' : c);
        }
        return sb.ToString();
    }
}
