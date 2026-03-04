using System.Net;
using System.Net.Http;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class GitHubActionsServiceExtensionsTests
{
    private readonly IHttpClientFactory _httpClientFactory = Substitute.For<IHttpClientFactory>();
    private readonly IGitHubAuthService _authService = Substitute.For<IGitHubAuthService>();
    private readonly ILogger<GitHubActionsService> _logger = Substitute.For<ILogger<GitHubActionsService>>();

    private GitHubActionsService CreateService() => new(_httpClientFactory, _authService, _logger);

    private FakeHttpMessageHandler SetupHttpClient(string responseContent, HttpStatusCode statusCode = HttpStatusCode.OK, string contentType = "application/json")
    {
        var handler = new FakeHttpMessageHandler(responseContent, statusCode, contentType);
        var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };
        _httpClientFactory.CreateClient("GitHub").Returns(client);
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns("fake-token");
        return handler;
    }

    // --- GetWorkflowJobsAsync ---

    [Fact]
    public async Task GetWorkflowJobsAsync_DeserializesResponse()
    {
        const string json = """
        {
            "total_count": 2,
            "jobs": [
                {
                    "id": 300,
                    "name": "build",
                    "status": "completed",
                    "conclusion": "success",
                    "started_at": "2025-06-01T10:00:00Z",
                    "completed_at": "2025-06-01T10:05:00Z",
                    "html_url": "https://github.com/owner/repo/actions/runs/50/jobs/300"
                },
                {
                    "id": 301,
                    "name": "test",
                    "status": "completed",
                    "conclusion": "failure",
                    "started_at": "2025-06-01T10:00:00Z",
                    "completed_at": "2025-06-01T10:03:00Z",
                    "html_url": "https://github.com/owner/repo/actions/runs/50/jobs/301"
                }
            ]
        }
        """;
        SetupHttpClient(json);

        var service = CreateService();
        var result = await service.GetWorkflowJobsAsync("owner", "repo", 50);

        result.Should().HaveCount(2);
        result[0].Id.Should().Be(300);
        result[0].Name.Should().Be("build");
        result[0].Status.Should().Be("completed");
        result[0].Conclusion.Should().Be("success");
        result[0].StartedAt.Should().NotBeNull();
        result[0].CompletedAt.Should().NotBeNull();
        result[0].RunId.Should().Be(50);
        result[0].HtmlUrl.Should().Contain("300");
        result[1].Id.Should().Be(301);
        result[1].Name.Should().Be("test");
        result[1].Conclusion.Should().Be("failure");
    }

    [Fact]
    public async Task GetWorkflowJobsAsync_EmptyResponse_ReturnsEmptyList()
    {
        const string json = """{ "total_count": 0, "jobs": [] }""";
        SetupHttpClient(json);

        var service = CreateService();
        var result = await service.GetWorkflowJobsAsync("owner", "repo", 50);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetWorkflowJobsAsync_HttpError_Throws()
    {
        SetupHttpClient("{}", HttpStatusCode.InternalServerError);

        var service = CreateService();
        var act = () => service.GetWorkflowJobsAsync("owner", "repo", 50);

        await act.Should().ThrowAsync<HttpRequestException>();
    }

    [Fact]
    public async Task GetWorkflowJobsAsync_UsesCorrectUrl()
    {
        const string json = """{ "total_count": 0, "jobs": [] }""";
        var handler = SetupHttpClient(json);

        var service = CreateService();
        await service.GetWorkflowJobsAsync("myowner", "myrepo", 42);

        handler.LastRequest!.RequestUri!.PathAndQuery.Should().Be("/repos/myowner/myrepo/actions/runs/42/jobs");
    }

    // --- GetJobLogAsync ---

    [Fact]
    public async Task GetJobLogAsync_ReturnsRawLogString()
    {
        const string logContent = "2025-06-01T10:00:00Z Starting build...\n2025-06-01T10:01:00Z Build complete.";
        SetupHttpClient(logContent, contentType: "text/plain");

        var service = CreateService();
        var result = await service.GetJobLogAsync("owner", "repo", 300);

        result.Should().Contain("Starting build...");
        result.Should().Contain("Build complete.");
    }

    [Fact]
    public async Task GetJobLogAsync_HttpError_Throws()
    {
        SetupHttpClient("", HttpStatusCode.NotFound);

        var service = CreateService();
        var act = () => service.GetJobLogAsync("owner", "repo", 999);

        await act.Should().ThrowAsync<HttpRequestException>();
    }

    [Fact]
    public async Task GetJobLogAsync_UsesCorrectUrl()
    {
        var handler = SetupHttpClient("log content", contentType: "text/plain");

        var service = CreateService();
        await service.GetJobLogAsync("myowner", "myrepo", 123);

        handler.LastRequest!.RequestUri!.PathAndQuery.Should().Be("/repos/myowner/myrepo/actions/jobs/123/logs");
    }

    // --- ReRunWorkflowAsync ---

    [Fact]
    public async Task ReRunWorkflowAsync_SendsPostRequest()
    {
        var handler = SetupHttpClient("", HttpStatusCode.Created);

        var service = CreateService();
        await service.ReRunWorkflowAsync("owner", "repo", 50);

        handler.LastRequest!.Method.Should().Be(HttpMethod.Post);
    }

    [Fact]
    public async Task ReRunWorkflowAsync_UsesCorrectUrl()
    {
        var handler = SetupHttpClient("", HttpStatusCode.Created);

        var service = CreateService();
        await service.ReRunWorkflowAsync("myowner", "myrepo", 77);

        handler.LastRequest!.RequestUri!.PathAndQuery.Should().Be("/repos/myowner/myrepo/actions/runs/77/rerun");
    }

    [Fact]
    public async Task ReRunWorkflowAsync_HttpError_Throws()
    {
        SetupHttpClient("{}", HttpStatusCode.Forbidden);

        var service = CreateService();
        var act = () => service.ReRunWorkflowAsync("owner", "repo", 50);

        await act.Should().ThrowAsync<HttpRequestException>();
    }

    // --- GetPullRequestFilesAsync ---

    [Fact]
    public async Task GetPullRequestFilesAsync_ReturnsFileNames()
    {
        const string json = """
        [
            { "filename": "src/App.cs" },
            { "filename": "tests/AppTests.cs" },
            { "filename": "README.md" }
        ]
        """;
        SetupHttpClient(json);

        var service = CreateService();
        var result = await service.GetPullRequestFilesAsync("owner", "repo", 42);

        result.Should().HaveCount(3);
        result.Should().Contain("src/App.cs");
        result.Should().Contain("tests/AppTests.cs");
        result.Should().Contain("README.md");
    }

    [Fact]
    public async Task GetPullRequestFilesAsync_EmptyResponse_ReturnsEmptyList()
    {
        const string json = "[]";
        SetupHttpClient(json);

        var service = CreateService();
        var result = await service.GetPullRequestFilesAsync("owner", "repo", 42);

        result.Should().BeEmpty();
    }

    [Fact]
    public async Task GetPullRequestFilesAsync_HttpError_Throws()
    {
        SetupHttpClient("{}", HttpStatusCode.NotFound);

        var service = CreateService();
        var act = () => service.GetPullRequestFilesAsync("owner", "repo", 999);

        await act.Should().ThrowAsync<HttpRequestException>();
    }

    [Fact]
    public async Task GetPullRequestFilesAsync_UsesCorrectUrl()
    {
        var handler = SetupHttpClient("[]");

        var service = CreateService();
        await service.GetPullRequestFilesAsync("myowner", "myrepo", 55);

        handler.LastRequest!.RequestUri!.PathAndQuery.Should().Be("/repos/myowner/myrepo/pulls/55/files");
    }

    [Fact]
    public async Task GetPullRequestFilesAsync_SetsAuthorizationHeader()
    {
        var handler = SetupHttpClient("[]");

        var service = CreateService();
        await service.GetPullRequestFilesAsync("owner", "repo", 1);

        handler.LastRequest!.Headers.Authorization!.Scheme.Should().Be("Bearer");
        handler.LastRequest.Headers.Authorization.Parameter.Should().Be("fake-token");
    }

    private sealed class FakeHttpMessageHandler : HttpMessageHandler
    {
        private readonly string _responseContent;
        private readonly HttpStatusCode _statusCode;
        private readonly string _contentType;

        public HttpRequestMessage? LastRequest { get; private set; }

        public FakeHttpMessageHandler(string responseContent, HttpStatusCode statusCode, string contentType = "application/json")
        {
            _responseContent = responseContent;
            _statusCode = statusCode;
            _contentType = contentType;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            LastRequest = request;
            var response = new HttpResponseMessage(_statusCode)
            {
                Content = new StringContent(_responseContent, System.Text.Encoding.UTF8, _contentType)
            };
            return Task.FromResult(response);
        }
    }
}
