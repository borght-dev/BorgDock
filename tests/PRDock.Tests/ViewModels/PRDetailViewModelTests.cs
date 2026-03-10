using System.Net.Http;
using FluentAssertions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using PRDock.App.Models;
using PRDock.App.Services;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class PRDetailViewModelTests
{
    private readonly IGitHubService _gitHubService = Substitute.For<IGitHubService>();
    private readonly IGitHubActionsService _actionsService = Substitute.For<IGitHubActionsService>();
    private readonly IGitCommandRunner _gitCommandRunner = Substitute.For<IGitCommandRunner>();
    private readonly ISettingsService _settingsService = Substitute.For<ISettingsService>();

    private PRDetailViewModel CreateVm()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings());
        return new PRDetailViewModel(_gitHubService, _actionsService, _gitCommandRunner, _settingsService);
    }

    private void SetupDefaultMocks()
    {
        _gitHubService.GetPullRequestCommitsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequestCommit>());
        _gitHubService.GetPullRequestFilesAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(new List<PullRequestFileChange>());
        _gitHubService.GetAllPullRequestCommentsAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(new List<ClaudeReviewComment>());
    }

    private async Task<PRDetailViewModel> CreateInitializedVmAsync(PullRequestCardViewModel? card = null)
    {
        var vm = CreateVm();
        vm.Initialize(card ?? CreateCard());
        await Task.Delay(50); // let fire-and-forget eager loads complete
        return vm;
    }

    private PullRequestCardViewModel CreateCard(int number = 42) => new()
    {
        Number = number,
        Title = "Fix the thing",
        HeadRef = "feature/fix",
        BaseRef = "main",
        AuthorLogin = "alice",
        HtmlUrl = "https://github.com/org/repo/pull/42",
        IsDraft = false,
        HasMergeConflict = true,
        StatusDotColor = "red",
        ReviewBadgeText = "Changes requested",
        RepoOwner = "org",
        RepoName = "repo",
        Age = "2h ago"
    };

    [Fact]
    public void Initialize_PopulatesHeaderFromCard()
    {
        var vm = CreateVm();
        var card = CreateCard();

        vm.Initialize(card);

        vm.Number.Should().Be(42);
        vm.Title.Should().Be("Fix the thing");
        vm.HeadRef.Should().Be("feature/fix");
        vm.BaseRef.Should().Be("main");
        vm.AuthorLogin.Should().Be("alice");
        vm.HtmlUrl.Should().Be("https://github.com/org/repo/pull/42");
        vm.IsDraft.Should().BeFalse();
        vm.HasMergeConflict.Should().BeTrue();
        vm.StatusDotColor.Should().Be("red");
        vm.ReviewStatusText.Should().Be("Changes requested");
        vm.RepoOwner.Should().Be("org");
        vm.RepoName.Should().Be("repo");
    }

    [Fact]
    public void Initialize_SetsDefaultTabToDescription()
    {
        var vm = CreateVm();
        vm.Initialize(CreateCard());

        vm.ActiveTab.Should().Be("Overview");
    }

    [Fact]
    public async Task SetTab_ChangesActiveTab()
    {
        var vm = CreateVm();
        vm.Initialize(CreateCard());

        _gitHubService.GetPullRequestCommitsAsync("org", "repo", 42, Arg.Any<CancellationToken>())
            .Returns(new List<PullRequestCommit>());

        await vm.SetTabCommand.ExecuteAsync("Commits");

        vm.ActiveTab.Should().Be("Commits");
    }

    [Fact]
    public async Task Initialize_EagerlyLoadsCommits()
    {
        var commits = new List<PullRequestCommit>
        {
            new() { Sha = "abc1234", Message = "Fix bug", AuthorLogin = "alice" },
            new() { Sha = "def5678", Message = "Add test", AuthorLogin = "bob" }
        };
        _gitHubService.GetPullRequestCommitsAsync("org", "repo", 42, Arg.Any<CancellationToken>())
            .Returns(commits);
        SetupDefaultMocks();
        _gitHubService.GetPullRequestCommitsAsync("org", "repo", 42, Arg.Any<CancellationToken>())
            .Returns(commits);

        var vm = await CreateInitializedVmAsync();

        vm.Commits.Should().HaveCount(2);
        vm.CommitCount.Should().Be(2);
        vm.IsCommitsLoading.Should().BeFalse();
    }

    [Fact]
    public async Task SetTab_Commits_DoesNotRefetchAfterEagerLoad()
    {
        SetupDefaultMocks();
        var vm = await CreateInitializedVmAsync();

        await vm.SetTabCommand.ExecuteAsync("Commits");
        await vm.SetTabCommand.ExecuteAsync("Overview");
        await vm.SetTabCommand.ExecuteAsync("Commits");

        // Only 1 call from eager load, no extra from tab switches
        await _gitHubService.Received(1)
            .GetPullRequestCommitsAsync("org", "repo", 42, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Initialize_EagerlyLoadsFilesAndComputesTotals()
    {
        var files = new List<PullRequestFileChange>
        {
            new() { Filename = "src/a.cs", Status = "modified", Additions = 10, Deletions = 5 },
            new() { Filename = "src/b.cs", Status = "added", Additions = 20, Deletions = 0 }
        };
        SetupDefaultMocks();
        _gitHubService.GetPullRequestFilesAsync("org", "repo", 42, Arg.Any<CancellationToken>())
            .Returns(files);

        var vm = await CreateInitializedVmAsync();

        vm.FileChanges.Should().HaveCount(2);
        vm.TotalAdditions.Should().Be(30);
        vm.TotalDeletions.Should().Be(5);
        vm.FilesChangedCount.Should().Be(2);
    }

    [Fact]
    public async Task Initialize_EagerlyLoadsComments()
    {
        var comments = new List<ClaudeReviewComment>
        {
            new() { Id = "1", Author = "alice", Body = "LGTM" },
            new() { Id = "2", Author = "bob", Body = "Looks good" }
        };
        SetupDefaultMocks();
        _gitHubService.GetAllPullRequestCommentsAsync("org", "repo", 42, Arg.Any<CancellationToken>())
            .Returns(comments);

        var vm = await CreateInitializedVmAsync();

        vm.AllComments.Should().HaveCount(2);
        vm.IsCommentsLoading.Should().BeFalse();
    }

    [Fact]
    public async Task Initialize_CommitsFetchFailed_SetsErrorWithoutThrowing()
    {
        SetupDefaultMocks();
        _gitHubService.GetPullRequestCommitsAsync("org", "repo", 42, Arg.Any<CancellationToken>())
            .ThrowsAsync(new HttpRequestException("Network error"));

        var vm = await CreateInitializedVmAsync();

        vm.CommitsError.Should().Contain("Network error");
        vm.IsCommitsLoading.Should().BeFalse();
        vm.Commits.Should().BeEmpty();
    }

    [Fact]
    public async Task Initialize_FilesFetchFailed_SetsErrorWithoutThrowing()
    {
        SetupDefaultMocks();
        _gitHubService.GetPullRequestFilesAsync("org", "repo", 42, Arg.Any<CancellationToken>())
            .ThrowsAsync(new HttpRequestException("Timeout"));

        var vm = await CreateInitializedVmAsync();

        vm.FilesError.Should().Contain("Timeout");
        vm.IsFilesLoading.Should().BeFalse();
    }

    [Fact]
    public async Task Initialize_CommentsFetchFailed_SetsErrorWithoutThrowing()
    {
        SetupDefaultMocks();
        _gitHubService.GetAllPullRequestCommentsAsync("org", "repo", 42, Arg.Any<CancellationToken>())
            .ThrowsAsync(new HttpRequestException("Unauthorized"));

        var vm = await CreateInitializedVmAsync();

        vm.CommentsError.Should().Contain("Unauthorized");
        vm.IsCommentsLoading.Should().BeFalse();
    }

    [Fact]
    public void Close_RaisesCloseRequested()
    {
        var vm = CreateVm();
        var raised = false;
        vm.CloseRequested += () => raised = true;

        vm.CloseCommand.Execute(null);

        raised.Should().BeTrue();
    }

    [Fact]
    public void OpenInBrowser_DoesNotThrowWhenUrlEmpty()
    {
        var vm = CreateVm();
        vm.Initialize(CreateCard());
        vm.HtmlUrl = "";

        var act = () => vm.OpenInBrowserCommand.Execute(null);
        act.Should().NotThrow();
    }

    [Fact]
    public async Task PostComment_CallsServiceAndClearsInput()
    {
        var vm = CreateVm();
        vm.Initialize(CreateCard());
        vm.NewCommentText = "Great work!";

        _gitHubService.GetAllPullRequestCommentsAsync("org", "repo", 42, Arg.Any<CancellationToken>())
            .Returns(new List<ClaudeReviewComment>());

        await vm.PostCommentCommand.ExecuteAsync(null);

        await _gitHubService.Received(1)
            .PostCommentAsync("org", "repo", 42, "Great work!", Arg.Any<CancellationToken>());
        vm.NewCommentText.Should().BeEmpty();
    }

    [Fact]
    public async Task PostComment_EmptyText_DoesNotCallService()
    {
        var vm = CreateVm();
        vm.Initialize(CreateCard());
        vm.NewCommentText = "";

        await vm.PostCommentCommand.ExecuteAsync(null);

        await _gitHubService.DidNotReceive()
            .PostCommentAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<int>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SubmitReview_Approve_CallsServiceWithCorrectEvent()
    {
        var vm = CreateVm();
        vm.Initialize(CreateCard());

        await vm.SubmitReviewCommand.ExecuteAsync("APPROVE");

        await _gitHubService.Received(1)
            .SubmitReviewAsync("org", "repo", 42, "APPROVE", null, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SubmitReview_RequestChanges_CallsServiceWithBody()
    {
        var vm = CreateVm();
        vm.Initialize(CreateCard());
        vm.ReviewBody = "Needs more tests";

        await vm.SubmitReviewCommand.ExecuteAsync("REQUEST_CHANGES");

        await _gitHubService.Received(1)
            .SubmitReviewAsync("org", "repo", 42, "REQUEST_CHANGES", "Needs more tests", Arg.Any<CancellationToken>());
        vm.ReviewBody.Should().BeEmpty();
    }

    [Fact]
    public async Task SubmitReview_Failed_ShowsToast()
    {
        var vm = CreateVm();
        vm.Initialize(CreateCard());

        _gitHubService.SubmitReviewAsync("org", "repo", 42, "APPROVE", null, Arg.Any<CancellationToken>())
            .ThrowsAsync(new HttpRequestException("Forbidden"));

        await vm.SubmitReviewCommand.ExecuteAsync("APPROVE");

        vm.ToastMessage.Should().Contain("Review failed");
        vm.IsSubmittingReview.Should().BeFalse();
    }

    [Fact]
    public async Task CheckoutBranch_NoWorkDir_ShowsToast()
    {
        var vm = CreateVm();
        _settingsService.CurrentSettings.Returns(new AppSettings());
        vm.Initialize(CreateCard());

        await vm.CheckoutBranchCommand.ExecuteAsync(null);

        vm.ToastMessage.Should().Contain("No worktree path configured");
    }

    [Fact]
    public async Task CheckoutBranch_Success_FetchesThenChecksOut()
    {
        var vm = CreateVm();
        var settings = new AppSettings();
        settings.Repos.Add(new RepoSettings { Owner = "org", Name = "repo", WorktreeBasePath = "/code/repo" });
        _settingsService.CurrentSettings.Returns(settings);
        vm.Initialize(CreateCard());

        _gitCommandRunner.RunAsync("/code/repo", "fetch origin feature/fix", Arg.Any<CancellationToken>())
            .Returns(("", "", 0));
        _gitCommandRunner.RunAsync("/code/repo", "checkout feature/fix", Arg.Any<CancellationToken>())
            .Returns(("", "", 0));

        await vm.CheckoutBranchCommand.ExecuteAsync(null);

        await _gitCommandRunner.Received(1).RunAsync("/code/repo", "fetch origin feature/fix", Arg.Any<CancellationToken>());
        await _gitCommandRunner.Received(1).RunAsync("/code/repo", "checkout feature/fix", Arg.Any<CancellationToken>());
        vm.ToastMessage.Should().Contain("Checked out feature/fix");
    }

    [Fact]
    public async Task CheckoutBranch_Failure_ShowsErrorToast()
    {
        var vm = CreateVm();
        var settings = new AppSettings();
        settings.Repos.Add(new RepoSettings { Owner = "org", Name = "repo", WorktreeBasePath = "/code/repo" });
        _settingsService.CurrentSettings.Returns(settings);
        vm.Initialize(CreateCard());

        _gitCommandRunner.RunAsync("/code/repo", "fetch origin feature/fix", Arg.Any<CancellationToken>())
            .Returns(("", "", 0));
        _gitCommandRunner.RunAsync("/code/repo", "checkout feature/fix", Arg.Any<CancellationToken>())
            .Returns(("", "error: pathspec 'feature/fix' did not match any file(s)", 1));

        await vm.CheckoutBranchCommand.ExecuteAsync(null);

        vm.ToastMessage.Should().Contain("Checkout failed");
    }

    [Fact]
    public void Initialize_ResetsTabState()
    {
        var vm = CreateVm();
        vm.Initialize(CreateCard());

        // Verify initial state
        vm.Commits.Should().BeEmpty();
        vm.FileChanges.Should().BeEmpty();
        vm.AllComments.Should().BeEmpty();
        vm.ActiveTab.Should().Be("Overview");
        vm.NewCommentText.Should().BeEmpty();
    }

    [Fact]
    public async Task PostComment_RefreshesCommentsList()
    {
        var vm = CreateVm();
        vm.Initialize(CreateCard());
        vm.NewCommentText = "Hello";

        var updatedComments = new List<ClaudeReviewComment>
        {
            new() { Id = "1", Author = "alice", Body = "Hello" }
        };
        _gitHubService.GetAllPullRequestCommentsAsync("org", "repo", 42, Arg.Any<CancellationToken>())
            .Returns(updatedComments);

        await vm.PostCommentCommand.ExecuteAsync(null);

        vm.AllComments.Should().HaveCount(1);
    }

    [Fact]
    public async Task SetTab_Overview_DoesNotFetchExtraData()
    {
        SetupDefaultMocks();
        var vm = await CreateInitializedVmAsync();

        // Switching to Overview tab after eager load does not trigger additional fetches
        await vm.SetTabCommand.ExecuteAsync("Overview");

        // Eager load called each once; tab switch shouldn't add more
        await _gitHubService.Received(1)
            .GetPullRequestCommitsAsync("org", "repo", 42, Arg.Any<CancellationToken>());
        await _gitHubService.Received(1)
            .GetPullRequestFilesAsync("org", "repo", 42, Arg.Any<CancellationToken>());
    }

    [Fact]
    public void ToggleDraftCommand_RaisesToggleDraftRequested()
    {
        var vm = CreateVm();
        bool raised = false;
        vm.ToggleDraftRequested += () => raised = true;

        vm.ToggleDraftCommand.Execute(null);

        raised.Should().BeTrue();
    }

    [Fact]
    public void Initialize_SetsIsDraftFromCard()
    {
        var vm = CreateVm();
        var card = CreateCard();
        card.IsDraft = true;

        vm.Initialize(card);

        vm.IsDraft.Should().BeTrue();
        vm.IsNotDraft.Should().BeFalse();
        vm.DraftReadinessDetail.Should().Be("Still in draft");
    }
}
