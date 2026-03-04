using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.App.ViewModels;

public partial class WorktreeItemViewModel : ObservableObject
{
    [ObservableProperty]
    private bool _isSelected;

    [ObservableProperty]
    private string _branchName = "";

    [ObservableProperty]
    private string _worktreePath = "";

    [ObservableProperty]
    private string _repoDisplayName = "";

    [ObservableProperty]
    private string _prStatus = "Unknown";

    [ObservableProperty]
    private bool _isRemoved;

    [ObservableProperty]
    private string _removalError = "";

    /// <summary>
    /// The base path of the repo this worktree belongs to (needed for git worktree remove).
    /// </summary>
    public string RepoBasePath { get; set; } = "";
}

public partial class WorktreePruneViewModel : ObservableObject
{
    private readonly IWorktreeService _worktreeService;
    private readonly IGitHubService _gitHubService;
    private readonly ISettingsService _settingsService;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private bool _isRemoving;

    [ObservableProperty]
    private int _removedCount;

    [ObservableProperty]
    private int _totalToRemove;

    [ObservableProperty]
    private string _statusMessage = "";

    public ObservableCollection<WorktreeItemViewModel> Worktrees { get; } = [];

    public bool HasSelectedItems => Worktrees.Any(w => w.IsSelected && !w.IsRemoved);

    public WorktreePruneViewModel(
        IWorktreeService worktreeService,
        IGitHubService gitHubService,
        ISettingsService settingsService)
    {
        _worktreeService = worktreeService;
        _gitHubService = gitHubService;
        _settingsService = settingsService;
    }

    [RelayCommand]
    private async Task LoadWorktreesAsync(CancellationToken ct)
    {
        IsLoading = true;
        StatusMessage = "Discovering worktrees...";
        Worktrees.Clear();

        try
        {
            var repos = _settingsService.CurrentSettings.Repos
                .Where(r => r.Enabled && !string.IsNullOrWhiteSpace(r.WorktreeBasePath))
                .ToList();

            // Discover worktrees and fetch PRs in parallel per repo
            foreach (var repo in repos)
            {
                List<WorktreeInfo> worktrees;
                try
                {
                    worktrees = await _worktreeService.DiscoverWorktreesAsync(repo.WorktreeBasePath, ct);
                }
                catch
                {
                    continue;
                }

                IReadOnlyList<PullRequest> openPrs;
                try
                {
                    openPrs = await _gitHubService.GetOpenPullRequestsAsync(repo.Owner, repo.Name, ct);
                }
                catch
                {
                    openPrs = [];
                }

                var repoDisplay = $"{repo.Owner}/{repo.Name}";

                foreach (var wt in worktrees)
                {
                    if (wt.IsMainWorktree) continue;

                    var prStatus = ResolvePrStatus(wt.BranchName, openPrs);

                    var item = new WorktreeItemViewModel
                    {
                        BranchName = wt.BranchName,
                        WorktreePath = wt.Path,
                        RepoDisplayName = repoDisplay,
                        RepoBasePath = repo.WorktreeBasePath,
                        PrStatus = prStatus,
                        IsSelected = prStatus.Contains("Merged") || prStatus.Contains("Closed")
                    };

                    item.PropertyChanged += (_, e) =>
                    {
                        if (e.PropertyName == nameof(WorktreeItemViewModel.IsSelected))
                            OnPropertyChanged(nameof(HasSelectedItems));
                    };

                    Worktrees.Add(item);
                }
            }

            StatusMessage = Worktrees.Count == 0
                ? "No worktrees found."
                : $"Found {Worktrees.Count} worktree(s).";
        }
        finally
        {
            IsLoading = false;
            OnPropertyChanged(nameof(HasSelectedItems));
        }
    }

    [RelayCommand(CanExecute = nameof(HasSelectedItems))]
    private async Task RemoveSelectedAsync(CancellationToken ct)
    {
        var toRemove = Worktrees.Where(w => w.IsSelected && !w.IsRemoved).ToList();
        if (toRemove.Count == 0) return;

        IsRemoving = true;
        RemovedCount = 0;
        TotalToRemove = toRemove.Count;
        StatusMessage = $"Removing 0/{TotalToRemove}...";

        try
        {
            foreach (var item in toRemove)
            {
                ct.ThrowIfCancellationRequested();

                try
                {
                    await _worktreeService.RemoveWorktreeAsync(item.RepoBasePath, item.WorktreePath, ct);
                    item.IsRemoved = true;
                    item.IsSelected = false;
                }
                catch (Exception ex)
                {
                    item.RemovalError = ex.Message;
                }

                RemovedCount++;
                StatusMessage = $"Removing {RemovedCount}/{TotalToRemove}...";
            }

            var successCount = toRemove.Count(w => w.IsRemoved);
            var failCount = toRemove.Count - successCount;

            StatusMessage = failCount == 0
                ? $"Removed {successCount} worktree(s)."
                : $"Removed {successCount}, failed {failCount}.";
        }
        finally
        {
            IsRemoving = false;
            OnPropertyChanged(nameof(HasSelectedItems));
        }
    }

    [RelayCommand]
    private void SelectAll()
    {
        foreach (var item in Worktrees)
            if (!item.IsRemoved) item.IsSelected = true;
    }

    [RelayCommand]
    private void SelectNone()
    {
        foreach (var item in Worktrees)
            item.IsSelected = false;
    }

    internal static string ResolvePrStatus(string branchName, IReadOnlyList<PullRequest> openPrs)
    {
        if (string.IsNullOrWhiteSpace(branchName))
            return "Unknown";

        var matchingPr = openPrs.FirstOrDefault(pr =>
            pr.HeadRef.Equals(branchName, StringComparison.OrdinalIgnoreCase));

        if (matchingPr is not null)
            return $"PR #{matchingPr.Number} -- Open";

        // If no open PR matches, we can't determine if it was merged or closed
        // without additional API calls. Mark as "No open PR".
        return "No open PR";
    }
}
