using FluentAssertions;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class RepoDiscoveryServiceTests
{
    [Fact]
    public void ParseGitHubRemote_HttpsUrl_ExtractsOwnerAndName()
    {
        var config = """
            [remote "origin"]
                url = https://github.com/octocat/Hello-World.git
                fetch = +refs/heads/*:refs/remotes/origin/*
            """;

        var result = RepoDiscoveryService.ParseGitHubRemote(config, @"C:\Dev\Hello-World");

        result.Should().NotBeNull();
        result!.Owner.Should().Be("octocat");
        result.Name.Should().Be("Hello-World");
        result.LocalPath.Should().Be(@"C:\Dev\Hello-World");
    }

    [Fact]
    public void ParseGitHubRemote_SshUrl_ExtractsOwnerAndName()
    {
        var config = """
            [remote "origin"]
                url = git@github.com:octocat/Hello-World.git
                fetch = +refs/heads/*:refs/remotes/origin/*
            """;

        var result = RepoDiscoveryService.ParseGitHubRemote(config, @"D:\repos\Hello-World");

        result.Should().NotBeNull();
        result!.Owner.Should().Be("octocat");
        result.Name.Should().Be("Hello-World");
    }

    [Fact]
    public void ParseGitHubRemote_HttpsWithoutGitSuffix_ExtractsName()
    {
        var config = """
            [remote "origin"]
                url = https://github.com/myorg/myrepo
            """;

        var result = RepoDiscoveryService.ParseGitHubRemote(config, @"C:\Dev\myrepo");

        result.Should().NotBeNull();
        result!.Owner.Should().Be("myorg");
        result.Name.Should().Be("myrepo");
    }

    [Fact]
    public void ParseGitHubRemote_NonGitHubUrl_ReturnsNull()
    {
        var config = """
            [remote "origin"]
                url = https://gitlab.com/octocat/Hello-World.git
            """;

        var result = RepoDiscoveryService.ParseGitHubRemote(config, @"C:\Dev\Hello-World");

        result.Should().BeNull();
    }

    [Fact]
    public void ParseGitHubRemote_NoRemote_ReturnsNull()
    {
        var config = """
            [core]
                bare = false
            """;

        var result = RepoDiscoveryService.ParseGitHubRemote(config, @"C:\Dev\repo");

        result.Should().BeNull();
    }

    [Fact]
    public void ParseGitHubRemote_EmptyConfig_ReturnsNull()
    {
        var result = RepoDiscoveryService.ParseGitHubRemote("", @"C:\Dev\repo");

        result.Should().BeNull();
    }

    [Fact]
    public void ParseGitHubRemote_MultipleRemotes_MatchesFirst()
    {
        var config = """
            [remote "origin"]
                url = https://github.com/octocat/primary-repo.git
            [remote "upstream"]
                url = https://github.com/upstream-org/primary-repo.git
            """;

        var result = RepoDiscoveryService.ParseGitHubRemote(config, @"C:\Dev\repo");

        result.Should().NotBeNull();
        result!.Owner.Should().Be("octocat");
        result.Name.Should().Be("primary-repo");
    }

    [Fact]
    public void ParseGitHubRemote_SshUrl_StripsGitSuffix()
    {
        var config = """
            [remote "origin"]
                url = git@github.com:org/repo-name.git
            """;

        var result = RepoDiscoveryService.ParseGitHubRemote(config, @"C:\Dev\repo-name");

        result.Should().NotBeNull();
        result!.Name.Should().Be("repo-name");
    }
}
