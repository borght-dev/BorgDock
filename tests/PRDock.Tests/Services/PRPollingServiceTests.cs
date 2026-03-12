using System.Net.Http;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using PRDock.App.Infrastructure;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class PRPollingServiceTests : IDisposable
{
    private readonly IGitHubService _gitHubService = Substitute.For<IGitHubService>();
    private readonly IGitHubActionsService _actionsService = Substitute.For<IGitHubActionsService>();
    private readonly ISettingsService _settingsService = Substitute.For<ISettingsService>();
    private readonly IPRCacheService _cacheService = Substitute.For<IPRCacheService>();
    private readonly ILogger<PRPollingService> _logger = Substitute.For<ILogger<PRPollingService>>();
    private readonly GitHubHttpClient _httpClient;
    private readonly PRPollingService _sut;

    public PRPollingServiceTests()
    {
        var settings = new AppSettings
        {
            GitHub = new GitHubSettings { PollIntervalSeconds = 60 },
            Repos =
            [
                new RepoSettings { Owner = "octocat", Name = "hello-world", Enabled = true },
                new RepoSettings { Owner = "octocat", Name = "disabled-repo", Enabled = false }
            ]
        };
        _settingsService.CurrentSettings.Returns(settings);

        var httpFactory = Substitute.For<IHttpClientFactory>();
        var authService = Substitute.For<IGitHubAuthService>();
        var retryHandler = Substitute.For<IRetryHandler>();
        var httpLogger = Substitute.For<ILogger<GitHubHttpClient>>();
        _httpClient = new GitHubHttpClient(httpFactory, authService, retryHandler, httpLogger);

        _sut = new PRPollingService(_gitHubService, _actionsService, _settingsService, _cacheService, _httpClient, _logger);
    }

    public void Dispose()
    {
        _sut.Dispose();
    }

    [Fact]
    public void StartPolling_SetsIsPollingToTrue()
    {
        _sut.StartPolling();

        _sut.IsPolling.Should().BeTrue();
    }

    [Fact]
    public void StopPolling_SetsIsPollingToFalse()
    {
        _sut.StartPolling();
        _sut.StopPolling();

        _sut.IsPolling.Should().BeFalse();
    }

    [Fact]
    public void StartPolling_WhenAlreadyPolling_DoesNotThrow()
    {
        _sut.StartPolling();

        var act = () => _sut.StartPolling();

        act.Should().NotThrow();
    }

    [Fact]
    public void StopPolling_WhenNotPolling_DoesNotThrow()
    {
        var act = () => _sut.StopPolling();

        act.Should().NotThrow();
    }

    [Fact]
    public async Task PollNowAsync_CallsGitHubServiceForEachEnabledRepo()
    {
        _gitHubService.GetOpenPullRequestsAsync("octocat", "hello-world", Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        await _sut.PollNowAsync();

        await _gitHubService.Received(1)
            .GetOpenPullRequestsAsync("octocat", "hello-world", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task PollNowAsync_SkipsDisabledRepos()
    {
        _gitHubService.GetOpenPullRequestsAsync("octocat", "hello-world", Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest>());

        await _sut.PollNowAsync();

        await _gitHubService.DidNotReceive()
            .GetOpenPullRequestsAsync("octocat", "disabled-repo", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task PollNowAsync_FetchesCheckRunsForRefForEachPR()
    {
        var pr = new PullRequest { Number = 1, HeadRef = "abc123", RepoOwner = "octocat", RepoName = "hello-world" };
        _gitHubService.GetOpenPullRequestsAsync("octocat", "hello-world", Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest> { pr });

        var checkRun = new CheckRun { Id = 100, Name = "build", Status = "completed", Conclusion = "success", CheckSuiteId = 10 };
        _actionsService.GetCheckRunsForRefAsync("octocat", "hello-world", "abc123", Arg.Any<CancellationToken>())
            .Returns(new List<CheckRun> { checkRun });

        await _sut.PollNowAsync();

        await _actionsService.Received(1)
            .GetCheckRunsForRefAsync("octocat", "hello-world", "abc123", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task PollNowAsync_RaisesPollCompletedWithCorrectData()
    {
        var pr = new PullRequest { Number = 1, HeadRef = "abc123", RepoOwner = "octocat", RepoName = "hello-world" };
        _gitHubService.GetOpenPullRequestsAsync("octocat", "hello-world", Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest> { pr });

        var checkRun = new CheckRun { Id = 100, Name = "build", Status = "completed", Conclusion = "success", CheckSuiteId = 10 };
        _actionsService.GetCheckRunsForRefAsync("octocat", "hello-world", "abc123", Arg.Any<CancellationToken>())
            .Returns(new List<CheckRun> { checkRun });

        IReadOnlyList<PullRequestWithChecks>? result = null;
        _sut.PollCompleted += data => result = data;

        await _sut.PollNowAsync();

        result.Should().NotBeNull();
        result.Should().HaveCount(1);
        result![0].PullRequest.Number.Should().Be(1);
        result[0].Checks.Should().HaveCount(1);
        result[0].Checks[0].Name.Should().Be("build");
        result[0].OverallStatus.Should().Be("green");
    }

    [Fact]
    public async Task PollNowAsync_RaisesPollFailedOnException()
    {
        _gitHubService.GetOpenPullRequestsAsync("octocat", "hello-world", Arg.Any<CancellationToken>())
            .ThrowsAsync(new HttpRequestException("Network error"));

        Exception? capturedException = null;
        _sut.PollFailed += ex => capturedException = ex;

        await _sut.PollNowAsync();

        capturedException.Should().NotBeNull();
        capturedException.Should().BeOfType<HttpRequestException>();
        capturedException!.Message.Should().Be("Network error");
    }

    [Fact]
    public async Task PollNowAsync_WithNoRepos_RaisesPollCompletedWithEmptyList()
    {
        var settings = new AppSettings { GitHub = new GitHubSettings(), Repos = [] };
        _settingsService.CurrentSettings.Returns(settings);

        IReadOnlyList<PullRequestWithChecks>? result = null;
        _sut.PollCompleted += data => result = data;

        await _sut.PollNowAsync();

        result.Should().NotBeNull();
        result.Should().BeEmpty();
    }

    [Fact]
    public async Task PollNowAsync_WithMultipleCheckRuns_AggregatesCorrectly()
    {
        var pr = new PullRequest { Number = 1, HeadRef = "abc123", RepoOwner = "octocat", RepoName = "hello-world" };
        _gitHubService.GetOpenPullRequestsAsync("octocat", "hello-world", Arg.Any<CancellationToken>())
            .Returns(new List<PullRequest> { pr });

        _actionsService.GetCheckRunsForRefAsync("octocat", "hello-world", "abc123", Arg.Any<CancellationToken>())
            .Returns(new List<CheckRun>
            {
                new() { Id = 100, Name = "build", Status = "completed", Conclusion = "success", CheckSuiteId = 10 },
                new() { Id = 200, Name = "lint", Status = "completed", Conclusion = "failure", CheckSuiteId = 20 }
            });

        IReadOnlyList<PullRequestWithChecks>? result = null;
        _sut.PollCompleted += data => result = data;

        await _sut.PollNowAsync();

        result.Should().HaveCount(1);
        result![0].Checks.Should().HaveCount(2);
        result[0].OverallStatus.Should().Be("red");
        result[0].FailedCheckNames.Should().Contain("lint");
        result[0].PassedCount.Should().Be(1);
    }

    [Fact]
    public void Dispose_StopsPolling()
    {
        _sut.StartPolling();
        _sut.Dispose();

        _sut.IsPolling.Should().BeFalse();
    }

    [Fact]
    public void Dispose_CalledMultipleTimes_DoesNotThrow()
    {
        _sut.StartPolling();

        var act = () =>
        {
            _sut.Dispose();
            _sut.Dispose();
        };

        act.Should().NotThrow();
    }
}
