using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.App.ViewModels;

public partial class PRDetailViewModel : ObservableObject
{
    private readonly IGitHubService _gitHubService;
    private readonly IGitHubActionsService _actionsService;
    private readonly IGitCommandRunner _gitCommandRunner;
    private readonly ISettingsService _settingsService;

    private bool _commitsLoaded;
    private bool _filesLoaded;
    private bool _checksLoaded;
    private bool _commentsLoaded;

    public PRDetailViewModel(
        IGitHubService gitHubService,
        IGitHubActionsService actionsService,
        IGitCommandRunner gitCommandRunner,
        ISettingsService settingsService)
    {
        _gitHubService = gitHubService;
        _actionsService = actionsService;
        _gitCommandRunner = gitCommandRunner;
        _settingsService = settingsService;
    }

    // Header properties
    [ObservableProperty] private int _number;
    [ObservableProperty] private string _title = "";
    [ObservableProperty] private string _headRef = "";
    [ObservableProperty] private string _baseRef = "";
    [ObservableProperty] private string _authorLogin = "";
    [ObservableProperty] private string _authorAvatarUrl = "";
    [ObservableProperty] private string _htmlUrl = "";
    [ObservableProperty] private string _body = "";
    [ObservableProperty] private bool _isDraft;
    [ObservableProperty] private bool _hasMergeConflict;
    [ObservableProperty] private string _statusDotColor = "gray";
    [ObservableProperty] private DateTime _createdAt;
    [ObservableProperty] private string _reviewStatusText = "";
    [ObservableProperty] private string _repoOwner = "";
    [ObservableProperty] private string _repoName = "";
    [ObservableProperty] private string _age = "";

    public ObservableCollection<string> Labels { get; } = [];

    // Tab state
    [ObservableProperty] private string _activeTab = "Description";

    // Per-tab loading
    [ObservableProperty] private bool _isCommitsLoading;
    [ObservableProperty] private bool _isFilesLoading;
    [ObservableProperty] private bool _isChecksLoading;
    [ObservableProperty] private bool _isCommentsLoading;

    // Per-tab errors
    [ObservableProperty] private string _commitsError = "";
    [ObservableProperty] private string _filesError = "";
    [ObservableProperty] private string _checksError = "";
    [ObservableProperty] private string _commentsError = "";

    // Collections
    public ObservableCollection<PullRequestCommit> Commits { get; } = [];
    public ObservableCollection<PullRequestFileChange> FileChanges { get; } = [];
    public ObservableCollection<CheckRun> CheckRuns { get; } = [];
    public ObservableCollection<ClaudeReviewComment> AllComments { get; } = [];

    // Computed
    [ObservableProperty] private int _totalAdditions;
    [ObservableProperty] private int _totalDeletions;
    [ObservableProperty] private int _filesChangedCount;
    [ObservableProperty] private int _commitCount;

    // Merge readiness
    [ObservableProperty] private int _mergeScore;
    [ObservableProperty] private int _passedChecks;
    [ObservableProperty] private int _totalChecks;
    [ObservableProperty] private int _skippedChecks;
    [ObservableProperty] private int _approvalCount;

    // Readiness display booleans
    [ObservableProperty] private bool _isChecksPassing;
    [ObservableProperty] private bool _hasChecksInProgress;
    [ObservableProperty] private bool _hasApproval;
    [ObservableProperty] private bool _isConflictFree;
    [ObservableProperty] private bool _isNotDraft;
    [ObservableProperty] private string _checksReadinessDetail = "";
    [ObservableProperty] private string _checksTabLabel = "";
    [ObservableProperty] private string _approvalsReadinessDetail = "";
    [ObservableProperty] private string _conflictsReadinessDetail = "";
    [ObservableProperty] private string _draftReadinessDetail = "";

    // AI review summary
    [ObservableProperty] private int _suggestionCount;
    [ObservableProperty] private int _praiseCount;
    [ObservableProperty] private int _otherReviewCount;
    [ObservableProperty] private bool _hasAiReview;

    // Review sorting
    [ObservableProperty] private string _reviewSortMode = "Newest";
    private IReadOnlyList<ClaudeReviewComment> _unsortedComments = [];

    // Comment input
    [ObservableProperty] private string _newCommentText = "";
    [ObservableProperty] private string _reviewBody = "";

