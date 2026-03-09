using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;

namespace PRDock.App.ViewModels;

public partial class PullRequestCardViewModel : ObservableObject
{
    [ObservableProperty]
    private int _number;

    [ObservableProperty]
    private string _title = "";

    [ObservableProperty]
    private string _headRef = "";

    [ObservableProperty]
    private string _baseRef = "";

    [ObservableProperty]
    private string _authorLogin = "";

    [ObservableProperty]
    private string _age = "";

    [ObservableProperty]
    private string _statusDotColor = "gray";

    [ObservableProperty]
    private bool _isMyPr;

    [ObservableProperty]
    private string _checkSummary = "";

    [ObservableProperty]
    private string _reviewBadgeText = "";

    [ObservableProperty]
    private string _reviewBadgeColor = "gray";

    [ObservableProperty]
    private bool _isDraft;

    [ObservableProperty]
    private int _commentCount;

    [ObservableProperty]
    private bool _hasMergeConflict;

    [ObservableProperty]
    private string _htmlUrl = "";

    [ObservableProperty]
    private string _body = "";

    [ObservableProperty]
    private DateTime _updatedAt;

    [ObservableProperty]
    private string _repoOwner = "";

    [ObservableProperty]
    private string _repoName = "";

    [ObservableProperty]
    private long _firstFailedRunId;

    [ObservableProperty]
    private bool _hasAllChecksPassed;

    [ObservableProperty]
    private bool _canBypassMerge;

    [ObservableProperty]
    private bool _isCheckDetailLoading;

    [ObservableProperty]
    private bool _hasCheckDetailLoaded;

    [ObservableProperty]
    private string _checkDetailError = "";

    [ObservableProperty]
    private bool _isReviewLoading;

    [ObservableProperty]
    private bool _hasReviewLoaded;

    /// <summary>
    /// The failed check runs with their IDs, for log fetching.
    /// </summary>
    public List<CheckRun> FailedCheckRuns { get; set; } = [];

    public ObservableCollection<ParsedError> ParsedErrors { get; } = [];

    public ObservableCollection<ClaudeReviewComment> ReviewComments { get; } = [];

    [ObservableProperty]
    private string _reviewSummaryText = "";

    public ObservableCollection<string> FailedChecks { get; } = [];

    public ObservableCollection<string> PendingChecks { get; } = [];

    public Action<PullRequestCardViewModel>? RerunRequested { get; set; }
    public Action<PullRequestCardViewModel>? FixWithClaudeRequested { get; set; }
    public Action<PullRequestCardViewModel>? BypassMergeRequested { get; set; }
    public Action<PullRequestCardViewModel>? DetailExpandRequested { get; set; }
    public Action<PullRequestCardViewModel>? OpenDetailViewRequested { get; set; }
    public Action<PullRequestCardViewModel>? CheckoutRequested { get; set; }

    [RelayCommand]
    private void RerunFailedChecks()
    {
        RerunRequested?.Invoke(this);
    }

    [RelayCommand]
    private void FixWithClaude()
    {
        FixWithClaudeRequested?.Invoke(this);
    }

    [RelayCommand]
    private void OpenDetailView()
    {
        OpenDetailViewRequested?.Invoke(this);
    }

    [RelayCommand]
    private void BypassMerge()
    {
        BypassMergeRequested?.Invoke(this);
    }

    [RelayCommand]
    private void CopyBranchName()
    {
        System.Windows.Clipboard.SetText(HeadRef);
    }

    [RelayCommand]
    private void CopyPrUrl()
    {
        System.Windows.Clipboard.SetText(HtmlUrl);
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
    private void CheckoutBranch()
    {
        CheckoutRequested?.Invoke(this);
    }

    public static string FormatAge(DateTime updatedAt)
    {
        var elapsed = DateTime.UtcNow - updatedAt;

        if (elapsed.TotalSeconds < 60)
            return "just now";

        if (elapsed.TotalMinutes < 60)
            return $"{(int)elapsed.TotalMinutes}m ago";

        if (elapsed.TotalHours < 24)
            return $"{(int)elapsed.TotalHours}h ago";

        if (elapsed.TotalDays < 14)
            return $"{(int)elapsed.TotalDays}d ago";

        return $"{(int)(elapsed.TotalDays / 7)}w ago";
    }
}
