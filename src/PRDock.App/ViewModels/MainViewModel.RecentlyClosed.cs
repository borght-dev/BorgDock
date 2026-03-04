namespace PRDock.App.ViewModels;

public partial class MainViewModel
{
    private TimeProvider _timeProvider = TimeProvider.System;

    private readonly Dictionary<string, PullRequestCardViewModel> _previouslyKnownPrs = new();
    private readonly List<PullRequestCardViewModel> _recentlyClosedPrs = [];

    internal IReadOnlyList<PullRequestCardViewModel> RecentlyClosedPrs => _recentlyClosedPrs;

    internal void InitTimeProvider(TimeProvider timeProvider)
    {
        _timeProvider = timeProvider;
    }

    private static string PrKey(PullRequestCardViewModel pr) =>
        $"{pr.RepoOwner}/{pr.RepoName}#{pr.Number}";

    private void DetectClosedPrs(List<PullRequestCardViewModel> currentOpenPrs)
    {
        var currentKeys = new HashSet<string>(currentOpenPrs.Select(PrKey));
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        foreach (var kvp in _previouslyKnownPrs)
        {
            if (!currentKeys.Contains(kvp.Key))
            {
                var closedCard = kvp.Value;
                closedCard.ClosureState = PullRequestClosureState.Closed;
                closedCard.ClosedAt = now;

                if (!_recentlyClosedPrs.Any(p => PrKey(p) == kvp.Key))
                    _recentlyClosedPrs.Add(closedCard);
            }
        }

        _recentlyClosedPrs.RemoveAll(p => p.ClosedAt.HasValue &&
            (now - p.ClosedAt.Value).TotalHours >= 24);
    }

    public void MarkPrMerged(string repoOwner, string repoName, int number)
    {
        var key = $"{repoOwner}/{repoName}#{number}";
        var pr = _recentlyClosedPrs.FirstOrDefault(p => PrKey(p) == key);
        if (pr is not null)
        {
            pr.ClosureState = PullRequestClosureState.Merged;
        }
    }
}
