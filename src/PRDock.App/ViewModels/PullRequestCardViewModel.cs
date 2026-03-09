using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Text;
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

    // Stats from PR model
    [ObservableProperty]
    private int _additions;

    [ObservableProperty]
    private int _deletions;

    [ObservableProperty]
    private int _filesChanged;

    [ObservableProperty]
    private int _commitCount;

    // Check stats
    [ObservableProperty]
    private int _passedChecks;

    [ObservableProperty]
    private int _totalChecks;

    // Merge score (computed)
    [ObservableProperty]
    private int _mergeScore;

    // Labels
    public ObservableCollection<string> Labels { get; } = [];

    // Section header displayed above this card (e.g., "Recently Closed")
    [ObservableProperty]
    private string _sectionHeader = "";

    // Expansion state for inline row expansion
    [ObservableProperty]
    private bool _isExpanded;

    // Author initials (2-letter abbreviation for avatar)
    [ObservableProperty]
    private string _authorInitials = "";

    // Approval count
    [ObservableProperty]
    private int _approvalCount;

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
    private void CopyErrorsForClaude()
    {
        var sb = new StringBuilder();
        sb.AppendLine($"## CI Failures for PR #{Number}: {Title}");
        sb.AppendLine($"Branch: {HeadRef} -> {BaseRef}");
        sb.AppendLine();

        // Always include failed check names
        if (FailedChecks.Count > 0)
        {
            sb.AppendLine("### Failed Checks");
            foreach (var check in FailedChecks)
                sb.AppendLine($"- {check}");
            sb.AppendLine();
        }

        // Include parsed errors if available
        if (ParsedErrors.Count > 0)
        {
            var groups = ParsedErrors
                .GroupBy(e => e.Category)
                .OrderBy(g => g.Key switch
                {
                    "PlaywrightSummary" => 0,
                    "Playwright" => 1,
                    "MSBuild" => 2,
                    "TypeScript" => 3,
                    "ESLint" => 4,
                    "DotnetTest" => 5,
                    _ => 10
                });

            foreach (var group in groups)
            {
                var label = group.Key switch
                {
                    "PlaywrightSummary" => "Test Results",
                    "Playwright" => "Failed/Flaky Tests",
                    "MSBuild" => "Build Errors",
                    "TypeScript" => "TypeScript Errors",
                    "ESLint" => "ESLint Errors",
                    "DotnetTest" => "Test Failures",
                    _ => group.Key
                };

                sb.AppendLine($"### {label}");
                sb.AppendLine();

                foreach (var error in group)
                {
                    if (group.Key == "PlaywrightSummary")
                    {
                        sb.AppendLine(error.Message);
                        sb.AppendLine();
                    }
                    else
                    {
                        if (!string.IsNullOrEmpty(error.FilePath))
                        {
                            sb.Append($"**{error.FilePath}");
                            if (error.LineNumber.HasValue)
                                sb.Append($":{error.LineNumber}");
                            sb.AppendLine("**");
                        }
                        if (!string.IsNullOrEmpty(error.ErrorCode))
                            sb.AppendLine($"_{error.ErrorCode}_");
                        sb.AppendLine($"```\n{error.Message}\n```");
                        sb.AppendLine();
                    }
                }
            }
        }
        else if (FailedChecks.Count == 0)
        {
            sb.AppendLine("_No failure details available yet. Expand the PR card first to load check details._");
        }

        System.Windows.Clipboard.SetText(sb.ToString().TrimEnd());
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

    public void ComputeMergeScore()
    {
        int score = 0;
        if (StatusDotColor == "green") score += 40;          // All checks passing
        if (ApprovalCount >= 1) score += 25;                  // At least 1 approval
        if (ApprovalCount >= 2) score += 10;                  // 2+ approvals
        if (!HasMergeConflict) score += 15;                   // No conflicts
        if (!IsDraft) score += 10;                            // Not draft
        MergeScore = Math.Min(score, 100);
    }

    public static string ComputeInitials(string login)
    {
        if (string.IsNullOrEmpty(login)) return "??";
        // Split on underscores and take first letter of first two parts
        // e.g. "borght-dev" -> "KV" (first char + first upper after lowercase)
        var name = login.Split('_')[0]; // Take part before underscore
        if (name.Length <= 2) return name.ToUpperInvariant();

        // Find first char and first uppercase after it
        var result = name[0].ToString().ToUpperInvariant();
        for (int i = 1; i < name.Length; i++)
        {
            if (char.IsUpper(name[i]))
            {
                result += name[i];
                break;
            }
        }
        if (result.Length == 1) result += name[1].ToString().ToUpperInvariant();
        return result;
    }

    [RelayCommand]
    private void ToggleExpanded()
    {
        IsExpanded = !IsExpanded;
        if (IsExpanded)
        {
            DetailExpandRequested?.Invoke(this);
        }
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