    // Toast feedback
    [ObservableProperty] private string _toastMessage = "";

    // Status
    [ObservableProperty] private bool _isPostingComment;
    [ObservableProperty] private bool _isSubmittingReview;

    // Toggle draft state
    [ObservableProperty] private bool _isTogglingDraft;

    public event Action? CloseRequested;
    public event Action? RefreshRequested;
    public event Action? RerunChecksRequested;
    public event Action? FixWithClaudeRequested;
    public event Action? ToggleDraftRequested;

    public void Initialize(PullRequestCardViewModel card)
    {
        Number = card.Number;
        Title = card.Title;
        HeadRef = card.HeadRef;
        BaseRef = card.BaseRef;
        AuthorLogin = card.AuthorLogin;
        HtmlUrl = card.HtmlUrl;
        Body = card.Body;
        IsDraft = card.IsDraft;
        HasMergeConflict = card.HasMergeConflict;
        StatusDotColor = card.StatusDotColor;
        ReviewStatusText = card.ReviewBadgeText;
        RepoOwner = card.RepoOwner;
        RepoName = card.RepoName;
        Age = card.Age;

        Labels.Clear();
        foreach (var label in card.Labels)
            Labels.Add(label);

        // Stats from card
        TotalAdditions = card.Additions;
        TotalDeletions = card.Deletions;
        FilesChangedCount = card.FilesChanged;
        CommitCount = card.CommitCount;

        // Merge readiness
        MergeScore = card.MergeScore;
        PassedChecks = card.PassedChecks;
        TotalChecks = card.TotalChecks;
        SkippedChecks = card.SkippedChecks;
        ApprovalCount = card.ApprovalCount;

        IsChecksPassing = card.StatusDotColor == "green";
        HasChecksInProgress = card.HasChecksInProgress;
        HasApproval = card.ApprovalCount >= 1;
        IsConflictFree = !card.HasMergeConflict;
        IsNotDraft = !card.IsDraft;

        var detailParts = new List<string> { $"{card.PassedChecks}/{card.TotalChecks} passing" };
        if (card.HasChecksInProgress) detailParts.Add("in progress");
        if (card.SkippedChecks > 0) detailParts.Add($"{card.SkippedChecks} skipped");
        ChecksReadinessDetail = string.Join(", ", detailParts);
        ChecksTabLabel = card.ChecksCountLabel;
        ApprovalsReadinessDetail = $"{card.ApprovalCount} approval{(card.ApprovalCount != 1 ? "s" : "")}";
        ConflictsReadinessDetail = card.HasMergeConflict ? "Has merge conflicts" : "Clean merge";
        DraftReadinessDetail = card.IsDraft ? "Still in draft" : "Ready for review";

        // AI review summary
        SuggestionCount = card.ReviewComments.Count(c => c.Severity == CommentSeverity.Suggestion);
        PraiseCount = card.ReviewComments.Count(c => c.Severity == CommentSeverity.Praise);
        OtherReviewCount = card.ReviewComments.Count(c =>
            c.Severity != CommentSeverity.Suggestion &&
            c.Severity != CommentSeverity.Praise &&
            c.Severity != CommentSeverity.Critical);
        HasAiReview = SuggestionCount > 0 || PraiseCount > 0 || OtherReviewCount > 0;

        // Seed with failed checks from card; full list loaded by LoadChecksAsync
        CheckRuns.Clear();
        foreach (var check in card.FailedCheckRuns)
            CheckRuns.Add(check);
        _checksLoaded = false;

        // Reset tab state
        _commitsLoaded = false;
        _filesLoaded = false;
        _commentsLoaded = false;
        ActiveTab = "Overview";

        // Eagerly load all tab data in parallel
        _ = LoadAllDataAsync();
    }

    private async Task LoadAllDataAsync()
    {
        await Task.WhenAll(
            LoadCommitsAsync(),
            LoadFilesAsync(),
            LoadChecksAsync(),
            LoadCommentsAsync());
    }

    [RelayCommand]
    private async Task SetTabAsync(string tabName)
    {
        ActiveTab = tabName;
        await LoadTabDataAsync(tabName);
    }

