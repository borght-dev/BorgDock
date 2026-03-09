using System.Collections.ObjectModel;
using System.Diagnostics;
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
    private readonly ILogParserService? _logParserService;
    private readonly INotificationService? _notificationService;
    private readonly IClaudeCodeLauncher? _claudeCodeLauncher;
    private readonly IWorktreeService? _worktreeService;
    private readonly IGitHubService? _gitHubService;
    private readonly IGitCommandRunner? _gitCommandRunner;

    private IReadOnlyList<PullRequestWithChecks> _previousPollResults = [];

    public MainViewModel()
    {
    }

    public MainViewModel(
        IPRPollingService pollingService,
        GitHubHttpClient? httpClient = null,
        ISettingsService? settingsService = null,
        IGitHubActionsService? actionsService = null,
        ILogParserService? logParserService = null,
        INotificationService? notificationService = null,
        IClaudeCodeLauncher? claudeCodeLauncher = null,
        IWorktreeService? worktreeService = null,
        IGitHubService? gitHubService = null,
        IGitCommandRunner? gitCommandRunner = null)
    {
        _pollingService = pollingService;
        _httpClient = httpClient;
        _settingsService = settingsService;
        _actionsService = actionsService;
        _logParserService = logParserService;
        _notificationService = notificationService;
        _claudeCodeLauncher = claudeCodeLauncher;
        _worktreeService = worktreeService;
        _gitHubService = gitHubService;
        _gitCommandRunner = gitCommandRunner;
        _pollingService.PollCompleted += OnPollCompleted;
        _pollingService.PollFailed += OnPollFailed;

        if (_httpClient is not null)
        {
            _httpClient.AuthenticationFailed += OnAuthenticationFailed;
        }

        // Cleanup old prompt files on startup
        _claudeCodeLauncher?.CleanupOldPromptFiles();
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
    private string _statusText = "Starting\u2026";

    [ObservableProperty]
    private string _repoSummaryText = "";

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

    [ObservableProperty]
    private string _searchQuery = "";

    // Filter counts
    [ObservableProperty]
    private int _totalCount;

    [ObservableProperty]
    private int _myPRsCount;

    [ObservableProperty]
    private int _failingCount;

    [ObservableProperty]
    private int _readyCount;

    public ObservableCollection<PullRequestCardViewModel> PullRequests { get; } = [];

    public ObservableCollection<RepoGroupViewModel> RepoGroups { get; } = [];

    public ObservableCollection<PullRequestCardViewModel> FilteredPullRequests { get; } = [];

    private List<PullRequestCardViewModel> _allPullRequests = [];

    [RelayCommand]
    private void ToggleSidebar()
    {
        IsSidebarVisible = !IsSidebarVisible;
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

    partial void OnSearchQueryChanged(string value)
    {
        ApplyGroupingAndFiltering();
    }

    public void ApplySidebarPreferences(UiSettings settings)
    {
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

    /// <summary>
    /// Processes poll results into the UI. Used both for live polls and cached data on startup.
    /// </summary>
    public void ProcessPollResults(IReadOnlyList<PullRequestWithChecks> results)
    {
        void UpdateUi()
        {
            var cards = results.Select(MapToCard).ToList();
            UpdatePullRequests(cards);

            var count = results.Count;
            StatusText = $"Updated {DateTime.Now:h:mm tt}";
            IsLoading = false;
            IsAuthError = false;
            UpdateRateLimitDisplay();
            UpdateRepoSummary();
        }

        if (System.Windows.Application.Current?.Dispatcher is { } dispatcher)
            dispatcher.InvokeAsync(UpdateUi);
        else
            UpdateUi();
    }

    private void OnPollCompleted(IReadOnlyList<PullRequestWithChecks> results)
    {
        // Fire notifications for state transitions (before UI update)
        try
        {
            _notificationService?.ProcessStateTransitions(_previousPollResults, results);
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to process notification state transitions");
        }
        _previousPollResults = results;

        ProcessPollResults(results);
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

    private void UpdateRepoSummary()
    {
        var repos = _settingsService?.CurrentSettings.Repos;
        if (repos is null || repos.Count == 0)
        {
            RepoSummaryText = "";
            return;
        }

        if (repos.Count == 1)
        {
            var r = repos[0];
            RepoSummaryText = $"{r.Owner}/{r.Name}";
        }
        else
        {
            RepoSummaryText = $"{repos.Count} repos";
        }
    }

    private PullRequestCardViewModel MapToCard(PullRequestWithChecks prWithChecks)
    {
        var pr = prWithChecks.PullRequest;
        var username = _settingsService?.CurrentSettings.GitHub.Username ?? "";
        var firstFailedCheck = prWithChecks.Checks.FirstOrDefault(c => c.IsFailed);
        var hasAllChecksPassed = prWithChecks.OverallStatus == "green";
        var reviewMissing = pr.ReviewStatus is ReviewStatus.None or ReviewStatus.Pending or ReviewStatus.Commented;
        var isOpen = string.Equals(pr.State, "open", StringComparison.OrdinalIgnoreCase);
        var canBypassMerge = isOpen
            && !pr.IsDraft
            && hasAllChecksPassed
            && pr.Mergeable != false
            && reviewMissing;
        var (reviewText, reviewColor) = FormatReviewBadge(pr.ReviewStatus, pr.IsDraft);
        var card = new PullRequestCardViewModel
        {
            Number = pr.Number,
            Title = pr.Title,
            HeadRef = pr.HeadRef,
            BaseRef = pr.BaseRef,
            AuthorLogin = pr.AuthorLogin,
            Age = PullRequestCardViewModel.FormatAge(pr.UpdatedAt),
            StatusDotColor = pr.IsDraft ? "gray" : prWithChecks.OverallStatus,
            HtmlUrl = pr.HtmlUrl,
            Body = pr.Body,
            RepoOwner = pr.RepoOwner,
            RepoName = pr.RepoName,
            UpdatedAt = pr.UpdatedAt,
            HasMergeConflict = pr.Mergeable == false,
            IsDraft = pr.IsDraft,
            CommentCount = pr.CommentCount,
            IsMyPr = !string.IsNullOrEmpty(username)
                && pr.AuthorLogin.Equals(username, StringComparison.OrdinalIgnoreCase),
            CheckSummary = FormatCheckSummary(prWithChecks),
            ReviewBadgeText = reviewText,
            ReviewBadgeColor = reviewColor,
            FirstFailedRunId = firstFailedCheck?.CheckSuiteId ?? 0,
            HasAllChecksPassed = hasAllChecksPassed,
            CanBypassMerge = canBypassMerge,
            FailedCheckRuns = prWithChecks.Checks.Where(c => c.IsFailed).ToList(),
            RerunRequested = OnRerunRequested,
            FixWithClaudeRequested = OnFixWithClaudeRequested,
            BypassMergeRequested = OnBypassMergeRequested,
            DetailExpandRequested = OnDetailExpandRequested,
            OpenDetailViewRequested = OnOpenDetailViewRequested,
            CheckoutRequested = OnCheckoutRequested
        };

        foreach (var name in prWithChecks.FailedCheckNames)
            card.FailedChecks.Add(name);

        foreach (var name in prWithChecks.PendingCheckNames)
            card.PendingChecks.Add(name);

        card.Additions = prWithChecks.PullRequest.Additions;
        card.Deletions = prWithChecks.PullRequest.Deletions;
        card.FilesChanged = prWithChecks.PullRequest.ChangedFiles;
        card.CommitCount = prWithChecks.PullRequest.CommitCount;
        card.PassedChecks = prWithChecks.PassedCount;
        card.TotalChecks = prWithChecks.Checks.Count;
        card.AuthorInitials = PullRequestCardViewModel.ComputeInitials(prWithChecks.PullRequest.AuthorLogin);

        // Labels
        card.Labels.Clear();
        foreach (var label in prWithChecks.PullRequest.Labels)
            card.Labels.Add(label);

        // Approval count - derive from review status
        card.ApprovalCount = prWithChecks.PullRequest.ReviewStatus == PRDock.App.Models.ReviewStatus.Approved ? 1 : 0;

        card.ComputeMergeScore();

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

    private async void OnFixWithClaudeRequested(PullRequestCardViewModel card)
    {
        if (_claudeCodeLauncher is null || _actionsService is null || _worktreeService is null)
        {
            StatusText = $"Fix with Claude not available — missing services";
            return;
        }

        var repo = _settingsService?.CurrentSettings.Repos
            .FirstOrDefault(r => r.Owner == card.RepoOwner && r.Name == card.RepoName);
        if (repo is null || string.IsNullOrWhiteSpace(repo.WorktreeBasePath))
        {
            StatusText = $"Configure worktree base path for {card.RepoOwner}/{card.RepoName} in settings first";
            return;
        }

        try
        {
            StatusText = $"Preparing Claude fix for PR #{card.Number}...";

            // Ensure check details are loaded
            if (!card.HasCheckDetailLoaded)
                await LoadCheckDetailsAsync(card);

            // Find or create worktree
            var worktreePath = await _worktreeService.FindOrCreateWorktreeAsync(
                repo.WorktreeBasePath, repo.WorktreeSubfolder, card.HeadRef);

            // Get changed files
            var changedFiles = await _actionsService.GetPullRequestFilesAsync(
                card.RepoOwner, card.RepoName, card.Number);

            // Get raw log from first failed run
            var rawLog = "";
            var firstFailedRun = card.FailedCheckRuns.FirstOrDefault();
            if (firstFailedRun is not null)
            {
                try
                {
                    var jobs = await _actionsService.GetWorkflowJobsAsync(
                        card.RepoOwner, card.RepoName, firstFailedRun.CheckSuiteId);
                    var failedJob = jobs.FirstOrDefault(j => j.Conclusion == "failure");
                    if (failedJob is not null)
                        rawLog = await _actionsService.GetJobLogAsync(
                            card.RepoOwner, card.RepoName, failedJob.Id);
                }
                catch (Exception ex)
                {
                    Serilog.Log.Warning(ex, "Failed to fetch raw log for Claude fix");
                }
            }

            var pr = new PullRequest
            {
                Number = card.Number,
                Title = card.Title,
                HeadRef = card.HeadRef,
                BaseRef = card.BaseRef,
                AuthorLogin = card.AuthorLogin,
                HtmlUrl = card.HtmlUrl,
                RepoOwner = card.RepoOwner,
                RepoName = card.RepoName
            };

            var checkName = card.FailedChecks.FirstOrDefault() ?? "unknown";
            await _claudeCodeLauncher.LaunchFixAsync(
                pr, checkName, card.ParsedErrors.ToList(), changedFiles.ToList(),
                rawLog, worktreePath, repo);

            StatusText = $"Claude Code launched for PR #{card.Number}";
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to launch Claude fix for PR #{Number}", card.Number);
            StatusText = $"Failed to launch Claude fix: {ex.Message}";
        }
    }

    private async void OnDetailExpandRequested(PullRequestCardViewModel card)
    {
        // Load check details (log parsing) if there are failed checks
        if (!card.HasCheckDetailLoaded && !card.IsCheckDetailLoading && card.FailedCheckRuns.Count > 0)
            await LoadCheckDetailsAsync(card);

        // Load Claude review comments
        if (!card.HasReviewLoaded && !card.IsReviewLoading)
            await LoadReviewCommentsAsync(card);
    }

    private async Task LoadCheckDetailsAsync(PullRequestCardViewModel card)
    {
        if (_actionsService is null || _logParserService is null)
            return;

        card.IsCheckDetailLoading = true;
        card.CheckDetailError = "";

        try
        {
            var changedFiles = await _actionsService.GetPullRequestFilesAsync(
                card.RepoOwner, card.RepoName, card.Number);

            foreach (var failedCheck in card.FailedCheckRuns)
            {
                try
                {
                    var jobs = await _actionsService.GetWorkflowJobsAsync(
                        card.RepoOwner, card.RepoName, failedCheck.CheckSuiteId);
                    var failedJob = jobs.FirstOrDefault(j => j.Conclusion == "failure");
                    if (failedJob is null) continue;

                    var log = await _actionsService.GetJobLogAsync(
                        card.RepoOwner, card.RepoName, failedJob.Id);
                    var errors = _logParserService.Parse(log, changedFiles.ToList());

                    void AddErrors()
                    {
                        foreach (var error in errors)
                            card.ParsedErrors.Add(error);
                    }

                    if (System.Windows.Application.Current?.Dispatcher is { } dispatcher)
                        await dispatcher.InvokeAsync(AddErrors);
                    else
                        AddErrors();
                }
                catch (Exception ex)
                {
                    Serilog.Log.Warning(ex, "Failed to fetch log for check {Check}", failedCheck.Name);
                }
            }

            card.HasCheckDetailLoaded = true;
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to load check details for PR #{Number}", card.Number);
            card.CheckDetailError = ex.Message;
        }
        finally
        {
            card.IsCheckDetailLoading = false;
        }
    }

    private async Task LoadReviewCommentsAsync(PullRequestCardViewModel card)
    {
        if (_gitHubService is null)
            return;

        card.IsReviewLoading = true;

        try
        {
            var botUsername = _settingsService?.CurrentSettings.ClaudeReview.BotUsername ?? "claude[bot]";
            var comments = await _gitHubService.GetPullRequestReviewCommentsAsync(
                card.RepoOwner, card.RepoName, card.Number, botUsername);

            if (comments.Count > 0)
            {
                void AddComments()
                {
                    card.ReviewComments.Clear();
                    foreach (var comment in comments)
                        card.ReviewComments.Add(comment);

                    // Build summary text
                    var critical = comments.Count(c => c.Severity == CommentSeverity.Critical);
                    var suggestions = comments.Count(c => c.Severity == CommentSeverity.Suggestion);
                    var praise = comments.Count(c => c.Severity == CommentSeverity.Praise);
                    var other = comments.Count - critical - suggestions - praise;

                    var parts = new List<string>();
                    if (critical > 0) parts.Add($"{critical} critical");
                    if (suggestions > 0) parts.Add($"{suggestions} suggestion{(suggestions == 1 ? "" : "s")}");
                    if (praise > 0) parts.Add($"{praise} praise");
                    if (other > 0) parts.Add($"{other} other");

                    card.ReviewSummaryText = parts.Count > 0
                        ? "\U0001F916 " + string.Join(" \u00B7 ", parts)
                        : "";
                }

                if (System.Windows.Application.Current?.Dispatcher is { } dispatcher)
                    await dispatcher.InvokeAsync(AddComments);
                else
                    AddComments();
            }

            card.HasReviewLoaded = true;
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to load review comments for PR #{Number}", card.Number);
        }
        finally
        {
            card.IsReviewLoading = false;
        }
    }

    private void OnOpenDetailViewRequested(PullRequestCardViewModel card)
    {
        OpenPRDetailRequested?.Invoke(card);
    }

    private async void OnCheckoutRequested(PullRequestCardViewModel card)
    {
        if (_gitCommandRunner is null || _settingsService is null) return;

        var repo = _settingsService.CurrentSettings.Repos
            .FirstOrDefault(r => r.Owner == card.RepoOwner && r.Name == card.RepoName);
        var workDir = repo?.WorktreeBasePath;
        if (string.IsNullOrWhiteSpace(workDir))
        {
            StatusText = "No worktree path configured for this repo";
            return;
        }

        try
        {
            StatusText = $"Checking out {card.HeadRef}...";
            await _gitCommandRunner.RunAsync(workDir, $"fetch origin {card.HeadRef}");
            var result = await _gitCommandRunner.RunAsync(workDir, $"checkout {card.HeadRef}");
            StatusText = result.ExitCode == 0
                ? $"Checked out {card.HeadRef}"
                : $"Checkout failed: {result.StdErr.Trim()}";
        }
        catch (Exception ex)
        {
            StatusText = $"Checkout failed: {ex.Message}";
        }
    }

    private void OnBypassMergeRequested(PullRequestCardViewModel card)
    {
        if (card.Number <= 0 || string.IsNullOrWhiteSpace(card.RepoOwner) || string.IsNullOrWhiteSpace(card.RepoName))
            return;

        try
        {
            StatusText = $"Running admin bypass merge for PR #{card.Number}...";

            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "gh",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                }
            };

            process.StartInfo.ArgumentList.Add("pr");
            process.StartInfo.ArgumentList.Add("merge");
            process.StartInfo.ArgumentList.Add(card.Number.ToString());
            process.StartInfo.ArgumentList.Add("--repo");
            process.StartInfo.ArgumentList.Add($"{card.RepoOwner}/{card.RepoName}");
            process.StartInfo.ArgumentList.Add("--admin");
            process.StartInfo.ArgumentList.Add("--merge");

            process.Start();
            var stdOutTask = process.StandardOutput.ReadToEndAsync();
            var stdErrTask = process.StandardError.ReadToEndAsync();
            process.WaitForExit();

            var stdOut = stdOutTask.GetAwaiter().GetResult().Trim();
            var stdErr = stdErrTask.GetAwaiter().GetResult().Trim();

            if (process.ExitCode == 0)
            {
                StatusText = $"Merged PR #{card.Number} with admin bypass";
                return;
            }

            var details = !string.IsNullOrWhiteSpace(stdErr) ? stdErr : stdOut;
            if (details.Length > 140)
                details = details[..140] + "...";

            StatusText = string.IsNullOrWhiteSpace(details)
                ? $"Bypass merge failed for PR #{card.Number}"
                : $"Bypass merge failed for PR #{card.Number}: {details}";
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to bypass merge for PR #{Number}", card.Number);
            StatusText = $"Bypass merge failed for PR #{card.Number}: {ex.Message}";
        }
    }

    internal static (string Text, string Color) FormatReviewBadge(ReviewStatus status, bool isDraft)
    {
        if (isDraft)
            return ("", "gray");

        return status switch
        {
            ReviewStatus.Approved => ("\u2713 Approved", "green"),
            ReviewStatus.ChangesRequested => ("\u2717 Changes requested", "red"),
            ReviewStatus.Commented => ("Commented", "gray"),
            ReviewStatus.Pending or ReviewStatus.None => ("Review required", "yellow"),
            _ => ("", "gray"),
        };
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

    [RelayCommand]
    private void ManageWorktrees()
    {
        if (_worktreeService is null || _settingsService is null)
        {
            StatusText = "Worktree management not available";
            return;
        }

        ManageWorktreesRequested?.Invoke();
    }

    public event Action? ManageWorktreesRequested;
    public event Action<PullRequestCardViewModel>? OpenPRDetailRequested;

    internal void ApplyGroupingAndFiltering()
    {
        var filtered = ActiveFilter switch
        {
            "My PRs" => _allPullRequests.Where(pr => pr.IsMyPr),
            "Failing" => _allPullRequests.Where(pr => pr.StatusDotColor == "red"),
            "Ready" => _allPullRequests.Where(pr => pr.StatusDotColor == "green" && !pr.IsDraft && !pr.HasMergeConflict && pr.HasAllChecksPassed),
            "Reviewing" => _allPullRequests.Where(pr => !string.IsNullOrEmpty(pr.ReviewBadgeColor) && pr.ReviewBadgeColor != "gray"),
            _ => _allPullRequests.AsEnumerable()
        };

        // Apply search filter
        var filteredList = filtered.ToList();
        if (!string.IsNullOrWhiteSpace(SearchQuery))
        {
            var q = SearchQuery.ToLowerInvariant();
            filteredList = filteredList.Where(p =>
                p.Title.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                p.Number.ToString().Contains(q) ||
                p.AuthorLogin.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                p.Labels.Any(l => l.Contains(q, StringComparison.OrdinalIgnoreCase)))
                .ToList();
        }

        var groups = filteredList.AsEnumerable()
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

        // Populate flat filtered list for the new row-based UI
        FilteredPullRequests.Clear();
        foreach (var group in RepoGroups)
        {
            foreach (var pr in group.PullRequests)
            {
                FilteredPullRequests.Add(pr);
            }
        }

        // Update filter counts
        TotalCount = _allPullRequests.Count;
        MyPRsCount = _allPullRequests.Count(p => p.IsMyPr);
        FailingCount = _allPullRequests.Count(p => p.StatusDotColor == "red");
        ReadyCount = _allPullRequests.Count(p => p.StatusDotColor == "green" && !p.IsDraft && !p.HasMergeConflict && p.HasAllChecksPassed);
    }

}
