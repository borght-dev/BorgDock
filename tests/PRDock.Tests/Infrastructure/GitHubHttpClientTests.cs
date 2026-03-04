using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Infrastructure;
using PRDock.App.Services;

namespace PRDock.Tests.Infrastructure;

public class GitHubHttpClientTests
{
    private readonly IGitHubAuthService _authService = Substitute.For<IGitHubAuthService>();
    private readonly ILogger<GitHubHttpClient> _logger = Substitute.For<ILogger<GitHubHttpClient>>();

    private record TestPayload(int Id, string NodeId, string FullName);

    private GitHubHttpClient CreateSut(HttpMessageHandler handler)
    {
        var factory = Substitute.For<IHttpClientFactory>();
        var client = new HttpClient(handler) { BaseAddress = new Uri("https://api.github.com/") };
        factory.CreateClient("GitHub").Returns(client);
        return new GitHubHttpClient(factory, _authService, _logger);
    }

    [Fact]
    public async Task GetAsync_InjectsAuthorizationHeader()
    {
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns("ghp_mytoken");

        string? capturedAuth = null;
        var handler = new DelegatingHandlerStub((req, _) =>
        {
            capturedAuth = req.Headers.Authorization?.ToString();
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"id\":1,\"node_id\":\"abc\",\"full_name\":\"test/repo\"}")
            });
        });

        var sut = CreateSut(handler);
        await sut.GetAsync<TestPayload>("repos/test/repo");

        capturedAuth.Should().Be("Bearer ghp_mytoken");
    }

    [Fact]
    public async Task GetAsync_NoToken_OmitsAuthorizationHeader()
    {
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns((string?)null);

        bool hasAuth = true;
        var handler = new DelegatingHandlerStub((req, _) =>
        {
            hasAuth = req.Headers.Authorization is not null;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"id\":1,\"node_id\":\"abc\",\"full_name\":\"test/repo\"}")
            });
        });

        var sut = CreateSut(handler);
        await sut.GetAsync<TestPayload>("repos/test/repo");

        hasAuth.Should().BeFalse();
    }

    [Fact]
    public async Task GetAsync_DeserializesSnakeCaseJson()
    {
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns("token");

        var handler = new DelegatingHandlerStub((_, _) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"id\":42,\"node_id\":\"MDQ6\",\"full_name\":\"owner/repo\"}")
            }));

        var sut = CreateSut(handler);
        var result = await sut.GetAsync<TestPayload>("repos/owner/repo");

        result.Should().NotBeNull();
        result!.Id.Should().Be(42);
        result.NodeId.Should().Be("MDQ6");
        result.FullName.Should().Be("owner/repo");
    }

    [Fact]
    public async Task GetAsync_CachesETagAndReturnsCachedOnNotModified()
    {
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns("token");

        int callCount = 0;
        var handler = new DelegatingHandlerStub((req, _) =>
        {
            callCount++;
            if (callCount == 1)
            {
                // First call: return data with ETag
                var response = new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"id\":1,\"node_id\":\"abc\",\"full_name\":\"test/repo\"}")
                };
                response.Headers.ETag = new EntityTagHeaderValue("\"etag-123\"");
                return Task.FromResult(response);
            }
            else
            {
                // Second call: verify If-None-Match was sent, return 304
                req.Headers.IfNoneMatch.Should().ContainSingle()
                    .Which.Tag.Should().Be("\"etag-123\"");
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotModified));
            }
        });

        var sut = CreateSut(handler);

        // First request — populates cache
        var result1 = await sut.GetAsync<TestPayload>("repos/test/repo");
        result1!.Id.Should().Be(1);

        // Second request — 304 returns cached
        var result2 = await sut.GetAsync<TestPayload>("repos/test/repo");
        result2!.Id.Should().Be(1);
        result2.FullName.Should().Be("test/repo");

        callCount.Should().Be(2);
    }

    [Fact]
    public async Task GetRawAsync_ParsesRateLimitHeaders()
    {
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns("token");

        var handler = new DelegatingHandlerStub((_, _) =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{}")
            };
            response.Headers.Add("X-RateLimit-Remaining", "4999");
            response.Headers.Add("X-RateLimit-Reset", "1700000000");
            return Task.FromResult(response);
        });

        var sut = CreateSut(handler);
        await sut.GetRawAsync("rate_limit");

        sut.RateLimitRemaining.Should().Be(4999);
        sut.RateLimitReset.Should().Be(DateTimeOffset.FromUnixTimeSeconds(1700000000));
    }

    [Fact]
    public async Task RateLimitRemaining_DefaultsToMinusOne()
    {
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns("token");

        var handler = new DelegatingHandlerStub((_, _) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{}")
            }));

        var sut = CreateSut(handler);
        sut.RateLimitRemaining.Should().Be(-1);
        sut.RateLimitReset.Should().BeNull();

        // After request with no rate limit headers, values remain default
        await sut.GetRawAsync("test");
        sut.RateLimitRemaining.Should().Be(-1);
    }

    /// <summary>
    /// Simple delegating handler that allows specifying a lambda for handling requests in tests.
    /// </summary>
    private sealed class DelegatingHandlerStub : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _handler;

        public DelegatingHandlerStub(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => _handler(request, cancellationToken);
    }
}
