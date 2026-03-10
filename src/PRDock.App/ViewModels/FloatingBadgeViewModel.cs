using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;
using WpfColor = System.Windows.Media.Color;
using WpfColorConverter = System.Windows.Media.ColorConverter;
using System.Windows.Media;

namespace PRDock.App.ViewModels;

public partial class FloatingBadgeViewModel : ObservableObject
{
    [ObservableProperty]
    private int _totalPrCount;

    [ObservableProperty]
    private int _failingCount;

    [ObservableProperty]
    private int _pendingCount;

    [ObservableProperty]
    private int _passingCount;

    [ObservableProperty]
    private string _badgeText = "0 PRs";

    [ObservableProperty]
    private string _backgroundColor = "green";

    [ObservableProperty]
    private string _toastText = "";

    [ObservableProperty]
    private bool _isToastVisible;

    [ObservableProperty]
    private string _badgeStyle = "GlassCapsule";

    [ObservableProperty]
    private string _statusText = "all clear";

    [ObservableProperty]
    private string _actionTag = "OK";

    [ObservableProperty]
    private bool _hasFailures;

    [ObservableProperty]
    private double _healthFraction = 1.0;

    [ObservableProperty]
    private bool _isExpanded;

    [ObservableProperty]
    private int _needsReviewCount;

    [ObservableProperty]
    private int _readyCount;

    [ObservableProperty]
    private string _lastUpdatedText = "";

    public ObservableCollection<string> PrStatuses { get; } = [];

    public ObservableCollection<BadgeAuthorInfo> AuthorInitials { get; } = [];

    public ObservableCollection<BadgePrItem> MyPrs { get; } = [];

    public ObservableCollection<BadgePrItem> TeamPrs { get; } = [];

    public event Action? ExpandSidebarRequested;

    public event Action? QuitRequested;

    public event Action<string>? DockSideRequested;

    public event Action? SettingsRequested;

    /// <summary>Fires with (prNumber, repoOwner, repoName) when user clicks a PR in the expanded panel.</summary>
    public event Action<int, string, string>? PrDetailRequested;

    public void Update(int totalPrCount, int failingCount, int pendingCount,
        IReadOnlyList<string>? prStatuses = null,
        IReadOnlyList<BadgeAuthorInfo>? authors = null)
    {
        TotalPrCount = totalPrCount;
        FailingCount = failingCount;
        PendingCount = pendingCount;
        PassingCount = totalPrCount - failingCount - pendingCount;
        BadgeText = FormatBadgeText(totalPrCount, failingCount, pendingCount);
        BackgroundColor = DetermineBackgroundColor(failingCount, pendingCount);
        HasFailures = failingCount > 0;
        ActionTag = failingCount > 0 ? "FIX" : "OK";
        StatusText = DetermineStatusText(failingCount, pendingCount);
        HealthFraction = totalPrCount > 0
            ? (double)(totalPrCount - failingCount) / totalPrCount
            : 1.0;

        if (prStatuses is not null)
        {
            PrStatuses.Clear();
            foreach (var s in prStatuses) PrStatuses.Add(s);
        }

        if (authors is not null)
        {
            AuthorInitials.Clear();
            foreach (var a in authors.Take(3)) AuthorInitials.Add(a);
        }
    }

    public void UpdateExpanded(IReadOnlyList<PullRequestWithChecks> prs, string currentUsername)
    {
        var total = prs.Count;
        var failing = prs.Count(r => r.OverallStatus == "red");
        var pending = prs.Count(r => r.OverallStatus == "yellow");
        var prStatuses = prs.Select(r => r.OverallStatus).ToList();
        var authors = prs
            .Select(r => r.PullRequest.AuthorLogin)
            .Where(l => !string.IsNullOrEmpty(l))
            .Distinct()
            .Take(3)
            .Select(login => new BadgeAuthorInfo
            {
                Initials = GetInitials(login),
                BackgroundBrush = GetAuthorBrush(login)
            })
            .ToList();

        Update(total, failing, pending, prStatuses, authors);

        var mine = prs.Where(p =>
            string.Equals(p.PullRequest.AuthorLogin, currentUsername, StringComparison.OrdinalIgnoreCase))
            .ToList();
        var team = prs.Where(p =>
            !string.Equals(p.PullRequest.AuthorLogin, currentUsername, StringComparison.OrdinalIgnoreCase))
            .ToList();

        MyPrs.Clear();
        foreach (var pr in mine) MyPrs.Add(ToBadgePrItem(pr));

        TeamPrs.Clear();
        foreach (var pr in team) TeamPrs.Add(ToBadgePrItem(pr));

        NeedsReviewCount = prs.Count(p =>
            p.PullRequest.ReviewStatus is ReviewStatus.None or ReviewStatus.Pending);
        ReadyCount = prs.Count(p =>
            p.OverallStatus == "green" && p.PullRequest.ReviewStatus == ReviewStatus.Approved);

        LastUpdatedText = DateTime.Now.ToString("h:mm tt");
    }

