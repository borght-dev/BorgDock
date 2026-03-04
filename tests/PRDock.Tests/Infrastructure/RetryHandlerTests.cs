using System.Net;
using System.Net.Http;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Infrastructure;

namespace PRDock.Tests.Infrastructure;

public class RetryHandlerTests
{
    private readonly ILogger<RetryHandler> _logger = Substitute.For<ILogger<RetryHandler>>();

    private RetryHandler CreateSut(int maxRetries = 3, TimeSpan? baseDelay = null)
        => new(_logger, maxRetries, baseDelay ?? TimeSpan.FromMilliseconds(1));

    [Fact]
    public async Task ExecuteAsync_SuccessOnFirstTry_ReturnsImmediately()
    {
        var sut = CreateSut();
        int callCount = 0;

        var result = await sut.ExecuteAsync(ct =>
        {
            callCount++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));
        });

        result.StatusCode.Should().Be(HttpStatusCode.OK);
        callCount.Should().Be(1);
    }

    [Fact]
    public async Task ExecuteAsync_TransientThenSuccess_Retries()
    {
        var sut = CreateSut();
        int callCount = 0;

        var result = await sut.ExecuteAsync(ct =>
        {
            callCount++;
            if (callCount < 3)
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));
        });

        result.StatusCode.Should().Be(HttpStatusCode.OK);
        callCount.Should().Be(3);
    }

    [Fact]
    public async Task ExecuteAsync_AllRetriesFail_ReturnsLastResponse()
    {
        var sut = CreateSut(maxRetries: 2);
        int callCount = 0;

        var result = await sut.ExecuteAsync(ct =>
        {
            callCount++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.BadGateway));
        });

        result.StatusCode.Should().Be(HttpStatusCode.BadGateway);
        callCount.Should().Be(3);
    }

    [Theory]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.BadGateway)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    public async Task ExecuteAsync_TransientStatusCodes_AreRetried(HttpStatusCode statusCode)
    {
        var sut = CreateSut(maxRetries: 1);
        int callCount = 0;

        await sut.ExecuteAsync(ct =>
        {
            callCount++;
            if (callCount == 1)
                return Task.FromResult(new HttpResponseMessage(statusCode));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));
        });

        callCount.Should().Be(2);
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.Unauthorized)]
    public async Task ExecuteAsync_NonTransientStatusCodes_AreNotRetried(HttpStatusCode statusCode)
    {
        var sut = CreateSut(maxRetries: 2);
        int callCount = 0;

        var result = await sut.ExecuteAsync(ct =>
        {
            callCount++;
            return Task.FromResult(new HttpResponseMessage(statusCode));
        });

        result.StatusCode.Should().Be(statusCode);
        callCount.Should().Be(1);
    }

    [Fact]
    public async Task ExecuteAsync_HttpRequestException_IsRetried()
    {
        var sut = CreateSut(maxRetries: 1);
        int callCount = 0;

        var result = await sut.ExecuteAsync(ct =>
        {
            callCount++;
            if (callCount == 1)
                throw new HttpRequestException("Connection refused");
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));
        });

        result.StatusCode.Should().Be(HttpStatusCode.OK);
        callCount.Should().Be(2);
    }

    [Fact]
    public async Task ExecuteAsync_CancellationRequested_ThrowsImmediately()
    {
        var sut = CreateSut();
        var cts = new CancellationTokenSource();
        cts.Cancel();

        var act = () => sut.ExecuteAsync(
            ct => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)),
            cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
    }

    [Fact]
    public void IsTransient_CorrectlyIdentifiesTransientCodes()
    {
        RetryHandler.IsTransient(HttpStatusCode.TooManyRequests).Should().BeTrue();
        RetryHandler.IsTransient(HttpStatusCode.InternalServerError).Should().BeTrue();
        RetryHandler.IsTransient(HttpStatusCode.BadGateway).Should().BeTrue();
        RetryHandler.IsTransient(HttpStatusCode.ServiceUnavailable).Should().BeTrue();

        RetryHandler.IsTransient(HttpStatusCode.OK).Should().BeFalse();
        RetryHandler.IsTransient(HttpStatusCode.NotFound).Should().BeFalse();
        RetryHandler.IsTransient(HttpStatusCode.Unauthorized).Should().BeFalse();
    }

    [Fact]
    public async Task ExecuteAsync_MaxRetriesZero_OnlyTriesOnce()
    {
        var sut = CreateSut(maxRetries: 0);
        int callCount = 0;

        var result = await sut.ExecuteAsync(ct =>
        {
            callCount++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        });

        callCount.Should().Be(1);
        result.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
    }
}
