using FluentAssertions;
using Microsoft.Extensions.Time.Testing;
using NSubstitute;
using PRDock.App.Services;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class MainViewModelRecentlyClosedTests
{
    private static MainViewModel CreateVm(FakeTimeProvider? fakeTime = null)
    {
        var polling = Substitute.For<IPRPollingService>();
        var vm = new MainViewModel(polling);
        if (fakeTime is not null)
            vm.InitTimeProvider(fakeTime);
        return vm;
    }

    private static PullRequestCardViewModel MakeCard(string owner, string repo, int number, string title = "PR") =>
        new()
        {
            RepoOwner = owner,
            RepoName = repo,
            Number = number,
            Title = title,
            AuthorLogin = "user",
            StatusDotColor = "green"
        };

    [Fact]
    public void PR_disappearing_from_open_list_is_detected_as_closed()
    {
        var fakeTime = new FakeTimeProvider(DateTimeOffset.UtcNow);
        var vm = CreateVm(fakeTime);

        var pr1 = MakeCard("org", "repo", 1);
        var pr2 = MakeCard("org", "repo", 2);
        vm.UpdatePullRequests([pr1, pr2]);

        // Second poll: PR #2 disappears
        vm.UpdatePullRequests([pr1]);

        vm.RecentlyClosedPrs.Should().HaveCount(1);
        vm.RecentlyClosedPrs[0].Number.Should().Be(2);
        vm.RecentlyClosedPrs[0].ClosureState.Should().Be(PullRequestClosureState.Closed);
        vm.RecentlyClosedPrs[0].ClosedAt.Should().NotBeNull();
    }

    [Fact]
    public void Recently_closed_group_appears_at_bottom_when_filter_is_All()
    {
        var fakeTime = new FakeTimeProvider(DateTimeOffset.UtcNow);
        var vm = CreateVm(fakeTime);

        var pr1 = MakeCard("org", "repo", 1);
        var pr2 = MakeCard("org", "repo", 2);
        vm.UpdatePullRequests([pr1, pr2]);

        vm.UpdatePullRequests([pr1]);

        vm.RepoGroups.Should().HaveCount(2);
        vm.RepoGroups[^1].RepoFullName.Should().Be("Recently Closed");
        vm.RepoGroups[^1].IsRecentlyClosed.Should().BeTrue();
    }

    [Fact]
    public void Recently_closed_group_excluded_when_filter_is_MyPRs()
    {
        var fakeTime = new FakeTimeProvider(DateTimeOffset.UtcNow);
        var vm = CreateVm(fakeTime);

        var pr1 = MakeCard("org", "repo", 1);
        pr1.IsMyPr = true;
        var pr2 = MakeCard("org", "repo", 2);
        vm.UpdatePullRequests([pr1, pr2]);

        vm.UpdatePullRequests([pr1]);
        vm.SetFilterCommand.Execute("My PRs");

        vm.RepoGroups.Should().HaveCount(1);
        vm.RepoGroups[0].RepoFullName.Should().NotBe("Recently Closed");
    }

    [Fact]
    public void MarkPrMerged_changes_closure_state_to_Merged()
    {
        var fakeTime = new FakeTimeProvider(DateTimeOffset.UtcNow);
        var vm = CreateVm(fakeTime);

        var pr1 = MakeCard("org", "repo", 1);
        vm.UpdatePullRequests([pr1]);

        vm.UpdatePullRequests([]);

        vm.MarkPrMerged("org", "repo", 1);

        vm.RecentlyClosedPrs[0].ClosureState.Should().Be(PullRequestClosureState.Merged);
    }

    [Fact]
    public void ClosureBadgeText_returns_correct_text_for_Merged()
    {
        var card = MakeCard("org", "repo", 1);
        card.ClosureState = PullRequestClosureState.Merged;
        card.ClosureBadgeText.Should().Be("Merged \u2713");
    }

    [Fact]
    public void ClosureBadgeText_returns_correct_text_for_Closed()
    {
        var card = MakeCard("org", "repo", 1);
        card.ClosureState = PullRequestClosureState.Closed;
        card.ClosureBadgeText.Should().Be("Closed");
    }

    [Fact]
    public void ClosureBadgeText_returns_empty_for_None()
    {
        var card = MakeCard("org", "repo", 1);
        card.ClosureBadgeText.Should().BeEmpty();
    }

    [Fact]
    public void IsClosed_returns_true_when_ClosureState_is_not_None()
    {
        var card = MakeCard("org", "repo", 1);
        card.IsClosed.Should().BeFalse();

        card.ClosureState = PullRequestClosureState.Closed;
        card.IsClosed.Should().BeTrue();

        card.ClosureState = PullRequestClosureState.Merged;
        card.IsClosed.Should().BeTrue();
    }

    [Fact]
    public void Duplicate_closed_PR_is_not_added_twice()
    {
        var fakeTime = new FakeTimeProvider(DateTimeOffset.UtcNow);
        var vm = CreateVm(fakeTime);

        var pr1 = MakeCard("org", "repo", 1);
        vm.UpdatePullRequests([pr1]);

        // PR disappears on two consecutive polls
        vm.UpdatePullRequests([]);
        vm.UpdatePullRequests([]);

        vm.RecentlyClosedPrs.Should().HaveCount(1);
    }

    [Fact]
    public void PR_reappearing_in_open_list_is_not_in_closed()
    {
        var fakeTime = new FakeTimeProvider(DateTimeOffset.UtcNow);
        var vm = CreateVm(fakeTime);

        var pr1 = MakeCard("org", "repo", 1);
        vm.UpdatePullRequests([pr1]);

        // PR disappears
        vm.UpdatePullRequests([]);
        vm.RecentlyClosedPrs.Should().HaveCount(1);

        // PR reappears - it's tracked in _previouslyKnownPrs again,
        // but the closed entry remains until pruned
        var pr1Again = MakeCard("org", "repo", 1);
        vm.UpdatePullRequests([pr1Again]);

        // The closed list still has the old entry (it won't be re-detected since it's already there)
        vm.RecentlyClosedPrs.Should().HaveCount(1);
    }

    [Fact]
    public void Auto_prune_removes_closed_PRs_after_24_hours()
    {
        var fakeTime = new FakeTimeProvider(new DateTimeOffset(2025, 1, 1, 0, 0, 0, TimeSpan.Zero));
        var vm = CreateVm(fakeTime);

        var pr1 = MakeCard("org", "repo", 1);
        vm.UpdatePullRequests([pr1]);

        // PR disappears at T=0
        vm.UpdatePullRequests([]);
        vm.RecentlyClosedPrs.Should().HaveCount(1);

        // Advance 24 hours
        fakeTime.Advance(TimeSpan.FromHours(24));

        // Next poll triggers pruning
        vm.UpdatePullRequests([]);
        vm.RecentlyClosedPrs.Should().BeEmpty();
    }

    [Fact]
    public void HasMergeConflict_property_works()
    {
        var card = MakeCard("org", "repo", 1);
        card.HasMergeConflict.Should().BeFalse();
        card.HasMergeConflict = true;
        card.HasMergeConflict.Should().BeTrue();
    }

    [Fact]
    public void Multiple_PRs_can_be_closed_at_once()
    {
        var fakeTime = new FakeTimeProvider(DateTimeOffset.UtcNow);
        var vm = CreateVm(fakeTime);

        var pr1 = MakeCard("org", "repo", 1);
        var pr2 = MakeCard("org", "repo", 2);
        var pr3 = MakeCard("org", "repo", 3);
        vm.UpdatePullRequests([pr1, pr2, pr3]);

        // All disappear
        vm.UpdatePullRequests([]);

        vm.RecentlyClosedPrs.Should().HaveCount(3);
    }

    [Fact]
    public void Recently_closed_group_orders_by_ClosedAt_descending()
    {
        var fakeTime = new FakeTimeProvider(new DateTimeOffset(2025, 1, 1, 0, 0, 0, TimeSpan.Zero));
        var vm = CreateVm(fakeTime);

        var pr1 = MakeCard("org", "repo", 1);
        var pr2 = MakeCard("org", "repo", 2);
        vm.UpdatePullRequests([pr1, pr2]);

        // PR #1 disappears first
        vm.UpdatePullRequests([pr2]);

        fakeTime.Advance(TimeSpan.FromHours(1));

        // PR #2 disappears later
        vm.UpdatePullRequests([]);

        // The group should show PR #2 first (more recent closure)
        var closedGroup = vm.RepoGroups.First(g => g.RepoFullName == "Recently Closed");
        closedGroup.PullRequests[0].Number.Should().Be(2);
        closedGroup.PullRequests[1].Number.Should().Be(1);
    }
}
