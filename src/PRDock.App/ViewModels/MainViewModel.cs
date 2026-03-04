using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.App.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly IPRPollingService? _pollingService;

    public MainViewModel()
    {
    }

    public MainViewModel(IPRPollingService pollingService)
    {
        _pollingService = pollingService;
        _pollingService.PollCompleted += OnPollCompleted;
        _pollingService.PollFailed += OnPollFailed;
    }

    [RelayCommand]
    private async Task PollNowAsync()
    {
        if (_pollingService is null) return;

        IsLoading = true;
        try
        {
            await _pollingService.PollNowAsync();
        }
        finally
        {
            IsLoading = false;
        }
    }

    [ObservableProperty]
    private bool _isSidebarVisible = true;

    [ObservableProperty]
    private bool _isPinned = true;

    [ObservableProperty]
    private string _statusText = "PRDock \u2014 0 open PRs";

    [ObservableProperty]
    private string _sidebarMode = "pinned";

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string _activeFilter = "All";

    public ObservableCollection<PullRequestCardViewModel> PullRequests { get; } = [];

    public ObservableCollection<RepoGroupViewModel> RepoGroups { get; } = [];

    private List<PullRequestCardViewModel> _allPullRequests = [];

    [RelayCommand]
    private void ToggleSidebar()
    {
        IsSidebarVisible = !IsSidebarVisible;
    }

    [RelayCommand]
    private void TogglePin()
    {
        IsPinned = !IsPinned;
        SidebarMode = IsPinned ? "pinned" : "autohide";
    }

    [RelayCommand]
    private void MinimizeToBadge()
    {
        IsSidebarVisible = false;
    }

    [RelayCommand]
    private void OpenSettings()
    {
        // Placeholder — settings UI not yet implemented.
    }

    [RelayCommand]
    private void SetFilter(string filter)
    {
        ActiveFilter = filter;
        ApplyGroupingAndFiltering();
    }

    public void UpdatePullRequests(IEnumerable<PullRequestCardViewModel> prs)
    {
        _allPullRequests = prs.ToList();
        ApplyGroupingAndFiltering();
    }

    private void OnPollCompleted(IReadOnlyList<PullRequestWithChecks> results)
    {
        void UpdateUi()
        {
            var cards = results.Select(MapToCard).ToList();
            UpdatePullRequests(cards);

            var count = results.Count;
            StatusText = $"PRDock \u2014 {count} open PR{(count == 1 ? "" : "s")}";
            IsLoading = false;
        }

        if (System.Windows.Application.Current?.Dispatcher is { } dispatcher)
            dispatcher.InvokeAsync(UpdateUi);
        else
            UpdateUi();
    }

    private void OnPollFailed(Exception ex)
    {
        void UpdateUi()
        {
            StatusText = $"Poll failed: {ex.Message}";
            IsLoading = false;
        }

        if (System.Windows.Application.Current?.Dispatcher is { } dispatcher)
            dispatcher.InvokeAsync(UpdateUi);
        else
            UpdateUi();
    }

    private static PullRequestCardViewModel MapToCard(PullRequestWithChecks prWithChecks)
    {
        var pr = prWithChecks.PullRequest;
        var card = new PullRequestCardViewModel
        {
            Number = pr.Number,
            Title = pr.Title,
            HeadRef = pr.HeadRef,
            BaseRef = pr.BaseRef,
            AuthorLogin = pr.AuthorLogin,
            Age = PullRequestCardViewModel.FormatAge(pr.UpdatedAt),
            StatusDotColor = prWithChecks.OverallStatus,
            HtmlUrl = pr.HtmlUrl,
            RepoOwner = pr.RepoOwner,
            RepoName = pr.RepoName,
            UpdatedAt = pr.UpdatedAt,
            HasMergeConflict = pr.Mergeable == false,
            CheckSummary = FormatCheckSummary(prWithChecks),
            ReviewBadgeText = pr.ReviewStatus.ToString()
        };

        foreach (var name in prWithChecks.FailedCheckNames)
            card.FailedChecks.Add(name);

        foreach (var name in prWithChecks.PendingCheckNames)
            card.PendingChecks.Add(name);

        return card;
    }

    private static string FormatCheckSummary(PullRequestWithChecks prWithChecks)
    {
        if (prWithChecks.Checks.Count == 0) return "No checks";

        var passed = prWithChecks.PassedCount;
        var failed = prWithChecks.FailedCheckNames.Count;
        var pending = prWithChecks.PendingCheckNames.Count;
        var total = prWithChecks.Checks.Count;

        if (failed > 0) return $"{failed}/{total} failed";
        if (pending > 0) return $"{pending}/{total} pending";
        return $"{passed}/{total} passed";
    }

    internal void ApplyGroupingAndFiltering()
    {
        var filtered = ActiveFilter switch
        {
            "My PRs" => _allPullRequests.Where(pr => pr.IsMyPr),
            "Failing" => _allPullRequests.Where(pr => pr.StatusDotColor == "red"),
            _ => _allPullRequests.AsEnumerable()
        };

        var groups = filtered
            .GroupBy(pr => $"{pr.RepoOwner}/{pr.RepoName}")
            .OrderByDescending(g => g.Any(pr => pr.IsMyPr))
            .ThenBy(g => g.Key)
            .Select(g =>
            {
                var group = new RepoGroupViewModel
                {
                    RepoFullName = g.Key,
                    PrCount = g.Count()
                };

                var sorted = g
                    .OrderByDescending(pr => pr.IsMyPr)
                    .ThenByDescending(pr => pr.UpdatedAt);

                foreach (var pr in sorted)
                    group.PullRequests.Add(pr);

                return group;
            })
            .ToList();

        RepoGroups.Clear();
        foreach (var group in groups)
            RepoGroups.Add(group);
    }
}
