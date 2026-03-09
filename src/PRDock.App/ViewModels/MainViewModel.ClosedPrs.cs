using CommunityToolkit.Mvvm.ComponentModel;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.App.ViewModels;

public partial class MainViewModel
{
    private List<PullRequestCardViewModel> _closedPullRequests = [];
    private bool _closedPrsLoaded;
    private bool _isLoadingClosedPrs;

    [ObservableProperty]
    private int _closedCount;

    internal IReadOnlyList<PullRequestCardViewModel> ClosedPullRequests => _closedPullRequests;

    private async Task LoadClosedPrsAsync()
    {
        if (_isLoadingClosedPrs) return;
        _isLoadingClosedPrs = true;
        IsLoading = true;

        try
        {
            // Try cache first
            if (!_closedPrsLoaded && _cacheService is not null)
            {
                var cached = await _cacheService.LoadClosedCachedAsync();
                if (cached.Count > 0)
                {
                    _closedPullRequests = cached.Select(MapClosedPrToCard).ToList();
                    _closedPrsLoaded = true;
                    ClosedCount = _closedPullRequests.Count;
                    ApplyGroupingAndFiltering();
                }
            }

            // Fetch fresh from API
            if (_gitHubService is null || _settingsService is null) return;

            var enabledRepos = _settingsService.CurrentSettings.Repos.Where(r => r.Enabled).ToList();
            var allClosed = new List<PullRequest>();

            foreach (var repo in enabledRepos)
            {
                try
                {
                    var closed = await _gitHubService.GetClosedPullRequestsAsync(repo.Owner, repo.Name, 30);
                    allClosed.AddRange(closed);
                }
                catch (Exception ex)
                {
                    Serilog.Log.Warning(ex, "Failed to fetch closed PRs for {Owner}/{Repo}", repo.Owner, repo.Name);
                }
            }

            if (allClosed.Count > 0)
            {
                _closedPullRequests = allClosed.Select(MapClosedPrToCard).ToList();
                _closedPrsLoaded = true;
                ClosedCount = _closedPullRequests.Count;

                // Cache for next time
                if (_cacheService is not null)
                    _ = _cacheService.SaveClosedAsync(allClosed);

                void UpdateUi() => ApplyGroupingAndFiltering();
                if (System.Windows.Application.Current?.Dispatcher is { } dispatcher)
                    await dispatcher.InvokeAsync(UpdateUi);
                else
                    UpdateUi();
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to load closed PRs");
            StatusText = $"Failed to load closed PRs: {ex.Message}";
        }
        finally
        {
            _isLoadingClosedPrs = false;
            IsLoading = false;
        }
    }

    private PullRequestCardViewModel MapClosedPrToCard(PullRequest pr)
    {
        var username = _settingsService?.CurrentSettings.GitHub.Username ?? "";
        var card = new PullRequestCardViewModel
        {
            Number = pr.Number,
            Title = pr.Title,
            HeadRef = pr.HeadRef,
            BaseRef = pr.BaseRef,
            AuthorLogin = pr.AuthorLogin,
            Age = PullRequestCardViewModel.FormatAge(pr.ClosedAt ?? pr.UpdatedAt),
            StatusDotColor = pr.IsMerged ? "purple" : "red",
            HtmlUrl = pr.HtmlUrl,
            Body = pr.Body,
            RepoOwner = pr.RepoOwner,
            RepoName = pr.RepoName,
            UpdatedAt = pr.ClosedAt ?? pr.UpdatedAt,
            IsDraft = pr.IsDraft,
            CommentCount = pr.CommentCount,
            IsMyPr = !string.IsNullOrEmpty(username)
                && pr.AuthorLogin.Equals(username, StringComparison.OrdinalIgnoreCase),
            ClosureState = pr.IsMerged ? PullRequestClosureState.Merged : PullRequestClosureState.Closed,
            ClosedAt = pr.ClosedAt ?? pr.UpdatedAt,
            AuthorInitials = PullRequestCardViewModel.ComputeInitials(pr.AuthorLogin),
            OpenDetailViewRequested = OnOpenDetailViewRequested
        };

        foreach (var label in pr.Labels)
            card.Labels.Add(label);

        return card;
    }

}
