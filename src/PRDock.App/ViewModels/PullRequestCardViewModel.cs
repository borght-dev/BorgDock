using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

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
    private bool _hasMergeConflict;

    [ObservableProperty]
    private string _htmlUrl = "";

    [ObservableProperty]
    private DateTime _updatedAt;

    [ObservableProperty]
    private string _repoOwner = "";

    [ObservableProperty]
    private string _repoName = "";

    [ObservableProperty]
    private long _firstFailedRunId;

    public ObservableCollection<string> FailedChecks { get; } = [];

    public ObservableCollection<string> PendingChecks { get; } = [];

    public Action<PullRequestCardViewModel>? RerunRequested { get; set; }
    public Action<PullRequestCardViewModel>? FixWithClaudeRequested { get; set; }

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
