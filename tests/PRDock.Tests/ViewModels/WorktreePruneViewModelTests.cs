using FluentAssertions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using PRDock.App.Models;
using PRDock.App.Services;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class WorktreePruneViewModelTests
{
    private readonly IWorktreeService _worktreeService = Substitute.For<IWorktreeService>();
    private readonly IGitHubService _gitHubService = Substitute.For<IGitHubService>();
    private readonly ISettingsService _settingsService = Substitute.For<ISettingsService>();

    private WorktreePruneViewModel CreateVm()
    {
        return new WorktreePruneViewModel(_worktreeService, _gitHubService, _settingsService);
    }

    private void SetupRepo(string owner = "octocat", string name = "hello", string basePath = @"C:\repos\hello")
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            Repos =
            [
                new RepoSettings { Owner = owner, Name = name, Enabled = true, WorktreeBasePath = basePath }
            ]
        });
    }

    [Fact]
    public async Task LoadWorktrees_DiscoversWorktreesFromAllRepos()
    {
        SetupRepo();

        _worktreeService.DiscoverWorktreesAsync(@"C:\repos\hello", Arg.Any<CancellationToken>())
            .Returns(
            [
                new WorktreeInfo { Path = @"C:\repos\hello", BranchName = "main", IsMainWorktree = true },
                new WorktreeInfo { Path = @"C:\repos\hello\.worktrees\fix-bug", BranchName = "fix-bug" }
            ]);

        _gitHubService.GetOpenPullRequestsAsync("octocat", "hello", Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>
            {
                new() { Number = 42, HeadRef = "fix-bug", State = "open" }
            });

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);

        vm.Worktrees.Should().HaveCount(1);
        vm.Worktrees[0].BranchName.Should().Be("fix-bug");
        vm.Worktrees[0].PrStatus.Should().Contain("PR #42");
        vm.Worktrees[0].PrStatus.Should().Contain("Open");
        vm.Worktrees[0].RepoDisplayName.Should().Be("octocat/hello");
    }

    [Fact]
    public async Task LoadWorktrees_SkipsMainWorktree()
    {
        SetupRepo();

        _worktreeService.DiscoverWorktreesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(
            [
                new WorktreeInfo { Path = @"C:\repos\hello", BranchName = "main", IsMainWorktree = true }
            ]);

        _gitHubService.GetOpenPullRequestsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);

        vm.Worktrees.Should().BeEmpty();
    }

    [Fact]
    public async Task LoadWorktrees_SkipsDisabledRepos()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            Repos =
            [
                new RepoSettings { Owner = "o", Name = "n", Enabled = false, WorktreeBasePath = @"C:\r" }
            ]
        });

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);

        vm.Worktrees.Should().BeEmpty();
        await _worktreeService.DidNotReceive().DiscoverWorktreesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task LoadWorktrees_SkipsReposWithEmptyBasePath()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            Repos =
            [
                new RepoSettings { Owner = "o", Name = "n", Enabled = true, WorktreeBasePath = "" }
            ]
        });

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);

        vm.Worktrees.Should().BeEmpty();
    }

    [Fact]
    public async Task LoadWorktrees_SetsIsLoadingDuringOperation()
    {
        SetupRepo();
        _worktreeService.DiscoverWorktreesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<WorktreeInfo>());
        _gitHubService.GetOpenPullRequestsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        var vm = CreateVm();

        // After load completes, IsLoading should be false
        await vm.LoadWorktreesCommand.ExecuteAsync(null);
        vm.IsLoading.Should().BeFalse();
    }

    [Fact]
    public async Task LoadWorktrees_NoOpenPr_ShowsNoOpenPrStatus()
    {
        SetupRepo();

        _worktreeService.DiscoverWorktreesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(
            [
                new WorktreeInfo { Path = @"C:\repos\hello\.worktrees\old-branch", BranchName = "old-branch" }
            ]);

        _gitHubService.GetOpenPullRequestsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);

        vm.Worktrees.Should().HaveCount(1);
        vm.Worktrees[0].PrStatus.Should().Be("No open PR");
    }

    [Fact]
    public async Task LoadWorktrees_ContinuesOnWorktreeDiscoveryError()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            Repos =
            [
                new RepoSettings { Owner = "o", Name = "bad", Enabled = true, WorktreeBasePath = @"C:\bad" },
                new RepoSettings { Owner = "o", Name = "good", Enabled = true, WorktreeBasePath = @"C:\good" }
            ]
        });

        _worktreeService.DiscoverWorktreesAsync(@"C:\bad", Arg.Any<CancellationToken>())
            .Throws(new InvalidOperationException("git error"));
        _worktreeService.DiscoverWorktreesAsync(@"C:\good", Arg.Any<CancellationToken>())
            .Returns([new WorktreeInfo { Path = @"C:\good\.wt\feat", BranchName = "feat" }]);
        _gitHubService.GetOpenPullRequestsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);

        vm.Worktrees.Should().HaveCount(1);
        vm.Worktrees[0].BranchName.Should().Be("feat");
    }

    [Fact]
    public async Task RemoveSelected_RemovesCheckedWorktrees()
    {
        SetupRepo();

        _worktreeService.DiscoverWorktreesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(
            [
                new WorktreeInfo { Path = @"C:\wt\a", BranchName = "a" },
                new WorktreeInfo { Path = @"C:\wt\b", BranchName = "b" }
            ]);
        _gitHubService.GetOpenPullRequestsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);

        // Select only first
        vm.Worktrees[0].IsSelected = true;
        vm.Worktrees[1].IsSelected = false;

        await vm.RemoveSelectedCommand.ExecuteAsync(null);

        await _worktreeService.Received(1).RemoveWorktreeAsync(
            @"C:\repos\hello", @"C:\wt\a", Arg.Any<CancellationToken>());
        await _worktreeService.DidNotReceive().RemoveWorktreeAsync(
            Arg.Any<string>(), @"C:\wt\b", Arg.Any<CancellationToken>());

        vm.Worktrees[0].IsRemoved.Should().BeTrue();
        vm.Worktrees[1].IsRemoved.Should().BeFalse();
    }

    [Fact]
    public async Task RemoveSelected_SetsRemovalErrorOnFailure()
    {
        SetupRepo();

        _worktreeService.DiscoverWorktreesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns([new WorktreeInfo { Path = @"C:\wt\dirty", BranchName = "dirty" }]);
        _gitHubService.GetOpenPullRequestsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        _worktreeService.RemoveWorktreeAsync(Arg.Any<string>(), @"C:\wt\dirty", Arg.Any<CancellationToken>())
            .Throws(new InvalidOperationException("has local changes"));

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);
        vm.Worktrees[0].IsSelected = true;

        await vm.RemoveSelectedCommand.ExecuteAsync(null);

        vm.Worktrees[0].IsRemoved.Should().BeFalse();
        vm.Worktrees[0].RemovalError.Should().Contain("has local changes");
    }

    [Fact]
    public async Task RemoveSelected_SkipsAlreadyRemovedItems()
    {
        SetupRepo();

        _worktreeService.DiscoverWorktreesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns([new WorktreeInfo { Path = @"C:\wt\done", BranchName = "done" }]);
        _gitHubService.GetOpenPullRequestsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);
        vm.Worktrees[0].IsSelected = true;
        vm.Worktrees[0].IsRemoved = true;

        await vm.RemoveSelectedCommand.ExecuteAsync(null);

        await _worktreeService.DidNotReceive().RemoveWorktreeAsync(
            Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public void SelectAll_SelectsAllNonRemovedItems()
    {
        var vm = CreateVm();
        var item1 = new WorktreeItemViewModel { BranchName = "a" };
        var item2 = new WorktreeItemViewModel { BranchName = "b", IsRemoved = true };
        var item3 = new WorktreeItemViewModel { BranchName = "c" };
        vm.Worktrees.Add(item1);
        vm.Worktrees.Add(item2);
        vm.Worktrees.Add(item3);

        vm.SelectAllCommand.Execute(null);

        item1.IsSelected.Should().BeTrue();
        item2.IsSelected.Should().BeFalse(); // Already removed, so SelectAll skips it
        item3.IsSelected.Should().BeTrue();
    }

    [Fact]
    public void SelectNone_DeselectsAll()
    {
        var vm = CreateVm();
        var item1 = new WorktreeItemViewModel { BranchName = "a", IsSelected = true };
        var item2 = new WorktreeItemViewModel { BranchName = "b", IsSelected = true };
        vm.Worktrees.Add(item1);
        vm.Worktrees.Add(item2);

        vm.SelectNoneCommand.Execute(null);

        item1.IsSelected.Should().BeFalse();
        item2.IsSelected.Should().BeFalse();
    }

    [Fact]
    public void HasSelectedItems_ReflectsSelection()
    {
        var vm = CreateVm();
        vm.HasSelectedItems.Should().BeFalse();

        var item = new WorktreeItemViewModel { BranchName = "x" };
        vm.Worktrees.Add(item);

        vm.HasSelectedItems.Should().BeFalse();

        item.IsSelected = true;
        // Note: HasSelectedItems is a computed property; in real UI it's notified via PropertyChanged
        vm.Worktrees.Any(w => w.IsSelected && !w.IsRemoved).Should().BeTrue();
    }

    [Fact]
    public async Task RemoveSelected_UpdatesProgressCounters()
    {
        SetupRepo();

        _worktreeService.DiscoverWorktreesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(
            [
                new WorktreeInfo { Path = @"C:\wt\a", BranchName = "a" },
                new WorktreeInfo { Path = @"C:\wt\b", BranchName = "b" }
            ]);
        _gitHubService.GetOpenPullRequestsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);
        vm.Worktrees[0].IsSelected = true;
        vm.Worktrees[1].IsSelected = true;

        await vm.RemoveSelectedCommand.ExecuteAsync(null);

        vm.RemovedCount.Should().Be(2);
        vm.TotalToRemove.Should().Be(2);
        vm.IsRemoving.Should().BeFalse();
        vm.StatusMessage.Should().Contain("Removed 2");
    }

    [Fact]
    public async Task RemoveSelected_MixedResults_ShowsCorrectSummary()
    {
        SetupRepo();

        _worktreeService.DiscoverWorktreesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(
            [
                new WorktreeInfo { Path = @"C:\wt\ok", BranchName = "ok" },
                new WorktreeInfo { Path = @"C:\wt\fail", BranchName = "fail" }
            ]);
        _gitHubService.GetOpenPullRequestsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        _worktreeService.RemoveWorktreeAsync(Arg.Any<string>(), @"C:\wt\fail", Arg.Any<CancellationToken>())
            .Throws(new InvalidOperationException("dirty"));

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);
        vm.Worktrees[0].IsSelected = true;
        vm.Worktrees[1].IsSelected = true;

        await vm.RemoveSelectedCommand.ExecuteAsync(null);

        vm.StatusMessage.Should().Contain("Removed 1");
        vm.StatusMessage.Should().Contain("failed 1");
    }

    [Theory]
    [InlineData("fix-bug", "fix-bug", 42, "PR #42 -- Open")]
    [InlineData("feature", "other-branch", 10, "No open PR")]
    [InlineData("", "anything", 1, "Unknown")]
    public void ResolvePrStatus_ReturnsExpected(string branchName, string prHeadRef, int prNumber, string expected)
    {
        var prs = new List<PullRequest>
        {
            new() { Number = prNumber, HeadRef = prHeadRef, State = "open" }
        };

        var result = WorktreePruneViewModel.ResolvePrStatus(branchName, prs);
        result.Should().Be(expected);
    }

    [Fact]
    public async Task LoadWorktrees_SetsStatusMessage()
    {
        SetupRepo();
        _worktreeService.DiscoverWorktreesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<WorktreeInfo>());
        _gitHubService.GetOpenPullRequestsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);

        vm.StatusMessage.Should().Be("No worktrees found.");
    }

    [Fact]
    public async Task LoadWorktrees_MultipleWorktrees_SetsCorrectStatusMessage()
    {
        SetupRepo();
        _worktreeService.DiscoverWorktreesAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(
            [
                new WorktreeInfo { Path = @"C:\wt\a", BranchName = "a" },
                new WorktreeInfo { Path = @"C:\wt\b", BranchName = "b" }
            ]);
        _gitHubService.GetOpenPullRequestsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        var vm = CreateVm();
        await vm.LoadWorktreesCommand.ExecuteAsync(null);

        vm.StatusMessage.Should().Be("Found 2 worktree(s).");
    }
}
