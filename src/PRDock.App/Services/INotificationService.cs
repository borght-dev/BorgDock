using PRDock.App.Models;

namespace PRDock.App.Services;

public interface INotificationService
{
    void NotifyCheckFailed(PullRequest pr, string checkName);
    void NotifyAllChecksPassed(PullRequest pr);
    void NotifyReviewRequested(PullRequest pr, string reviewer);
    void NotifyClaudeReviewCritical(PullRequest pr, int count);
    void NotifyFixCommitted(PullRequest pr);

    /// <summary>
    /// Detects state transitions between the previous and current poll results,
    /// and fires appropriate notifications based on NotificationSettings.
    /// </summary>
    void ProcessStateTransitions(
        IReadOnlyList<PullRequestWithChecks> previous,
        IReadOnlyList<PullRequestWithChecks> current);
}
