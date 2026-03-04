using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class WorktreeServiceTests
{
    private readonly IGitCommandRunner _git = Substitute.For<IGitCommandRunner>();
    private readonly ILogger<WorktreeService> _logger = Substitute.For<ILogger<WorktreeService>>();

    private WorktreeService CreateService() => new(_git, _logger);

    #region SanitizeBranchName

    [Theory]
    [InlineData("feature/my-branch", "feature-my-branch")]
    [InlineData("feature/nested/deep", "feature-nested-deep")]
    [InlineData("simple", "simple")]
    [InlineData("has:colons", "hascolons")]
    [InlineData("has\"quotes", "hasquotes")]
    [InlineData("has<angle>brackets", "hasanglebrackets")]
    [InlineData("has|pipe", "haspipe")]
    [InlineData("has?question", "hasquestion")]
    [InlineData("has*star", "hasstar")]
    [InlineData("trail/", "trail")]
    [InlineData("/lead", "lead")]
    [InlineData("a//b", "a-b")]
    [InlineData("...dots...", "dots")]
    public void SanitizeBranchName_HandlesVariousInputs(string input, string expected)
    {
        WorktreeService.SanitizeBranchName(input).Should().Be(expected);
    }

    [Fact]
    public void SanitizeBranchName_EmptyString_ReturnsEmpty()
    {
        WorktreeService.SanitizeBranchName("").Should().BeEmpty();
    }

    #endregion

    #region ParseWorktreeListOutput

    [Fact]
    public void ParseWorktreeListOutput_SingleMainWorktree()
    {
        var output = """
            worktree /home/user/repo
            HEAD abc1234567890
            branch refs/heads/main

            """;

        var result = WorktreeService.ParseWorktreeListOutput(output);

        result.Should().HaveCount(1);
        result[0].Path.Should().Be("/home/user/repo");
        result[0].BranchName.Should().Be("main");
        result[0].IsMainWorktree.Should().BeTrue();
    }

    [Fact]
    public void ParseWorktreeListOutput_MultipleWorktrees()
    {
        var output = """
            worktree /home/user/repo
            HEAD abc123
            branch refs/heads/main

            worktree /home/user/repo/.worktrees/feature-xyz
            HEAD def456
            branch refs/heads/feature/xyz

            worktree /home/user/repo/.worktrees/fix-bug
            HEAD 789abc
            branch refs/heads/fix/bug

            """;

        var result = WorktreeService.ParseWorktreeListOutput(output);

        result.Should().HaveCount(3);

        result[0].Path.Should().Be("/home/user/repo");
        result[0].BranchName.Should().Be("main");
        result[0].IsMainWorktree.Should().BeTrue();

        result[1].Path.Should().Be("/home/user/repo/.worktrees/feature-xyz");
        result[1].BranchName.Should().Be("feature/xyz");
        result[1].IsMainWorktree.Should().BeFalse();

        result[2].Path.Should().Be("/home/user/repo/.worktrees/fix-bug");
        result[2].BranchName.Should().Be("fix/bug");
        result[2].IsMainWorktree.Should().BeFalse();
    }

    [Fact]
    public void ParseWorktreeListOutput_EmptyOutput_ReturnsEmpty()
    {
        WorktreeService.ParseWorktreeListOutput("").Should().BeEmpty();
        WorktreeService.ParseWorktreeListOutput("  ").Should().BeEmpty();
    }

    [Fact]
    public void ParseWorktreeListOutput_BareWorktreeIsSkipped()
    {
        var output = """
            worktree /home/user/repo.git
            HEAD abc123
            bare

            worktree /home/user/repo/.worktrees/feature-a
            HEAD def456
            branch refs/heads/feature/a

            """;

        var result = WorktreeService.ParseWorktreeListOutput(output);

        result.Should().HaveCount(1);
        result[0].BranchName.Should().Be("feature/a");
        result[0].IsMainWorktree.Should().BeFalse();
    }

    [Fact]
    public void ParseWorktreeListOutput_DetachedHead_EmptyBranch()
    {
        var output = """
            worktree /home/user/repo
            HEAD abc123
            branch refs/heads/main

            worktree /home/user/repo/.worktrees/detached
            HEAD def456
            detached

            """;

        var result = WorktreeService.ParseWorktreeListOutput(output);

        result.Should().HaveCount(2);
        result[1].BranchName.Should().BeEmpty();
        result[1].IsMainWorktree.Should().BeFalse();
    }

    [Fact]
    public void ParseWorktreeListOutput_WindowsPaths()
    {
        var output = "worktree D:/Projects/repo\r\nHEAD abc123\r\nbranch refs/heads/main\r\n\r\n" +
                     "worktree D:/Projects/repo/.worktrees/feat-x\r\nHEAD def456\r\nbranch refs/heads/feat/x\r\n\r\n";

        var result = WorktreeService.ParseWorktreeListOutput(output);

        result.Should().HaveCount(2);
        result[0].Path.Should().Be("D:/Projects/repo");
        result[1].Path.Should().Be("D:/Projects/repo/.worktrees/feat-x");
    }

    #endregion

    #region DiscoverWorktreesAsync

    [Fact]
    public async Task DiscoverWorktreesAsync_ReturnsWorktrees()
    {
        var porcelain = "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n";
        _git.RunAsync("/repo", "worktree list --porcelain", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult((porcelain, "", 0)));

        var svc = CreateService();
        var result = await svc.DiscoverWorktreesAsync("/repo");

        result.Should().HaveCount(1);
        result[0].BranchName.Should().Be("main");
    }

    [Fact]
    public async Task DiscoverWorktreesAsync_GitFailure_ReturnsEmpty()
    {
        _git.RunAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("", "not a git repo", 128)));

        var svc = CreateService();
        var result = await svc.DiscoverWorktreesAsync("/bad-path");

        result.Should().BeEmpty();
    }

    #endregion

    #region FindOrCreateWorktreeAsync

    [Fact]
    public async Task FindOrCreateWorktreeAsync_ExistingWorktree_ReturnsPath()
    {
        var porcelain = "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n" +
                        "worktree /repo/.worktrees/feature-xyz\nHEAD def\nbranch refs/heads/feature/xyz\n\n";

        _git.RunAsync("/repo", "worktree list --porcelain", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult((porcelain, "", 0)));

        var svc = CreateService();
        var result = await svc.FindOrCreateWorktreeAsync("/repo", ".worktrees", "feature/xyz");

        result.Should().Be("/repo/.worktrees/feature-xyz");

        await _git.DidNotReceive().RunAsync(Arg.Any<string>(), Arg.Is<string>(s => s.StartsWith("fetch")), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task FindOrCreateWorktreeAsync_NewWorktree_FetchesAndCreates()
    {
        var porcelain = "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n";
        _git.RunAsync("/repo", "worktree list --porcelain", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult((porcelain, "", 0)));

        _git.RunAsync("/repo", "fetch origin feature/new-branch", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("", "", 0)));

        _git.RunAsync("/repo", Arg.Is<string>(s => s.StartsWith("worktree add")), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("", "", 0)));

        var svc = CreateService();
        var result = await svc.FindOrCreateWorktreeAsync("/repo", ".worktrees", "feature/new-branch");

        result.Should().Contain("feature-new-branch");

        await _git.Received(1).RunAsync("/repo", "fetch origin feature/new-branch", Arg.Any<CancellationToken>());
        await _git.Received(1).RunAsync("/repo", Arg.Is<string>(s => s.StartsWith("worktree add")), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task FindOrCreateWorktreeAsync_GitAddFails_Throws()
    {
        var porcelain = "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\n";
        _git.RunAsync("/repo", "worktree list --porcelain", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult((porcelain, "", 0)));

        _git.RunAsync("/repo", Arg.Is<string>(s => s.StartsWith("fetch")), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("", "", 0)));

        _git.RunAsync("/repo", Arg.Is<string>(s => s.StartsWith("worktree add")), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("", "fatal: path already exists", 128)));

        var svc = CreateService();
        var act = () => svc.FindOrCreateWorktreeAsync("/repo", ".worktrees", "feature/broken");

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*feature/broken*");
    }

    #endregion

    #region CheckLocalChangesAsync

    [Fact]
    public async Task CheckLocalChangesAsync_BranchCheckedOutWithChanges_ReturnsTrue()
    {
        _git.RunAsync("/repo", "rev-parse --abbrev-ref HEAD", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("feature/xyz\n", "", 0)));

        _git.RunAsync("/repo", "status --porcelain", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult((" M src/file.cs\n", "", 0)));

        var svc = CreateService();
        var result = await svc.CheckLocalChangesAsync("/repo", "feature/xyz");

        result.Should().BeTrue();
    }

    [Fact]
    public async Task CheckLocalChangesAsync_BranchCheckedOutNoChanges_ReturnsFalse()
    {
        _git.RunAsync("/repo", "rev-parse --abbrev-ref HEAD", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("feature/xyz\n", "", 0)));

        _git.RunAsync("/repo", "status --porcelain", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("", "", 0)));

        var svc = CreateService();
        var result = await svc.CheckLocalChangesAsync("/repo", "feature/xyz");

        result.Should().BeFalse();
    }

    [Fact]
    public async Task CheckLocalChangesAsync_DifferentBranchCheckedOut_ReturnsFalse()
    {
        _git.RunAsync("/repo", "rev-parse --abbrev-ref HEAD", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("main\n", "", 0)));

        var svc = CreateService();
        var result = await svc.CheckLocalChangesAsync("/repo", "feature/xyz");

        result.Should().BeFalse();

        await _git.DidNotReceive().RunAsync(Arg.Any<string>(), "status --porcelain", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task CheckLocalChangesAsync_GitRevParseFails_ReturnsFalse()
    {
        _git.RunAsync("/repo", "rev-parse --abbrev-ref HEAD", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("", "fatal: not a git repo", 128)));

        var svc = CreateService();
        var result = await svc.CheckLocalChangesAsync("/repo", "feature/xyz");

        result.Should().BeFalse();
    }

    #endregion

    #region RemoveWorktreeAsync

    [Fact]
    public async Task RemoveWorktreeAsync_Success()
    {
        _git.RunAsync("/repo", "worktree remove \"/repo/.worktrees/feature-old\"", Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("", "", 0)));

        var svc = CreateService();
        var act = () => svc.RemoveWorktreeAsync("/repo", "/repo/.worktrees/feature-old");

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task RemoveWorktreeAsync_Failure_Throws()
    {
        _git.RunAsync("/repo", Arg.Is<string>(s => s.StartsWith("worktree remove")), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(("", "fatal: cannot remove", 1)));

        var svc = CreateService();
        var act = () => svc.RemoveWorktreeAsync("/repo", "/repo/.worktrees/feature-old");

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*feature-old*");
    }

    #endregion
}
