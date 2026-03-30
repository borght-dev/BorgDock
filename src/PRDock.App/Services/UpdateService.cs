using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

/// <summary>
/// Update service that migrates from the WPF app to the Tauri app.
/// Fetches the Tauri updater's latest.json from GitHub releases to detect
/// new versions, then downloads the standalone NSIS installer from the
/// release assets and launches it.
/// </summary>
public sealed class UpdateService : IUpdateService
{
    private const string TauriLatestJsonUrl =
        "https://github.com/borght-dev/PRDock/releases/latest/download/latest.json";

    private const string GitHubLatestReleaseApi =
        "https://api.github.com/repos/borght-dev/PRDock/releases/latest";

    private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(4);

    private readonly IGitHubAuthService _authService;
    private readonly ISettingsService _settingsService;
    private readonly ILogger<UpdateService> _logger;
    private readonly HttpClient _httpClient;

    private CancellationTokenSource? _periodicCts;
    private TauriRelease? _pendingRelease;
    private string? _downloadedInstallerPath;
    private bool _isUpdateReady;
    private bool _disposed;

    public UpdateService(
        IGitHubAuthService authService,
        ISettingsService settingsService,
        ILogger<UpdateService> logger,
        HttpClient? httpClient = null)
    {
        _authService = authService;
        _settingsService = settingsService;
        _logger = logger;
        _httpClient = httpClient ?? new HttpClient();
        _httpClient.DefaultRequestHeaders.UserAgent.Add(
            new ProductInfoHeaderValue("PRDock-Updater", "1.0"));
    }

    public bool IsInstalled => true; // Always eligible for migration

    public string CurrentVersion
    {
        get
        {
            var asm = Assembly.GetEntryAssembly() ?? Assembly.GetExecutingAssembly();
            return asm.GetName().Version?.ToString(3) ?? "0.0.0";
        }
    }

    public bool IsUpdateReady => _isUpdateReady;

    public event Action<UpdateInfo>? UpdateAvailable;
    public event Action? UpdateReady;
    public event Action<int>? DownloadProgress;

    public async Task<UpdateInfo?> CheckForUpdateAsync(CancellationToken ct = default)
    {
        try
        {
            var token = await _authService.GetTokenAsync(ct);

            using var request = new HttpRequestMessage(HttpMethod.Get, TauriLatestJsonUrl);
            if (!string.IsNullOrEmpty(token))
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            // Follow redirects to the actual asset URL (GitHub redirects to S3)
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));

            using var response = await _httpClient.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogDebug("Failed to fetch latest.json: {Status}", response.StatusCode);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(ct);
            var release = JsonSerializer.Deserialize<TauriRelease>(json);
            if (release is null || string.IsNullOrEmpty(release.Version))
            {
                _logger.LogDebug("latest.json was empty or malformed");
                return null;
            }

            // Find the Windows platform entry (used to confirm a Windows build exists)
            var platform = release.GetWindowsPlatform();
            if (platform is null)
            {
                _logger.LogDebug("No windows-x86_64 platform in latest.json");
                return null;
            }

            // Find the standalone NSIS installer URL from the GitHub release assets.
            // The latest.json url points to the .nsis.zip (for Tauri's delta updater),
            // but we need the full _x64-setup.exe for a fresh WPF→Tauri migration.
            var installerUrl = await FindInstallerAssetUrlAsync(token, ct);
            if (!string.IsNullOrEmpty(installerUrl))
                release.InstallerUrl = installerUrl;
            else
                _logger.LogDebug("No standalone installer found in release assets, falling back to platform URL");

            // Always offer the Tauri version as an "update" since it's a migration
            _pendingRelease = release;

            var info = new UpdateInfo
            {
                Version = $"{release.Version} (Tauri)",
                ReleaseNotes = release.Notes
            };

            _logger.LogInformation("Tauri release available: {Version}", release.Version);
            UpdateAvailable?.Invoke(info);

            if (_settingsService.CurrentSettings.Updates.AutoDownload)
            {
                await DownloadUpdateAsync(ct);
            }

