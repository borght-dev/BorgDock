using System.Net;
using System.Net.Http;
using Microsoft.Extensions.Logging;

namespace PRDock.App.Infrastructure;

public interface IRetryHandler
{
    Task<HttpResponseMessage> ExecuteAsync(
        Func<CancellationToken, Task<HttpResponseMessage>> action,
        CancellationToken ct = default);
}

public sealed class RetryHandler : IRetryHandler
{
    private static readonly HashSet<HttpStatusCode> TransientStatusCodes =
    [
        HttpStatusCode.TooManyRequests,
        HttpStatusCode.InternalServerError,
        HttpStatusCode.BadGateway,
        HttpStatusCode.ServiceUnavailable
    ];

    private readonly ILogger<RetryHandler> _logger;
    private readonly int _maxRetries;
    private readonly TimeSpan _baseDelay;

    public RetryHandler(ILogger<RetryHandler> logger, int maxRetries = 3, TimeSpan? baseDelay = null)
    {
        _logger = logger;
        _maxRetries = maxRetries;
        _baseDelay = baseDelay ?? TimeSpan.FromSeconds(1);
    }

    public async Task<HttpResponseMessage> ExecuteAsync(
        Func<CancellationToken, Task<HttpResponseMessage>> action,
        CancellationToken ct = default)
    {
        HttpResponseMessage? lastResponse = null;

        for (int attempt = 0; attempt <= _maxRetries; attempt++)
        {
            ct.ThrowIfCancellationRequested();

            try
            {
                var response = await action(ct);

                if (!IsTransient(response.StatusCode) || attempt == _maxRetries)
                    return response;

                var delay = GetDelay(attempt, response);
                _logger.LogWarning(
                    "Transient HTTP {StatusCode} on attempt {Attempt}/{MaxRetries}, retrying after {Delay}ms",
                    (int)response.StatusCode, attempt + 1, _maxRetries, delay.TotalMilliseconds);

                lastResponse?.Dispose();
                lastResponse = response;

                await Task.Delay(delay, ct);
            }
            catch (HttpRequestException ex) when (attempt < _maxRetries)
            {
                var delay = GetDelay(attempt, null);
                _logger.LogWarning(ex,
                    "HTTP request failed on attempt {Attempt}/{MaxRetries}, retrying after {Delay}ms",
                    attempt + 1, _maxRetries, delay.TotalMilliseconds);

                await Task.Delay(delay, ct);
            }
            catch (TaskCanceledException ex) when (!ct.IsCancellationRequested && attempt < _maxRetries)
            {
                var delay = GetDelay(attempt, null);
                _logger.LogWarning(ex,
                    "HTTP request timed out on attempt {Attempt}/{MaxRetries}, retrying after {Delay}ms",
                    attempt + 1, _maxRetries, delay.TotalMilliseconds);

                await Task.Delay(delay, ct);
            }
        }

        return lastResponse ?? throw new InvalidOperationException("Retry loop completed without a response.");
    }

    private TimeSpan GetDelay(int attempt, HttpResponseMessage? response)
    {
        if (response?.Headers.RetryAfter?.Delta is { } retryAfter)
            return retryAfter;

        if (response?.Headers.RetryAfter?.Date is { } retryDate)
        {
            var wait = retryDate - DateTimeOffset.UtcNow;
            if (wait > TimeSpan.Zero)
                return wait > TimeSpan.FromMinutes(2) ? TimeSpan.FromMinutes(2) : wait;
        }

        return TimeSpan.FromTicks(_baseDelay.Ticks * (1L << attempt));
    }

    internal static bool IsTransient(HttpStatusCode statusCode) => TransientStatusCodes.Contains(statusCode);
}
