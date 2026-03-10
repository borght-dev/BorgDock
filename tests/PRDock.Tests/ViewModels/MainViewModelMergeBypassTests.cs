using FluentAssertions;
using NSubstitute;
using PRDock.App.Models;
using PRDock.App.Services;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class MainViewModelMergeBypassTests
{
    [Fact]
    public void PollCompleted_SetsBypassMerge_WhenOnlyReviewIsBlocking()
    {
        var polling = Substitute.For<IPRPollingService>();
        var vm = new MainViewModel(polling);

        polling.PollCompleted += Raise.Event<Action<IReadOnlyList<PullRequestWithChecks>>>(
            (IReadOnlyList<PullRequestWithChecks>)
            [
                MakePrWithChecks(reviewStatus: ReviewStatus.None, mergeable: true, isDraft: false)
            ]);

        var card = vm.RepoGroups.Single().PullRequests.Single();
        card.HasAllChecksPassed.Should().BeTrue();
        card.CanBypassMerge.Should().BeTrue();
    }

    [Fact]
    public void PollCompleted_DoesNotSetBypassMerge_WhenReviewApproved()
    {
        var polling = Substitute.For<IPRPollingService>();
        var vm = new MainViewModel(polling);

        polling.PollCompleted += Raise.Event<Action<IReadOnlyList<PullRequestWithChecks>>>(
            (IReadOnlyList<PullRequestWithChecks>)
            [
                MakePrWithChecks(reviewStatus: ReviewStatus.Approved, mergeable: true, isDraft: false)
            ]);

        var card = vm.RepoGroups.Single().PullRequests.Single();
        card.HasAllChecksPassed.Should().BeTrue();
        card.CanBypassMerge.Should().BeFalse();
    }

    [Fact]
    public void PollCompleted_DoesNotSetBypassMerge_WhenMergeConflictExists()
    {
        var polling = Substitute.For<IPRPollingService>();
        var vm = new MainViewModel(polling);

        polling.PollCompleted += Raise.Event<Action<IReadOnlyList<PullRequestWithChecks>>>(
            (IReadOnlyList<PullRequestWithChecks>)
            [
                MakePrWithChecks(reviewStatus: ReviewStatus.None, mergeable: false, isDraft: false)
            ]);

        var card = vm.RepoGroups.Single().PullRequests.Single();
        card.CanBypassMerge.Should().BeFalse();
    }

    [Fact]
    public void PollCompleted_WiresToggleDraftCallback()
    {
        var polling = Substitute.For<IPRPollingService>();
        var vm = new MainViewModel(polling);

        polling.PollCompleted += Raise.Event<Action<IReadOnlyList<PullRequestWithChecks>>>(
            (IReadOnlyList<PullRequestWithChecks>)
            [
                MakePrWithChecks(reviewStatus: ReviewStatus.None, mergeable: true, isDraft: true)
            ]);

        var card = vm.RepoGroups.Single().PullRequests.Single();
        card.IsDraft.Should().BeTrue();
        card.ToggleDraftRequested.Should().NotBeNull();
    }

    [Fact]
    public void PollCompleted_SetsIsDraft_WhenPrIsDraft()
    {
        var polling = Substitute.For<IPRPollingService>();
        var vm = new MainViewModel(polling);

        polling.PollCompleted += Raise.Event<Action<IReadOnlyList<PullRequestWithChecks>>>(
            (IReadOnlyList<PullRequestWithChecks>)
            [
                MakePrWithChecks(reviewStatus: ReviewStatus.None, mergeable: true, isDraft: true)
            ]);

        var card = vm.RepoGroups.Single().PullRequests.Single();
        card.IsDraft.Should().BeTrue();
        card.StatusDotColor.Should().Be("gray"); // Draft PRs have gray status
    }

    private static PullRequestWithChecks MakePrWithChecks(
        ReviewStatus reviewStatus,
        bool? mergeable,
        bool isDraft)
    {
        return new PullRequestWithChecks
        {
            PullRequest = new PullRequest
            {
                Number = 123,
                Title = "Test PR",
                State = "open",
                IsDraft = isDraft,
                Mergeable = mergeable,
                ReviewStatus = reviewStatus,
                HtmlUrl = "https://github.com/org/repo/pull/123",
                RepoOwner = "org",
                RepoName = "repo",
                UpdatedAt = DateTime.UtcNow
            },
            Checks =
            [
                new CheckRun
                {
                    Name = "build",
                    Status = "completed",
                    Conclusion = "success",
                    CheckSuiteId = 1
                }
            ]
        };
    }
}
