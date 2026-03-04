using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace PRDock.App.Infrastructure;

public sealed class ProcessTracker : IDisposable
{
    private readonly ConcurrentDictionary<int, TrackedProcess> _processes = new();
    private readonly System.Threading.Timer _pollTimer;
    private readonly ILogger<ProcessTracker> _logger;
    private bool _disposed;

    public ProcessTracker(ILogger<ProcessTracker> logger)
    {
        _logger = logger;
        _pollTimer = new System.Threading.Timer(PollProcesses, null, TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
    }

    public int ActiveSessions => _processes.Count;

    public event EventHandler<ProcessExitedEventArgs>? ProcessExited;

    public void Track(int processId, int prNumber, string description)
    {
        _processes[processId] = new TrackedProcess(processId, prNumber, description);
        _logger.LogInformation("Tracking process {PID} for PR #{PRNumber}: {Description}", processId, prNumber, description);
    }

    public bool IsTracking(int prNumber) =>
        _processes.Values.Any(p => p.PrNumber == prNumber);

    public IReadOnlyList<TrackedProcess> GetActiveSessions() =>
        _processes.Values.ToList();

    private void PollProcesses(object? state)
    {
        foreach (var (pid, tracked) in _processes)
        {
            try
            {
                var process = Process.GetProcessById(pid);
                if (process.HasExited)
                {
                    if (_processes.TryRemove(pid, out _))
                    {
                        _logger.LogInformation("Process {PID} for PR #{PRNumber} exited with code {ExitCode}",
                            pid, tracked.PrNumber, process.ExitCode);
                        ProcessExited?.Invoke(this, new ProcessExitedEventArgs(pid, tracked.PrNumber, process.ExitCode));
                    }
                }
            }
            catch (ArgumentException)
            {
                // Process no longer exists
                if (_processes.TryRemove(pid, out _))
                {
                    _logger.LogInformation("Process {PID} for PR #{PRNumber} no longer exists", pid, tracked.PrNumber);
                    ProcessExited?.Invoke(this, new ProcessExitedEventArgs(pid, tracked.PrNumber, -1));
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error polling process {PID}", pid);
            }
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _pollTimer.Dispose();
    }
}

public sealed record TrackedProcess(int ProcessId, int PrNumber, string Description);

public sealed class ProcessExitedEventArgs(int processId, int prNumber, int exitCode) : EventArgs
{
    public int ProcessId { get; } = processId;
    public int PrNumber { get; } = prNumber;
    public int ExitCode { get; } = exitCode;
}
