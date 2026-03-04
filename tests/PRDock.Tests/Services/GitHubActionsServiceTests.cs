using System.Net;
using System.Net.Http;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class GitHubActionsServiceTests
{
    private readonly IHttpClientFactory _httpClientFactory = Substitute.For<IHttpClientFactory>();
    private readonly IGitHubAuthService _authService = Substitute.For<IGitHubAuthService>();
    private readonly ILogger<GitHubActionsService> _logger = Substitute.For<ILogger<GitHubActionsService>>();

    private GitHubActionsService CreateService() => new(_httpClientFactory, _authService, _logger);

    private void SetupHttpClient(string responseJson, HttpStatusCode statusCode = HttpStatusCode.OK)
    {
        var handler = new FakeHttpMessageHandler(responseJson, statusCode);
        var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };
        _httpClientFactory.CreateClient("GitHub").Returns(client);
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns("fake-token");
    }

    [Fact]
    public async Task GetCheckSuitesAsync_DeserializesResponse()
    {
        const string json = """
        {
            "total_count": 2,
            "check_suites": [
                {
                    "id": 100,
                    "status": "completed",
                    "conclusion": "success",
                    "head_sha": "abc123"
                },
                {
                    "id": 101,
                    "status": "in_progress",
                    "conclusion": null,
                    "head_sha": "abc123"
                }
            ]
        }
        """;
        SetupHttpClient(json);

        var service = CreateService();
        var result = await service.GetCheckSuitesAsync("owner", "repo", "abc123");

        result.Should().HaveCount(2);
        result[0].Id.Should().Be(100);
        result[0].Status.Should().Be("completed");
        result[0].Conclusion.Should().Be("success");
        result[0].HeadSha.Should().Be("abc123");
        result[1].Id.Should().Be(101);
        result[1].Status.Should().Be("in_progress");
        result[1].Conclusion.Should().BeNull();
    }

    [Fact]
    public async Task GetCheckRunsAsync_DeserializesResponse()
    {
        const string json = """
        {
            "total_count": 2,
            "check_runs": [
                {
                    "id": 200,
                    "name": "build",
                    "status": "completed",
                    "conclusion": "success",
                    "started_at": "2025-01-01T10:00:00Z",
                    "completed_at": "2025-01-01T10:05:00Z",
                    "html_url": "https://github.com/owner/repo/runs/200"
                },
                {
                    "id": 201,
                    "name": "test",
                    "status": "completed",
                    "conclusion": "failure",
                    "started_at": "2025-01-01T10:00:00Z",
                    "completed_at": "2025-01-01T10:03:00Z",
                    "html_url": "https://github.com/owner/repo/runs/201"
                }
            ]
        }
        """;
        SetupHttpClient(json);

        var service = CreateService();
        var result = await service.GetCheckRunsAsync("owner", "repo", 100);

        result.Should().HaveCount(2);
        result[0].Id.Should().Be(200);
        result[0].Name.Should().Be("build");
        result[0].Status.Should().Be("completed");
        result[0].Conclusion.Should().Be("success");
        result[0].StartedAt.Should().NotBeNull();
        result[0].CompletedAt.Should().NotBeNull();
        result[0].HtmlUrl.Should().Be("https://github.com/owner/repo/runs/200");
        result[0].CheckSuiteId.Should().Be(100);
        result[1].Id.Should().Be(201);
        result[1].Name.Should().Be("test");
        result[1].IsFailed.Should().BeTrue();
    }

    [Fact]
    public async Task GetCheckSuitesAsync_EmptyResponse_ReturnsEmptyList()
    {
        const string json = """
        {
            "total_count": 0,
            "check_suites": []
        }
        """;
        SetupHttpClient(json);

        var service = CreateService();
        var result = await service.GetCheckSuitesAsync("owner", "repo", "abc123");

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetCheckRunsAsync_EmptyResponse_ReturnsEmptyList()
    {
        const string json = """
        {
            "total_count": 0,
            "check_runs": []
        }
        """;
        SetupHttpClient(json);

        var service = CreateService();
        var result = await service.GetCheckRunsAsync("owner", "repo", 100);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetCheckSuitesAsync_HttpError_Throws()
    {
        SetupHttpClient("{}", HttpStatusCode.InternalServerError);

        var service = CreateService();
        var act = () => service.GetCheckSuitesAsync("owner", "repo", "abc123");

        await act.Should().ThrowAsync<HttpRequestException>();
    }

    [Fact]
    public async Task GetCheckRunsAsync_SetsAuthorizationHeader()
    {
        const string json = """{ "total_count": 0, "check_runs": [] }""";
        var handler = new FakeHttpMessageHandler(json, HttpStatusCode.OK);
        var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };
        _httpClientFactory.CreateClient("GitHub").Returns(client);
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns("my-token");

        var service = CreateService();
        await service.GetCheckRunsAsync("owner", "repo", 1);

        handler.LastRequest!.Headers.Authorization!.Scheme.Should().Be("Bearer");
        handler.LastRequest.Headers.Authorization.Parameter.Should().Be("my-token");
    }

    private sealed class FakeHttpMessageHandler : HttpMessageHandler
    {
        private readonly string _responseJson;
        private readonly HttpStatusCode _statusCode;

        public HttpRequestMessage? LastRequest { get; private set; }

        public FakeHttpMessageHandler(string responseJson, HttpStatusCode statusCode)
        {
            _responseJson = responseJson;
            _statusCode = statusCode;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            var response = new HttpResponseMessage(_statusCode)
            {
                Content = new StringContent(_responseJson, System.Text.Encoding.UTF8, "application/json")
            };
            return Task.FromResult(response);
        }
    }
}