    private async Task LoadTabDataAsync(string tabName)
    {
        switch (tabName)
        {
            case "Commits" when !_commitsLoaded:
                await LoadCommitsAsync();
                break;
            case "Files" when !_filesLoaded:
                await LoadFilesAsync();
                break;
            case "Checks" when !_checksLoaded:
                await LoadChecksAsync();
                break;
            case "Comments" when !_commentsLoaded:
                await LoadCommentsAsync();
                break;
        }
    }

    private async Task LoadCommitsAsync()
    {
        IsCommitsLoading = true;
        CommitsError = "";
        try
        {
            var commits = await _gitHubService.GetPullRequestCommitsAsync(RepoOwner, RepoName, Number);
            Commits.Clear();
            foreach (var c in commits)
                Commits.Add(c);
            CommitCount = commits.Count;
            _commitsLoaded = true;
        }
        catch (Exception ex)
        {
            CommitsError = ex.Message;
        }
        finally
        {
            IsCommitsLoading = false;
        }
    }

    private async Task LoadFilesAsync()
    {
        IsFilesLoading = true;
        FilesError = "";
        try
        {
            var files = await _gitHubService.GetPullRequestFilesAsync(RepoOwner, RepoName, Number);
            FileChanges.Clear();
            var additions = 0;
            var deletions = 0;
            foreach (var f in files)
            {
                FileChanges.Add(f);
                additions += f.Additions;
                deletions += f.Deletions;
            }
            TotalAdditions = additions;
            TotalDeletions = deletions;
            FilesChangedCount = files.Count;
            _filesLoaded = true;
        }
        catch (Exception ex)
        {
            FilesError = ex.Message;
        }
        finally
        {
            IsFilesLoading = false;
        }
    }

    private async Task LoadChecksAsync()
    {
        IsChecksLoading = true;
        ChecksError = "";
        try
        {
            var suites = await _actionsService.GetCheckSuitesAsync(RepoOwner, RepoName, HeadRef);
            var allRuns = new List<CheckRun>();
            foreach (var suite in suites)
            {
                var runs = await _actionsService.GetCheckRunsAsync(RepoOwner, RepoName, suite.Id);
                allRuns.AddRange(runs);
            }

            // Deduplicate by name (keep latest), then sort: failed first, then pending, then passed
            var deduped = allRuns
                .GroupBy(r => r.Name)
                .Select(g => g.OrderByDescending(r => r.Id).First())
                .OrderBy(r => r.IsFailed ? 0 : r.IsPending ? 1 : r.IsSkipped ? 3 : 2)
                .ThenBy(r => r.Name)
                .ToList();

            CheckRuns.Clear();
            foreach (var run in deduped)
                CheckRuns.Add(run);

            var pendingCount = deduped.Count(r => r.IsPending);
            PassedChecks = deduped.Count(r => r.Conclusion == "success");
            TotalChecks = deduped.Count;
            SkippedChecks = deduped.Count(r => r.IsSkipped);
            HasChecksInProgress = pendingCount > 0;

            var parts = new List<string> { $"{PassedChecks}/{TotalChecks} passing" };
            if (pendingCount > 0) parts.Add($"{pendingCount} in progress");
            if (SkippedChecks > 0) parts.Add($"{SkippedChecks} skipped");
            ChecksReadinessDetail = string.Join(", ", parts);

            ChecksTabLabel = SkippedChecks > 0
                ? $"{PassedChecks}/{TotalChecks}, {SkippedChecks} skipped"
                : $"{PassedChecks}/{TotalChecks}";

            _checksLoaded = true;
        }
        catch (Exception ex)
        {
            ChecksError = ex.Message;
        }
        finally
        {
            IsChecksLoading = false;
        }
    }

    private async Task LoadCommentsAsync()
    {
        IsCommentsLoading = true;
        CommentsError = "";
        try
        {
            var comments = await _gitHubService.GetAllPullRequestCommentsAsync(RepoOwner, RepoName, Number);
            _unsortedComments = comments;
            ApplyReviewSort();
            _commentsLoaded = true;
        }
        catch (Exception ex)
        {
            CommentsError = ex.Message;
        }
        finally
        {
            IsCommentsLoading = false;
        }
    }

    [RelayCommand]
    private void CopyBranchName()
    {
        System.Windows.Clipboard.SetText(HeadRef);
        ShowToast("Branch name copied");
    }

    [RelayCommand]
    private void CopyPrUrl()
    {
        System.Windows.Clipboard.SetText(HtmlUrl);
        ShowToast("URL copied");
    }