    private static BadgePrItem ToBadgePrItem(PullRequestWithChecks prc)
    {
        var pr = prc.PullRequest;
        var checksText = prc.Checks.Count > 0
            ? $"{prc.PassedCount}/{prc.Checks.Count}"
            : "";

        return new BadgePrItem
        {
            Title = pr.Title,
            Number = pr.Number,
            TimeAgo = FormatTimeAgo(pr.UpdatedAt),
            StatusColor = prc.OverallStatus,
            ChecksText = checksText,
            IsInProgress = prc.OverallStatus == "yellow",
            RepoOwner = pr.RepoOwner,
            RepoName = pr.RepoName,
        };
    }

    internal static string FormatTimeAgo(DateTime updatedAt)
    {
        var elapsed = DateTime.UtcNow - updatedAt;
        if (elapsed.TotalMinutes < 1) return "now";
        if (elapsed.TotalMinutes < 60) return $"{(int)elapsed.TotalMinutes}m ago";
        if (elapsed.TotalHours < 24) return $"{(int)elapsed.TotalHours}h ago";
        if (elapsed.TotalDays < 7) return $"{(int)elapsed.TotalDays}d ago";
        return $"{(int)(elapsed.TotalDays / 7)}w ago";
    }

    public async void ShowToast(string message, int durationMs = 4000)
    {
        ToastText = message;
        IsToastVisible = true;
        await System.Threading.Tasks.Task.Delay(durationMs);
        if (ToastText == message)
        {
            IsToastVisible = false;
            ToastText = "";
        }
    }

    internal static string FormatBadgeText(int total, int failing, int pending)
    {
        var prLabel = total == 1 ? "PR" : "PRs";
        var parts = new List<string>(2);
        if (failing > 0) parts.Add($"{failing} failing");
        if (pending > 0) parts.Add($"{pending} in progress");

        return parts.Count > 0
            ? $"{total} {prLabel} \u00b7 {string.Join(", ", parts)}"
            : $"{total} {prLabel}";
    }

    internal static string DetermineBackgroundColor(int failing, int pending)
    {
        if (failing > 0) return "red";
        if (pending > 0) return "yellow";
        return "green";
    }

    internal static string DetermineStatusText(int failing, int pending)
    {
        var parts = new List<string>(2);
        if (failing > 0) parts.Add($"{failing} failing");
        if (pending > 0) parts.Add($"{pending} in progress");
        return parts.Count > 0 ? string.Join(", ", parts) : "all clear";
    }

    private static readonly string[] AvatarPalette =
        ["#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6", "#1ABC9C", "#E67E22", "#16A085"];

    internal static SolidColorBrush GetAuthorBrush(string login)
    {
        int hash = 0;
        foreach (var c in login) hash = hash * 31 + c;
        var index = Math.Abs(hash) % AvatarPalette.Length;
        var color = (WpfColor)WpfColorConverter.ConvertFromString(AvatarPalette[index]);
        return new SolidColorBrush(color);
    }

    internal static string GetInitials(string login)
    {
        if (string.IsNullOrEmpty(login)) return "?";
        return login.Length >= 2 ? login[..2].ToUpperInvariant() : login.ToUpperInvariant();
    }

    [RelayCommand]
    private void ExpandSidebar()
    {
        ExpandSidebarRequested?.Invoke();
    }

    [RelayCommand]
    private void Quit()
    {
        QuitRequested?.Invoke();
    }

    [RelayCommand]
    private void DockLeft()
    {
        DockSideRequested?.Invoke("Left");
    }

    [RelayCommand]
    private void DockRight()
    {
        DockSideRequested?.Invoke("Right");
    }

    [RelayCommand]
    private void OpenSettings()
    {
        SettingsRequested?.Invoke();
    }

    [RelayCommand]
    private void ToggleExpand()
    {
        IsExpanded = !IsExpanded;
    }

    [RelayCommand]
    private void OpenPrDetail(BadgePrItem? item)
    {
        if (item is not null)
            PrDetailRequested?.Invoke(item.Number, item.RepoOwner, item.RepoName);
    }
}

public sealed class BadgePrItem
{
    public string Title { get; set; } = "";
    public int Number { get; set; }
    public string TimeAgo { get; set; } = "";
    public string StatusColor { get; set; } = "gray";
    public string ChecksText { get; set; } = "";
    public bool HasChecksText => !string.IsNullOrEmpty(ChecksText);
    public bool IsInProgress { get; set; }
    public string RepoOwner { get; set; } = "";
    public string RepoName { get; set; } = "";
}

public sealed class BadgeAuthorInfo
{
    public string Initials { get; set; } = "";
    public SolidColorBrush BackgroundBrush { get; set; } = new(Colors.Gray);
}
