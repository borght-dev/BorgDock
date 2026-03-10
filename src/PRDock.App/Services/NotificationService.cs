using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed class NotificationService : INotificationService
{
    private readonly ISettingsService _settingsService;
    private readonly ILogger<NotificationService> _logger;

    public event Action<InAppNotification>? NotificationRaised;

    public NotificationService(ISettingsService settingsService, ILogger<NotificationService> logger)
    {
        _settingsService = settingsService;
        _logger = logger;
    }

    public void NotifyCheckFailed(PullRequest pr, string checkName)
    {
        if (!_settingsService.CurrentSettings.Notifications.ToastOnCheckStatusChange)
            return;

        RaiseNotification(new InAppNotification
        {
            Title = $"Check failed: {checkName}",
            Message = $"#{pr.Number} {pr.Title} ({pr.RepoOwner}/{pr.RepoName})",
            Severity = "error",
            LaunchUrl = pr.HtmlUrl,
            PrNumber = pr.Number,
            RepoFullName = $"{pr.RepoOwner}/{pr.RepoName}",
            Actions =
            [
                ("Open in GitHub", pr.HtmlUrl),
                ("Fix with Claude", $"prdock://fix/{pr.RepoOwner}/{pr.RepoName}/{pr.Number}")
            ]
        });
    }

    public void NotifyAllChecksPassed(PullRequest pr)
    {
        if (!_settingsService.CurrentSettings.Notifications.ToastOnCheckStatusChange)
            return;

        RaiseNotification(new InAppNotification
        {
            Title = "All checks passed",
            Message = $"#{pr.Number} {pr.Title} ({pr.RepoOwner}/{pr.RepoName})",
            Severity = "success",
            LaunchUrl = pr.HtmlUrl,
            PrNumber = pr.Number,
            RepoFullName = $"{pr.RepoOwner}/{pr.RepoName}",
            Actions = [("Open in GitHub", pr.HtmlUrl)]
        });
    }

    public void NotifyReviewRequested(PullRequest pr, string reviewer)
    {
        if (!_settingsService.CurrentSettings.Notifications.ToastOnReviewUpdate)
            return;

        RaiseNotification(new InAppNotification
        {
            Title = $"Review requested from {reviewer}",
            Message = $"#{pr.Number} {pr.Title} ({pr.RepoOwner}/{pr.RepoName})",
            Severity = "warning",
            LaunchUrl = pr.HtmlUrl,
            PrNumber = pr.Number,
            RepoFullName = $"{pr.RepoOwner}/{pr.RepoName}",
            Actions = [("Open in GitHub", pr.HtmlUrl)]
        });
    }

    public void NotifyClaudeReviewCritical(PullRequest pr, int count)
    {
        RaiseNotification(new InAppNotification
        {
            Title = $"Claude found {count} critical issue{(count == 1 ? "" : "s")}",
            Message = $"#{pr.Number} {pr.Title} ({pr.RepoOwner}/{pr.RepoName})",
            Severity = "error",
            LaunchUrl = pr.HtmlUrl,
            PrNumber = pr.Number,
            RepoFullName = $"{pr.RepoOwner}/{pr.RepoName}",
            Actions =
            [
                ("Open in GitHub", pr.HtmlUrl),
                ("Fix with Claude", $"prdock://fix/{pr.RepoOwner}/{pr.RepoName}/{pr.Number}")
            ]
        });
    }

    public void NotifyFixCommitted(PullRequest pr)
    {
        RaiseNotification(new InAppNotification
        {
            Title = "Fix committed",
            Message = $"#{pr.Number} {pr.Title} ({pr.RepoOwner}/{pr.RepoName})",
            Severity = "success",
            LaunchUrl = pr.HtmlUrl,
            PrNumber = pr.Number,
            RepoFullName = $"{pr.RepoOwner}/{pr.RepoName}",
            Actions = [("Open in GitHub", pr.HtmlUrl)]
        });
    }

    public void ProcessStateTransitions(
        IReadOnlyList<PullRequestWithChecks> previous,
        IReadOnlyList<PullRequestWithChecks> current)
    {
        var previousByKey = previous.ToDictionary(p => PrKey(p.PullRequest));

        foreach (var cur in current)
        {
            var key = PrKey(cur.PullRequest);
            if (!previousByKey.TryGetValue(key, out var prev))
                continue; // New PR — handled separately via ToastOnNewPR if needed

            DetectCheckTransitions(prev, cur);
            DetectReviewTransitions(prev, cur);
        }
    }

    internal static string PrKey(PullRequest pr) => $"{pr.RepoOwner}/{pr.RepoName}#{pr.Number}";

    private void DetectCheckTransitions(PullRequestWithChecks prev, PullRequestWithChecks cur)
    {
        // Was not red, now red — find newly failed checks
        if (prev.OverallStatus != "red" && cur.OverallStatus == "red")
        {
            var previousFailedNames = prev.FailedCheckNames.ToHashSet();
            foreach (var failedName in cur.FailedCheckNames)
            {
                if (!previousFailedNames.Contains(failedName))
                {
                    NotifyCheckFailed(cur.PullRequest, failedName);
                }
            }

            // If all current failures were already in the previous set (edge case where
            // status wasn't "red" before, e.g. gray->red), still notify the first one
            if (cur.FailedCheckNames.Count > 0 && cur.FailedCheckNames.All(n => previousFailedNames.Contains(n)))
            {
                NotifyCheckFailed(cur.PullRequest, cur.FailedCheckNames[0]);
            }
        }

        // Was not green, now green — all checks passed
        if (prev.OverallStatus != "green" && cur.OverallStatus == "green")
        {
            NotifyAllChecksPassed(cur.PullRequest);
        }
    }

    private void DetectReviewTransitions(PullRequestWithChecks prev, PullRequestWithChecks cur)
    {
        if (prev.PullRequest.ReviewStatus != cur.PullRequest.ReviewStatus &&
            cur.PullRequest.ReviewStatus == ReviewStatus.ChangesRequested)
        {
            NotifyReviewRequested(cur.PullRequest, "a reviewer");
        }
    }

    private void RaiseNotification(InAppNotification notification)
    {
        try
        {
            NotificationRaised?.Invoke(notification);
            _logger.LogDebug("Notification raised: {Title}", notification.Title);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to raise notification: {Title}", notification.Title);
        }
    }
}