    [RelayCommand]
    private void OpenInBrowser()
    {
        if (!string.IsNullOrEmpty(HtmlUrl))
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = HtmlUrl,
                UseShellExecute = true
            });
        }
    }

    [RelayCommand]
    private void Close()
    {
        CloseRequested?.Invoke();
    }

    [RelayCommand]
    private void RerunChecks()
    {
        RerunChecksRequested?.Invoke();
    }

    [RelayCommand]
    private void FixWithClaude()
    {
        FixWithClaudeRequested?.Invoke();
    }

    [RelayCommand]
    private void ToggleDraft()
    {
        ToggleDraftRequested?.Invoke();
    }

    [RelayCommand]
    private async Task CheckoutBranchAsync()
    {
        var repos = _settingsService.CurrentSettings.Repos;
        var repo = repos.FirstOrDefault(r => r.Owner == RepoOwner && r.Name == RepoName);
        var workDir = repo?.WorktreeBasePath;
        if (string.IsNullOrWhiteSpace(workDir))
        {
            ShowToast("No worktree path configured");
            return;
        }

        try
        {
            // Fetch the branch from remote first so git knows about it
            await _gitCommandRunner.RunAsync(workDir, $"fetch origin {HeadRef}");
            var result = await _gitCommandRunner.RunAsync(workDir, $"checkout {HeadRef}");
            ShowToast(result.ExitCode == 0 ? $"Checked out {HeadRef}" : $"Checkout failed: {result.StdErr.Trim()}");
        }
        catch (Exception ex)
        {
            ShowToast($"Checkout failed: {ex.Message}");
        }
    }

    [RelayCommand]
    private async Task SubmitReviewAsync(string reviewEvent)
    {
        IsSubmittingReview = true;
        try
        {
            await _gitHubService.SubmitReviewAsync(RepoOwner, RepoName, Number, reviewEvent, ReviewBody.Length > 0 ? ReviewBody : null);
            ReviewBody = "";
            ShowToast(reviewEvent == "APPROVE" ? "PR approved" : "Changes requested");
            RefreshRequested?.Invoke();
        }
        catch (Exception ex)
        {
            ShowToast($"Review failed: {ex.Message}");
        }
        finally
        {
            IsSubmittingReview = false;
        }
    }

    [RelayCommand]
    private async Task PostCommentAsync()
    {
        if (string.IsNullOrWhiteSpace(NewCommentText)) return;

        IsPostingComment = true;
        try
        {
            await _gitHubService.PostCommentAsync(RepoOwner, RepoName, Number, NewCommentText);
            NewCommentText = "";
            ShowToast("Comment posted");
            RefreshRequested?.Invoke();

            // Refresh comments
            _commentsLoaded = false;
            await LoadCommentsAsync();
        }
        catch (Exception ex)
        {
            ShowToast($"Comment failed: {ex.Message}");
        }
        finally
        {
            IsPostingComment = false;
        }
    }

    [RelayCommand]
    private void SetReviewSort(string mode)
    {
        ReviewSortMode = mode;
        ApplyReviewSort();
    }

    private void ApplyReviewSort()
    {
        IEnumerable<ClaudeReviewComment> sorted = ReviewSortMode switch
        {
            "Oldest" => _unsortedComments.OrderBy(c => c.CreatedAt),
            "Severity" => _unsortedComments.OrderBy(c => c.Severity switch
            {
                CommentSeverity.Critical => 0,
                CommentSeverity.Suggestion => 1,
                CommentSeverity.Unknown => 2,
                CommentSeverity.Praise => 3,
                _ => 4
            }).ThenByDescending(c => c.CreatedAt),
            "File" => _unsortedComments
                .OrderBy(c => c.FilePath ?? "\uffff")
                .ThenBy(c => c.LineNumber ?? int.MaxValue)
                .ThenByDescending(c => c.CreatedAt),
            _ => _unsortedComments.OrderByDescending(c => c.CreatedAt), // "Newest"
        };

        AllComments.Clear();
        foreach (var c in sorted)
            AllComments.Add(c);
    }

    private async void ShowToast(string message)
    {
        ToastMessage = message;
        await Task.Delay(2500);
        if (ToastMessage == message)
            ToastMessage = "";
    }
}
