using System.Diagnostics;
using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed class GitHubAuthService : IGitHubAuthService
{
    private readonly ISettingsService _settingsService;
    private readonly ILogger<GitHubAuthService> _logger;
    private string? _cachedToken;

    public GitHubAuthService(ISettingsService settingsService, ILogger<GitHubAuthService> logger)
    {
        _settingsService = settingsService;
        _logger = logger;
    }

    public bool IsAuthenticated => !string.IsNullOrEmpty(_cachedToken);

    public async Task<string?> GetTokenAsync(CancellationToken ct = default)
    {
        if (_cachedToken is not null)
            return _cachedToken;

        var settings = _settingsService.CurrentSettings.GitHub;

        if (settings.AuthMethod == "ghCli")
        {
            var token = await TryGetGhCliTokenAsync(ct);
            if (!string.IsNullOrEmpty(token))
            {
                _cachedToken = token;
                _logger.LogInformation("Authenticated via gh CLI.");
                return _cachedToken;
            }

            _logger.LogWarning("gh CLI auth failed, falling back to PAT.");
        }

        if (!string.IsNullOrEmpty(settings.PersonalAccessToken))
        {
            _cachedToken = settings.PersonalAccessToken;
            _logger.LogInformation("Authenticated via PAT.");
            return _cachedToken;
        }

        _logger.LogWarning("No GitHub authentication available.");
        return null;
    }

    private static async Task<string?> TryGetGhCliTokenAsync(CancellationToken ct)
    {
        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "gh",
                    Arguments = "auth token",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            process.Start();
            var output = await process.StandardOutput.ReadToEndAsync(ct);
            await process.WaitForExitAsync(ct);

            if (process.ExitCode == 0)
            {
                var token = output.Trim();
                return string.IsNullOrEmpty(token) ? null : token;
            }
        }
        catch (Exception)
        {
            // gh CLI not installed or not available
        }

        return null;
    }
}