            return info;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Failed to check for Tauri update");
            return null;
        }
    }

    public async Task DownloadUpdateAsync(CancellationToken ct = default)
    {
        if (_pendingRelease is null)
            return;

        var platform = _pendingRelease.GetWindowsPlatform();
        // Prefer standalone installer URL over the .nsis.zip updater bundle
        var downloadUrl = _pendingRelease.InstallerUrl ?? platform?.Url;
        if (string.IsNullOrEmpty(downloadUrl))
            return;

        try
        {
            var token = await _authService.GetTokenAsync(ct);

            _logger.LogInformation("Downloading Tauri installer from {Url}", downloadUrl);

            using var request = new HttpRequestMessage(HttpMethod.Get, downloadUrl);
            if (!string.IsNullOrEmpty(token))
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();

            var totalBytes = response.Content.Headers.ContentLength ?? -1;

            // Determine file extension from URL
            var fileName = Path.GetFileName(new Uri(downloadUrl).LocalPath);
            if (string.IsNullOrEmpty(fileName))
                fileName = $"PRDock-{_pendingRelease.Version}-setup.exe";

            var tempDir = Path.Combine(Path.GetTempPath(), "PRDock-update");
            Directory.CreateDirectory(tempDir);
            var filePath = Path.Combine(tempDir, fileName);

            await using var contentStream = await response.Content.ReadAsStreamAsync(ct);
            await using var fileStream = new FileStream(filePath, FileMode.Create, FileAccess.Write, FileShare.None, 8192, true);

            var buffer = new byte[81920];
            long bytesRead = 0;
            int read;
            while ((read = await contentStream.ReadAsync(buffer, ct)) > 0)
            {
                await fileStream.WriteAsync(buffer.AsMemory(0, read), ct);
                bytesRead += read;
                if (totalBytes > 0)
                {
                    var percent = (int)(bytesRead * 100 / totalBytes);
                    DownloadProgress?.Invoke(percent);
                }
            }

            // If the downloaded file is a .zip, extract it to find the installer
            if (filePath.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            {
                var extractDir = Path.Combine(tempDir, "extracted");
                if (Directory.Exists(extractDir))
                    Directory.Delete(extractDir, true);

                System.IO.Compression.ZipFile.ExtractToDirectory(filePath, extractDir);

                // Find .exe or .msi in extracted folder
                var installer = Directory.GetFiles(extractDir, "*.exe", SearchOption.AllDirectories)
                    .Concat(Directory.GetFiles(extractDir, "*.msi", SearchOption.AllDirectories))
                    .FirstOrDefault();

                if (installer is not null)
                {
                    _downloadedInstallerPath = installer;
                }
                else
                {
                    _logger.LogWarning("No installer found in zip archive");
                    return;
                }
            }
            else
            {
                _downloadedInstallerPath = filePath;
            }

            _isUpdateReady = true;
            _logger.LogInformation("Tauri installer downloaded to {Path}", _downloadedInstallerPath);
            UpdateReady?.Invoke();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Failed to download Tauri installer");
        }
    }

    public void ApplyUpdateAndRestart()
    {
        if (!_isUpdateReady || string.IsNullOrEmpty(_downloadedInstallerPath))
            return;

        _logger.LogInformation("Launching Tauri installer: {Path}", _downloadedInstallerPath);

        try
        {
            var ext = Path.GetExtension(_downloadedInstallerPath).ToLowerInvariant();
            var psi = new ProcessStartInfo
            {
                FileName = _downloadedInstallerPath,
                UseShellExecute = true,
            };

            // MSI needs msiexec
            if (ext == ".msi")
            {
                psi.FileName = "msiexec";
                psi.Arguments = $"/i \"{_downloadedInstallerPath}\"";
            }

            Process.Start(psi);

            // Shut down the WPF app
            System.Windows.Application.Current?.Dispatcher.Invoke(() =>
            {
                System.Windows.Application.Current.Shutdown();
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to launch Tauri installer");
        }
    }

    public void StartPeriodicChecks()
    {
        if (_periodicCts is not null)
            return;

        _periodicCts = new CancellationTokenSource();
        _ = RunPeriodicChecksAsync(_periodicCts.Token);
    }

    public void StopPeriodicChecks()
    {
        _periodicCts?.Cancel();
        _periodicCts?.Dispose();
        _periodicCts = null;
    }

    private async Task RunPeriodicChecksAsync(CancellationToken ct)
    {
        // Initial check after a short delay
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(30), ct);
            await CheckForUpdateAsync(ct);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        using var timer = new PeriodicTimer(CheckInterval);
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (!await timer.WaitForNextTickAsync(ct))
                    break;

                await CheckForUpdateAsync(ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        StopPeriodicChecks();
        _httpClient.Dispose();
    }

    // ── Tauri latest.json model ────────────────────────

    /// <summary>
    /// Queries the GitHub Releases API to find the standalone NSIS installer
    /// (.exe ending in x64-setup.exe) from the latest release assets.
    /// </summary>
    private async Task<string?> FindInstallerAssetUrlAsync(string? token, CancellationToken ct)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, GitHubLatestReleaseApi);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));
            if (!string.IsNullOrEmpty(token))
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var response = await _httpClient.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
                return null;

            var json = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);
            var assets = doc.RootElement.GetProperty("assets");

            foreach (var asset in assets.EnumerateArray())
            {
                var name = asset.GetProperty("name").GetString() ?? "";
                // Match the standalone NSIS installer: PRDock_<version>_x64-setup.exe
                if (name.EndsWith("x64-setup.exe", StringComparison.OrdinalIgnoreCase) ||
                    name.EndsWith("x64_en-US.msi", StringComparison.OrdinalIgnoreCase))
                {
                    return asset.GetProperty("browser_download_url").GetString();
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to query release assets for installer URL");
        }

        return null;
    }

    private sealed class TauriRelease
    {
        [JsonPropertyName("version")]
        public string Version { get; set; } = "";

        [JsonPropertyName("notes")]
        public string? Notes { get; set; }

        [JsonPropertyName("pub_date")]
        public string? PubDate { get; set; }

        [JsonPropertyName("platforms")]
        public Dictionary<string, TauriPlatform>? Platforms { get; set; }

        /// <summary>
        /// Standalone installer URL discovered from GitHub release assets.
        /// Not part of the JSON — populated after checking the Releases API.
        /// </summary>
        [JsonIgnore]
        public string? InstallerUrl { get; set; }

        public TauriPlatform? GetWindowsPlatform()
        {
            if (Platforms is null) return null;
            // Try common Windows platform keys
            if (Platforms.TryGetValue("windows-x86_64", out var p)) return p;
            if (Platforms.TryGetValue("windows-aarch64", out p)) return p;
            // Fallback: any key containing "windows"
            return Platforms.FirstOrDefault(kv =>
                kv.Key.Contains("windows", StringComparison.OrdinalIgnoreCase)).Value;
        }
    }

    private sealed class TauriPlatform
    {
        [JsonPropertyName("signature")]
        public string? Signature { get; set; }

        [JsonPropertyName("url")]
        public string? Url { get; set; }
    }
}
