using System.Net;
using System.Net.Http;
using System.Text;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Models;
using PRDock.App.Services;
using static PRDock.App.Services.GitHubService;

namespace PRDock.Tests.Services;

public class GitHubServiceTests
{
    private readonly ISettingsService _settingsService = Substitute.For<ISettingsService>();
    private readonly IGitHubAuthService _authService = Substitute.For<IGitHubAuthService>();
    private readonly ILogger<GitHubService> _logger = Substitute.For<ILogger<GitHubService>>();

    public GitHubServiceTests()
    {
        var settings = new AppSettings
        {
            GitHub = new GitHubSettings
            {
                PersonalAccessToken = "ghp_test123"
            }
        };
        _settingsService.CurrentSettings.Returns(settings);
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns("ghp_test123");
    }

    private GitHubService CreateService(HttpMessageHandler handler)
    {
        var factory = Substitute.For<IHttpClientFactory>();
        var client = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://api.github.com/")
        };
        factory.CreateClient("GitHub").Returns(client);

        return new GitHubService(factory, _authService, _settingsService, _logger);
    }

    private static MockHttpMessageHandler CreateMockHandler(
        Dictionary<string, string> responses)
    {
        return new MockHttpMessageHandler(responses);
    }

    [Fact]
    public async Task GetOpenPullRequestsAsync_DeserializesSinglePr()
    {
        const string prJson = """
        [
            {
                "number": 1,
                "title": "Add feature X",
                "state": "open",
                "html_url": "https://github.com/acme/repo/pull/1",
                "created_at": "2025-01-15T10:30:00Z",
                "updated_at": "2025-01-16T12:00:00Z",
                "draft": false,
                "mergeable": true,
                "comments": 3,
                "user": {
                    "login": "octocat",
                    "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4"
                },
                "head": { "ref": "feature-x" },
                "base": { "ref": "main" },
                "labels": [
                    { "name": "enhancement" },
                    { "name": "ready" }
                ]
            }
        ]
        """;

        const string reviewsJson = """
        [
            {
                "state": "APPROVED",
                "user": { "login": "reviewer1" }
            }
        ]
        """;

        var handler = CreateMockHandler(new Dictionary<string, string>
        {
            ["repos/acme/repo/pulls?state=open"] = prJson,
            ["repos/acme/repo/pulls/1/reviews"] = reviewsJson
        });

        var service = CreateService(handler);
        var prs = await service.GetOpenPullRequestsAsync("acme", "repo");

        prs.Should().HaveCount(1);
        var pr = prs[0];
        pr.Number.Should().Be(1);
        pr.Title.Should().Be("Add feature X");
        pr.State.Should().Be("open");
        pr.HtmlUrl.Should().Be("https://github.com/acme/repo/pull/1");
        pr.CreatedAt.Should().Be(new DateTime(2025, 1, 15, 10, 30, 0, DateTimeKind.Utc));
        pr.UpdatedAt.Should().Be(new DateTime(2025, 1, 16, 12, 0, 0, DateTimeKind.Utc));
        pr.IsDraft.Should().BeFalse();
        pr.Mergeable.Should().BeTrue();
        pr.CommentCount.Should().Be(3);
        pr.AuthorLogin.Should().Be("octocat");
        pr.AuthorAvatarUrl.Should().Be("https://avatars.githubusercontent.com/u/1?v=4");
        pr.HeadRef.Should().Be("feature-x");
        pr.BaseRef.Should().Be("main");
        pr.Labels.Should().BeEquivalentTo(["enhancement", "ready"]);
        pr.RepoOwner.Should().Be("acme");
        pr.RepoName.Should().Be("repo");
        pr.ReviewStatus.Should().Be(ReviewStatus.Approved);
    }

    [Fact]
    public async Task GetOpenPullRequestsAsync_EmptyList_ReturnsEmpty()
    {
        var handler = CreateMockHandler(new Dictionary<string, string>
        {
            ["repos/acme/repo/pulls?state=open"] = "[]"
        });

        var service = CreateService(handler);
        var prs = await service.GetOpenPullRequestsAsync("acme", "repo");

        prs.Should().BeEmpty();
    }

    [Fact]
    public async Task GetOpenPullRequestsAsync_MultiplePrs_FetchesReviewsForEach()
    {
        const string prJson = """
        [
            { "number": 1, "title": "PR 1", "state": "open", "html_url": "", "created_at": "2025-01-01T00:00:00Z", "updated_at": "2025-01-01T00:00:00Z", "draft": false, "comments": 0, "user": { "login": "a" }, "head": { "ref": "b1" }, "base": { "ref": "main" }, "labels": [] },
            { "number": 2, "title": "PR 2", "state": "open", "html_url": "", "created_at": "2025-01-01T00:00:00Z", "updated_at": "2025-01-01T00:00:00Z", "draft": true, "comments": 1, "user": { "login": "b" }, "head": { "ref": "b2" }, "base": { "ref": "main" }, "labels": [] }
        ]
        """;

        var handler = CreateMockHandler(new Dictionary<string, string>
        {
            ["repos/acme/repo/pulls?state=open"] = prJson,
            ["repos/acme/repo/pulls/1/reviews"] = "[]",
            ["repos/acme/repo/pulls/2/reviews"] = """[{ "state": "COMMENTED", "user": { "login": "reviewer" } }]"""
        });

        var service = CreateService(handler);
        var prs = await service.GetOpenPullRequestsAsync("acme", "repo");

        prs.Should().HaveCount(2);
        prs[0].Number.Should().Be(1);
        prs[0].ReviewStatus.Should().Be(ReviewStatus.None);
        prs[1].Number.Should().Be(2);
        prs[1].IsDraft.Should().BeTrue();
        prs[1].ReviewStatus.Should().Be(ReviewStatus.Commented);
    }

    [Fact]
    public async Task GetOpenPullRequestsAsync_DraftPr_SetIsDraftTrue()
    {
        const string prJson = """
        [
            { "number": 10, "title": "WIP", "state": "open", "html_url": "", "created_at": "2025-01-01T00:00:00Z", "updated_at": "2025-01-01T00:00:00Z", "draft": true, "comments": 0, "user": { "login": "dev" }, "head": { "ref": "wip" }, "base": { "ref": "main" }, "labels": [] }
        ]
        """;

        var handler = CreateMockHandler(new Dictionary<string, string>
        {
            ["repos/acme/repo/pulls?state=open"] = prJson,
            ["repos/acme/repo/pulls/10/reviews"] = "[]"
        });

        var service = CreateService(handler);
        var prs = await service.GetOpenPullRequestsAsync("acme", "repo");

        prs[0].IsDraft.Should().BeTrue();
    }

    // --- Review aggregation tests ---

    [Fact]
    public void AggregateReviewStatus_EmptyReviews_ReturnsNone()
    {
        var result = GitHubService.AggregateReviewStatus([]);
        result.Should().Be(ReviewStatus.None);
    }

    [Fact]
    public void AggregateReviewStatus_SingleApproval_ReturnsApproved()
    {
        var reviews = new List<GitHubReviewDto>
        {
            new() { State = "APPROVED", User = new GitHubUserDto { Login = "alice" } }
        };

        GitHubService.AggregateReviewStatus(reviews).Should().Be(ReviewStatus.Approved);
    }

    [Fact]
    public void AggregateReviewStatus_ChangesRequested_TakesPrecedence()
    {
        var reviews = new List<GitHubReviewDto>
        {
            new() { State = "APPROVED", User = new GitHubUserDto { Login = "alice" } },
            new() { State = "CHANGES_REQUESTED", User = new GitHubUserDto { Login = "bob" } }
        };

        GitHubService.AggregateReviewStatus(reviews).Should().Be(ReviewStatus.ChangesRequested);
    }

    [Fact]
    public void AggregateReviewStatus_ApprovedOverCommented()
    {
        var reviews = new List<GitHubReviewDto>
        {
            new() { State = "COMMENTED", User = new GitHubUserDto { Login = "alice" } },
            new() { State = "APPROVED", User = new GitHubUserDto { Login = "bob" } }
        };

        GitHubService.AggregateReviewStatus(reviews).Should().Be(ReviewStatus.Approved);
    }

    [Fact]
    public void AggregateReviewStatus_CommentedOverPending()
    {
        var reviews = new List<GitHubReviewDto>
        {
            new() { State = "PENDING", User = new GitHubUserDto { Login = "alice" } },
            new() { State = "COMMENTED", User = new GitHubUserDto { Login = "bob" } }
        };

        GitHubService.AggregateReviewStatus(reviews).Should().Be(ReviewStatus.Commented);
    }

    [Fact]
    public void AggregateReviewStatus_PendingOnly_ReturnsPending()
    {
        var reviews = new List<GitHubReviewDto>
        {
            new() { State = "PENDING", User = new GitHubUserDto { Login = "alice" } }
        };

        GitHubService.AggregateReviewStatus(reviews).Should().Be(ReviewStatus.Pending);
    }

    [Fact]
    public void AggregateReviewStatus_LatestReviewPerUser_Wins()
    {
        // Alice first requests changes, then approves
        var reviews = new List<GitHubReviewDto>
        {
            new() { State = "CHANGES_REQUESTED", User = new GitHubUserDto { Login = "alice" } },
            new() { State = "APPROVED", User = new GitHubUserDto { Login = "alice" } }
        };

        GitHubService.AggregateReviewStatus(reviews).Should().Be(ReviewStatus.Approved);
    }

    [Fact]
    public void AggregateReviewStatus_LatestPerUser_MixedReviewers()
    {
        // Alice: changes_requested -> approved (latest = approved)
        // Bob: approved -> changes_requested (latest = changes_requested)
        var reviews = new List<GitHubReviewDto>
        {
            new() { State = "CHANGES_REQUESTED", User = new GitHubUserDto { Login = "alice" } },
            new() { State = "APPROVED", User = new GitHubUserDto { Login = "bob" } },
            new() { State = "APPROVED", User = new GitHubUserDto { Login = "alice" } },
            new() { State = "CHANGES_REQUESTED", User = new GitHubUserDto { Login = "bob" } }
        };

        // Bob's latest is CHANGES_REQUESTED, so overall = ChangesRequested
        GitHubService.AggregateReviewStatus(reviews).Should().Be(ReviewStatus.ChangesRequested);
    }

    [Fact]
    public void AggregateReviewStatus_ReviewsWithNullUser_AreIgnored()
    {
        var reviews = new List<GitHubReviewDto>
        {
            new() { State = "APPROVED", User = null },
            new() { State = "COMMENTED", User = new GitHubUserDto { Login = "alice" } }
        };

        GitHubService.AggregateReviewStatus(reviews).Should().Be(ReviewStatus.Commented);
    }

    // --- MockHttpMessageHandler ---

    private sealed class MockHttpMessageHandler : HttpMessageHandler
    {
        private readonly Dictionary<string, string> _responses;

        public MockHttpMessageHandler(Dictionary<string, string> responses)
        {
            _responses = responses;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.PathAndQuery.TrimStart('/');

            if (_responses.TryGetValue(path, out var json))
            {
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(json, Encoding.UTF8, "application/json")
                });
            }

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
        }
    }
}
