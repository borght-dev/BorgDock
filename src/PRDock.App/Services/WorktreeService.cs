using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public interface IGitCommandRunner
{
    Task<(string StdOut, string StdErr, int ExitCode)> RunAsync(
        string workingDirectory, string arguments, CancellationToken ct = default);
}

public sealed class GitCommandRunner : IGitCommandRunner
{
    public async Task<(string StdOut, string StdErr, int ExitCode)> RunAsync(
        string workingDirectory, string arguments, CancellationToken ct = default)
    {
        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = "git",
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        process.Start();

        var stdOutTask = process.StandardOutput.ReadToEndAsync(ct);
        var stdErrTask = process.StandardError.ReadToEndAsync(ct);

        await process.WaitForExitAsync(ct);

        var stdOut = await stdOutTask;
        var stdErr = await stdErrTask;

        return (stdOut, stdErr, process.ExitCode);
    }
}

public sealed class WorktreeService : IWorktreeService
{
    private readonly IGitCommandRunner _git;
    private readonly ILogger<WorktreeService> _logger;

    public WorktreeService(IGitCommandRunner git, ILogger<WorktreeService> logger)
    {
        _git = git;
        _logger = logger;
    }

    public async Task<List<WorktreeInfo>> DiscoverWorktreesAsync(
        string basePath, CancellationToken ct = default)
    {
        _logger.LogDebug("Discovering worktrees in {BasePath}", basePath);

        var (stdOut, stdErr, exitCode) = await _git.RunAsync(basePath, "worktree list --porcelain", ct);

        if (exitCode != 0)
        {
            _logger.LogWarning("git worktree list failed (exit {ExitCode}): {StdErr}", exitCode, stdErr);
            return [];
        }

        return ParseWorktreeListOutput(stdOut);
    }

    internal static List<WorktreeInfo> ParseWorktreeListOutput(string output)
    {
        var worktrees = new List<WorktreeInfo>();
        if (string.IsNullOrWhiteSpace(output))
            return worktrees;

        var blocks = output.Split(["\n\n", "\r\n\r\n"], StringSplitOptions.RemoveEmptyEntries);
        bool isFirst = true;

        foreach (var block in blocks)
        {
            var lines = block.Split(['\n', '\r'], StringSplitOptions.RemoveEmptyEntries);
            string? path = null;
            string? branch = null;
            bool isBare = false;

            foreach (var line in lines)
            {
                if (line.StartsWith("worktree "))
                    path = line["worktree ".Length..].Trim();
                else if (line.StartsWith("branch refs/heads/"))
                    branch = line["branch refs/heads/".Length..].Trim();
                else if (line == "bare")
                    isBare = true;
            }

            if (path is not null && !isBare)
            {
                worktrees.Add(new WorktreeInfo
                {
                    Path = path,
                    BranchName = branch ?? "",
                    IsMainWorktree = isFirst
                });
            }

            isFirst = false;
        }

        return worktrees;
    }

    public async Task<string> FindOrCreateWorktreeAsync(
        string basePath, string subfolder, string branchName, CancellationToken ct = default)
    {
        _logger.LogInformation("FindOrCreateWorktree: base={BasePath}, branch={Branch}", basePath, branchName);

        var existing = await DiscoverWorktreesAsync(basePath, ct);
        var match = existing.FirstOrDefault(w =>
            w.BranchName.Equals(branchName, StringComparison.OrdinalIgnoreCase));

        if (match is not null)
        {
            _logger.LogInformation("Found existing worktree for branch {Branch} at {Path}", branchName, match.Path);
            return match.Path;
        }

        _logger.LogInformation("Fetching origin/{Branch}", branchName);
        var (_, fetchErr, fetchExit) = await _git.RunAsync(basePath, $"fetch origin {branchName}", ct);
        if (fetchExit != 0)
        {
            _logger.LogWarning("git fetch failed (exit {ExitCode}): {StdErr}", fetchExit, fetchErr);
        }

        var worktreeDir = Path.Combine(basePath, subfolder);
        Directory.CreateDirectory(worktreeDir);

        var sanitized = SanitizeBranchName(branchName);
        var worktreePath = Path.Combine(worktreeDir, sanitized);

        // If the directory already exists (e.g. from a previous run), pull latest and reuse
        if (Directory.Exists(worktreePath))
        {
            _logger.LogInformation("Worktree directory already exists at {Path}, pulling latest", worktreePath);
            // Ensure we're on the local branch (not detached), then pull
            await _git.RunAsync(worktreePath, $"checkout -B {branchName} origin/{branchName}", ct);
            var (_, pullErr, pullExit) = await _git.RunAsync(worktreePath, "pull --ff-only", ct);
            if (pullExit != 0)
                _logger.LogWarning("git pull in existing worktree failed: {StdErr}", pullErr);
            return worktreePath;
        }

        // Create worktree with a local tracking branch (avoids detached HEAD)
        _logger.LogInformation("Creating worktree at {Path} for branch {Branch}", worktreePath, branchName);
        var (_, addErr, addExit) = await _git.RunAsync(
            basePath,
            $"worktree add -B {branchName} \"{worktreePath}\" \"origin/{branchName}\"",
            ct);

        if (addExit != 0)
        {
            throw new InvalidOperationException(
                $"Failed to create worktree for branch '{branchName}': {addErr}");
        }

        return worktreePath;
    }

    public async Task<bool> CheckLocalChangesAsync(
        string repoPath, string branchName, CancellationToken ct = default)
    {
        var (currentBranch, _, branchExit) = await _git.RunAsync(
            repoPath, "rev-parse --abbrev-ref HEAD", ct);

        if (branchExit != 0)
            return false;

        currentBranch = currentBranch.Trim();
        if (!currentBranch.Equals(branchName, StringComparison.OrdinalIgnoreCase))
            return false;

        var (statusOut, _, statusExit) = await _git.RunAsync(
            repoPath, "status --porcelain", ct);

        if (statusExit != 0)
            return false;

        return !string.IsNullOrWhiteSpace(statusOut);
    }

    public async Task RemoveWorktreeAsync(
        string basePath, string worktreePath, CancellationToken ct = default)
    {
        _logger.LogInformation("Removing worktree at {Path}", worktreePath);

        var (_, stdErr, exitCode) = await _git.RunAsync(
            basePath, $"worktree remove \"{worktreePath}\"", ct);

        if (exitCode != 0)
        {
            throw new InvalidOperationException(
                $"Failed to remove worktree at '{worktreePath}': {stdErr}");
        }
    }

    public static string SanitizeBranchName(string branchName)
    {
        var sanitized = branchName.Replace('/', '-');
        sanitized = Regex.Replace(sanitized, @"[<>:""|?*\\]", "");
        sanitized = Regex.Replace(sanitized, @"-{2,}", "-");
        sanitized = sanitized.Trim('-', '.');
        return sanitized;
    }
}
