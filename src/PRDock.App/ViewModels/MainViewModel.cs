using System.Collections.ObjectModel;
using System.Net.Http;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Infrastructure;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.App.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly IPRPollingService? _pollingService;
    private readonly GitHubHttpClient? _httpClient;
    private readonly ISettingsService? _settingsService;
    private readonly IGitHubActionsService? _actionsService;

    public MainViewModel()
    {
    }

    public MainViewModel(
        IPRPollingService pollingService,
        GitHubHttpClient? httpClient = null,
        ISettingsService? settingsService = null,
        IGitHubActionsService? actionsService = null)
    {
        _pollingService = pollingService;
        _httpClient = httpClient;
        _settingsService = settingsService;
        _actionsService = actionsService;
        _pollingService.PollCompleted += OnPollCompleted;
        _pollingService.PollFailed += OnPollFailed;

        if (_httpClient is not null)
        {
            _httpClient.AuthenticationFailed += OnAuthenticationFailed;
        }
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

    [ObservableProperty]
    private string _rateLimitText = "";

    [ObservableProperty]
    private bool _isRateLimitWarning;

    [ObservableProperty]
    private bool _isAuthError;

    [ObservableProperty]
    private bool _isSettingsOpen;

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
        IsSettingsOpen = !IsSettingsOpen;
    }

    [RelayCommand]
    private void SetFilter(string filter)
    {
        ActiveFilter = filter;
        ApplyGroupingAndFiltering();
    }

    public void UpdatePullRequests(IEnumerable<PullRequestCardViewModel> prs)
    {
        var newPrs = prs.ToList();
        DetectClosedPrs(newPrs);

        _previouslyKnownPrs.Clear();
        foreach (var pr in newPrs)
            _previouslyKnownPrs[PrKey(pr)] = pr;

        _allPullRequests = newPrs;
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
            IsAuthError = false;
            UpdateRateLimitDisplay();
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
            StatusText = ex switch
            {
                HttpRequestException { StatusCode: System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden }
                    => "Authentication failed. Please re-authenticate.",
                HttpRequestException
                    => $"Network error: {ex.Message}",
                _
                    => $"Poll failed: {ex.Message}"
            };
            IsLoading = false;
            UpdateRateLimitDisplay();
        }

        if (System.Windows.Application.Current?.Dispatcher is { } dispatcher)
            dispatcher.InvokeAsync(UpdateUi);
        else
            UpdateUi();
    }

    private void OnAuthenticationFailed()
    {
        void UpdateUi()
        {
            IsAuthError = true;
            StatusText = "Authentication failed. Please re-authenticate.";
        }

        if (System.Windows.Application.Current?.Dispatcher is { } dispatcher)
            dispatcher.InvokeAsync(UpdateUi);
        else
            UpdateUi();
    }

    private void UpdateRateLimitDisplay()
    {
        if (_httpClient is null || _httpClient.RateLimitRemaining < 0)
        {
            RateLimitText = "";
            IsRateLimitWarning = false;
            return;
        }

        var remaining = _httpClient.RateLimitRemaining;
        var total = _httpClient.RateLimitTotal;
        RateLimitText = total > 0 ? $"API: {remaining}/{total}" : $"API: {remaining} left";
        IsRateLimitWarning = _httpClient.IsRateLimitLow;
    }

    private PullRequestCardViewModel MapToCard(PullRequestWithChecks prWithChecks)
    {
        var pr = prWithChecks.PullRequest;
        var username = _settingsService?.CurrentSettings.GitHub.Username ?? "";
        var firstFailedCheck = prWithChecks.Checks.FirstOrDefault(c => c.IsFailed);
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
            IsMyPr = !string.IsNullOrEmpty(username)
                && pr.AuthorLogin.Equals(username, StringComparison.OrdinalIgnoreCase),
            CheckSummary = FormatCheckSummary(prWithChecks),
            ReviewBadgeText = pr.ReviewStatus.ToString(),
            FirstFailedRunId = firstFailedCheck?.CheckSuiteId ?? 0,
            RerunRequested = OnRerunRequested,
            FixWithClaudeRequested = OnFixWithClaudeRequested
        };

        foreach (var name in prWithChecks.FailedCheckNames)
            card.FailedChecks.Add(name);

        foreach (var name in prWithChecks.PendingCheckNames)
            card.PendingChecks.Add(name);

        return card;
    }

    private async void OnRerunRequested(PullRequestCardViewModel card)
    {
        if (_actionsService is null || card.FirstFailedRunId == 0) return;

        try
        {
            Serilog.Log.Information("Re-running checks for {Owner}/{Repo} PR #{Number}, runId={RunId}",
                card.RepoOwner, card.RepoName, card.Number, card.FirstFailedRunId);
            await _actionsService.ReRunWorkflowAsync(card.RepoOwner, card.RepoName, card.FirstFailedRunId);
            StatusText = $"Re-run triggered for PR #{card.Number}";
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to re-run checks for PR #{Number}", card.Number);
            StatusText = $"Failed to re-run: {ex.Message}";
        }
    }

    private void OnFixWithClaudeRequested(PullRequestCardViewModel card)
    {
        Serilog.Log.Information("Fix with Claude requested for {Owner}/{Repo} PR #{Number}",
            card.RepoOwner, card.RepoName, card.Number);
        StatusText = $"Fix with Claude requested for PR #{card.Number} (coming soon)";
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

        // Add "Recently Closed" group at the bottom when filter is "All"
        if (ActiveFilter == "All" && _recentlyClosedPrs.Count > 0)
        {
            var closedGroup = new RepoGroupViewModel
            {
                RepoFullName = "Recently Closed",
                PrCount = _recentlyClosedPrs.Count,
                IsRecentlyClosed = true
            };

            foreach (var pr in _recentlyClosedPrs.OrderByDescending(p => p.ClosedAt))
                closedGroup.PullRequests.Add(pr);

            groups.Add(closedGroup);
        }

        RepoGroups.Clear();
        foreach (var group in groups)
            RepoGroups.Add(group);
    }
}
