using FluentAssertions;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class RepoGroupViewModelTests
{
    [Fact]
    public void DefaultValues_AreCorrect()
    {
        var vm = new RepoGroupViewModel();

        vm.RepoFullName.Should().Be("");
        vm.PrCount.Should().Be(0);
        vm.IsExpanded.Should().BeTrue();
        vm.PullRequests.Should().BeEmpty();
    }

    [Fact]
    public void ToggleExpandCommand_FlipsIsExpanded()
    {
        var vm = new RepoGroupViewModel();
        vm.IsExpanded.Should().BeTrue();

        vm.ToggleExpandCommand.Execute(null);

        vm.IsExpanded.Should().BeFalse();

        vm.ToggleExpandCommand.Execute(null);

        vm.IsExpanded.Should().BeTrue();
    }

    [Fact]
    public void UpdatePullRequests_GroupsByRepo()
    {
        var mainVm = new MainViewModel();
        var prs = new[]
        {
            CreatePr("owner1", "repo1", 1),
            CreatePr("owner1", "repo1", 2),
            CreatePr("owner2", "repo2", 3),
        };

        mainVm.UpdatePullRequests(prs);

        mainVm.RepoGroups.Should().HaveCount(2);
        mainVm.RepoGroups[0].RepoFullName.Should().Be("owner1/repo1");
        mainVm.RepoGroups[0].PrCount.Should().Be(2);
        mainVm.RepoGroups[0].PullRequests.Should().HaveCount(2);
        mainVm.RepoGroups[1].RepoFullName.Should().Be("owner2/repo2");
        mainVm.RepoGroups[1].PrCount.Should().Be(1);
    }

    [Fact]
    public void UpdatePullRequests_SortsMyPrsFirstWithinGroup()
    {
        var mainVm = new MainViewModel();
        var prs = new[]
        {
            CreatePr("owner", "repo", 1, isMyPr: false, updatedAt: DateTime.UtcNow),
            CreatePr("owner", "repo", 2, isMyPr: true, updatedAt: DateTime.UtcNow.AddHours(-1)),
            CreatePr("owner", "repo", 3, isMyPr: false, updatedAt: DateTime.UtcNow.AddHours(-2)),
        };

        mainVm.UpdatePullRequests(prs);

        mainVm.RepoGroups.Should().HaveCount(1);
        var group = mainVm.RepoGroups[0];
        group.PullRequests[0].Number.Should().Be(2); // my PR first
        group.PullRequests[1].Number.Should().Be(1); // then by UpdatedAt desc
        group.PullRequests[2].Number.Should().Be(3);
    }

    [Fact]
    public void UpdatePullRequests_GroupsWithMyPrsFirst()
    {
        var mainVm = new MainViewModel();
        var prs = new[]
        {
            CreatePr("alpha", "repo", 1, isMyPr: false),
            CreatePr("beta", "repo", 2, isMyPr: true),
        };

        mainVm.UpdatePullRequests(prs);

        mainVm.RepoGroups.Should().HaveCount(2);
        mainVm.RepoGroups[0].RepoFullName.Should().Be("beta/repo"); // has my PR
        mainVm.RepoGroups[1].RepoFullName.Should().Be("alpha/repo");
    }

    [Fact]
    public void SetFilter_MyPrs_ShowsOnlyMyPrs()
    {
        var mainVm = new MainViewModel();
        var prs = new[]
        {
            CreatePr("owner", "repo", 1, isMyPr: true),
            CreatePr("owner", "repo", 2, isMyPr: false),
            CreatePr("owner2", "repo2", 3, isMyPr: false),
        };

        mainVm.UpdatePullRequests(prs);
        mainVm.SetFilterCommand.Execute("My PRs");

        mainVm.ActiveFilter.Should().Be("My PRs");
        mainVm.RepoGroups.Should().HaveCount(1);
        mainVm.RepoGroups[0].PullRequests.Should().HaveCount(1);
        mainVm.RepoGroups[0].PullRequests[0].Number.Should().Be(1);
    }

    [Fact]
    public void SetFilter_Failing_ShowsOnlyRedStatus()
    {
        var mainVm = new MainViewModel();
        var prs = new[]
        {
            CreatePr("owner", "repo", 1, statusDotColor: "green"),
            CreatePr("owner", "repo", 2, statusDotColor: "red"),
            CreatePr("owner2", "repo2", 3, statusDotColor: "red"),
        };

        mainVm.UpdatePullRequests(prs);
        mainVm.SetFilterCommand.Execute("Failing");

        mainVm.ActiveFilter.Should().Be("Failing");
        mainVm.RepoGroups.Should().HaveCount(2);
        mainVm.RepoGroups.SelectMany(g => g.PullRequests).Should().HaveCount(2);
        mainVm.RepoGroups.SelectMany(g => g.PullRequests)
            .Should().OnlyContain(pr => pr.StatusDotColor == "red");
    }

    [Fact]
    public void SetFilter_All_ShowsAllPrs()
    {
        var mainVm = new MainViewModel();
        var prs = new[]
        {
            CreatePr("owner", "repo", 1, isMyPr: true),
            CreatePr("owner", "repo", 2, isMyPr: false),
        };

        mainVm.UpdatePullRequests(prs);
        mainVm.SetFilterCommand.Execute("My PRs");
        mainVm.RepoGroups.SelectMany(g => g.PullRequests).Should().HaveCount(1);

        mainVm.SetFilterCommand.Execute("All");

        mainVm.ActiveFilter.Should().Be("All");
        mainVm.RepoGroups.SelectMany(g => g.PullRequests).Should().HaveCount(2);
    }

    [Fact]
    public void SetFilter_Failing_EmptyWhenNoFailingPrs()
    {
        var mainVm = new MainViewModel();
        var prs = new[]
        {
            CreatePr("owner", "repo", 1, statusDotColor: "green"),
        };

        mainVm.UpdatePullRequests(prs);
        mainVm.SetFilterCommand.Execute("Failing");

        mainVm.RepoGroups.Should().BeEmpty();
    }

    [Fact]
    public void UpdatePullRequests_SortsByUpdatedAtDescWithinGroup()
    {
        var mainVm = new MainViewModel();
        var now = DateTime.UtcNow;
        var prs = new[]
        {
            CreatePr("owner", "repo", 1, updatedAt: now.AddHours(-3)),
            CreatePr("owner", "repo", 2, updatedAt: now),
            CreatePr("owner", "repo", 3, updatedAt: now.AddHours(-1)),
        };

        mainVm.UpdatePullRequests(prs);

        var group = mainVm.RepoGroups[0];
        group.PullRequests[0].Number.Should().Be(2); // most recent
        group.PullRequests[1].Number.Should().Be(3);
        group.PullRequests[2].Number.Should().Be(1); // oldest
    }

    [Fact]
    public void UpdatePullRequests_GroupsSortAlphabeticallyWhenNoMyPrs()
    {
        var mainVm = new MainViewModel();
        var prs = new[]
        {
            CreatePr("charlie", "repo", 1),
            CreatePr("alpha", "repo", 2),
            CreatePr("bravo", "repo", 3),
        };

        mainVm.UpdatePullRequests(prs);

        mainVm.RepoGroups[0].RepoFullName.Should().Be("alpha/repo");
        mainVm.RepoGroups[1].RepoFullName.Should().Be("bravo/repo");
        mainVm.RepoGroups[2].RepoFullName.Should().Be("charlie/repo");
    }

    [Fact]
    public void UpdatePullRequests_EmptyList_ClearsGroups()
    {
        var mainVm = new MainViewModel();
        mainVm.UpdatePullRequests(new[] { CreatePr("owner", "repo", 1) });
        mainVm.RepoGroups.Should().NotBeEmpty();

        mainVm.UpdatePullRequests([]);

        mainVm.RepoGroups.Should().BeEmpty();
    }

    private static PullRequestCardViewModel CreatePr(
        string repoOwner,
        string repoName,
        int number,
        bool isMyPr = false,
        string statusDotColor = "gray",
        DateTime updatedAt = default)
    {
        return new PullRequestCardViewModel
        {
            RepoOwner = repoOwner,
            RepoName = repoName,
            Number = number,
            Title = $"PR #{number}",
            IsMyPr = isMyPr,
            StatusDotColor = statusDotColor,
            UpdatedAt = updatedAt == default ? DateTime.UtcNow : updatedAt,
        };
    }
}
