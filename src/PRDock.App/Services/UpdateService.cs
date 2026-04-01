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

    /// Lists all releases — used to find the latest Tauri release by tag pattern.
    private const string GitHubReleasesApi =
        "https://api.github.com/repos/borght-dev/PRDock/releases";

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

            // Try the direct URL first; fall back to the GitHub API for private repos
            var release = await FetchLatestJsonDirect(token, ct)
                       ?? await FetchLatestJsonViaApi(token, ct);

            if (release is null)
            {
                _logger.LogDebug("Could not fetch latest.json (direct or API)");
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
            // Required for GitHub API asset downloads on private repos
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));

            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();

            var totalBytes = response.Content.Headers.ContentLength ?? -1;

            // The API URL path doesn't contain the real filename; use the
            // Content-Disposition header or fall back to a default name.
            var fileName = response.Content.Headers.ContentDisposition?.FileName?.Trim('"')
                ?? Path.GetFileName(new Uri(downloadUrl).LocalPath);
            if (string.IsNullOrEmpty(fileName) || !Path.HasExtension(fileName))
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
    /// Try fetching latest.json from the direct GitHub release URL (works for public repos).
    /// </summary>
    private async Task<TauriRelease?> FetchLatestJsonDirect(string? token, CancellationToken ct)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, TauriLatestJsonUrl);
            if (!string.IsNullOrEmpty(token))
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));

            using var response = await _httpClient.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogDebug("Direct latest.json fetch failed: {Status}", response.StatusCode);
                return null;
            }

            var json = await response.Content.ReadAsStringAsync(ct);
            var release = JsonSerializer.Deserialize<TauriRelease>(json);
            if (release is null || string.IsNullOrEmpty(release.Version))
                return null;

            return release;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Direct latest.json fetch threw");
            return null;
        }
    }

    /// <summary>
    /// Fetch latest.json via the GitHub Releases API (works for private repos with a token).
    /// Lists all releases, finds the newest Tauri release (tag v* not wpf-v*),
    /// then downloads its latest.json asset.
    /// </summary>
    private async Task<TauriRelease?> FetchLatestJsonViaApi(string? token, CancellationToken ct)
    {
        try
        {
            // List releases (newest first) and find the first Tauri release
            using var listRequest = new HttpRequestMessage(HttpMethod.Get, GitHubReleasesApi + "?per_page=20");
            listRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));
            if (!string.IsNullOrEmpty(token))
                listRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var listResponse = await _httpClient.SendAsync(listRequest, ct);
            if (!listResponse.IsSuccessStatusCode)
            {
                _logger.LogDebug("GitHub API releases list failed: {Status}", listResponse.StatusCode);
                return null;
            }

            var listJson = await listResponse.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(listJson);

            // Find the first release whose tag starts with "v" but not "wpf-v"
            string? assetApiUrl = null;
            foreach (var release in doc.RootElement.EnumerateArray())
            {
                var tag = release.GetProperty("tag_name").GetString() ?? "";
                if (!tag.StartsWith("v", StringComparison.OrdinalIgnoreCase) ||
                    tag.StartsWith("wpf-", StringComparison.OrdinalIgnoreCase))
                    continue;

                // Found a Tauri release — look for its latest.json asset
                foreach (var asset in release.GetProperty("assets").EnumerateArray())
                {
                    var name = asset.GetProperty("name").GetString() ?? "";
                    if (name.Equals("latest.json", StringComparison.OrdinalIgnoreCase))
                    {
                        assetApiUrl = asset.GetProperty("url").GetString();
                        break;
                    }
                }

                if (assetApiUrl is not null)
                    break;
            }

            if (string.IsNullOrEmpty(assetApiUrl))
            {
                _logger.LogDebug("No Tauri release with latest.json found");
                return null;
            }

            // Download the asset content via the API
            using var assetRequest = new HttpRequestMessage(HttpMethod.Get, assetApiUrl);
            assetRequest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));
            if (!string.IsNullOrEmpty(token))
                assetRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var assetResponse = await _httpClient.SendAsync(assetRequest, ct);
            if (!assetResponse.IsSuccessStatusCode)
            {
                _logger.LogDebug("Failed to download latest.json asset: {Status}", assetResponse.StatusCode);
                return null;
            }

            var assetJson = await assetResponse.Content.ReadAsStringAsync(ct);
            var tauriRelease = JsonSerializer.Deserialize<TauriRelease>(assetJson);
            if (tauriRelease is null || string.IsNullOrEmpty(tauriRelease.Version))
                return null;

            _logger.LogDebug("Fetched latest.json via GitHub API: v{Version}", tauriRelease.Version);
            return tauriRelease;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "GitHub API latest.json fetch threw");
            return null;
        }
    }

    /// <summary>
    /// Queries the GitHub Releases API to find the standalone NSIS installer
    /// (.exe ending in x64-setup.exe) from the latest Tauri release assets.
    /// </summary>
    private async Task<string?> FindInstallerAssetUrlAsync(string? token, CancellationToken ct)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, GitHubReleasesApi + "?per_page=20");
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));
            if (!string.IsNullOrEmpty(token))
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var response = await _httpClient.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
                return null;

            var json = await response.Content.ReadAsStringAsync(ct);
            using var doc = JsonDocument.Parse(json);

            foreach (var release in doc.RootElement.EnumerateArray())
            {
                var tag = release.GetProperty("tag_name").GetString() ?? "";
                if (!tag.StartsWith("v", StringComparison.OrdinalIgnoreCase) ||
                    tag.StartsWith("wpf-", StringComparison.OrdinalIgnoreCase))
                    continue;

                foreach (var asset in release.GetProperty("assets").EnumerateArray())
                {
                    var name = asset.GetProperty("name").GetString() ?? "";
                    // Match the standalone NSIS installer: PRDock_<version>_x64-setup.exe
                    if (name.EndsWith("x64-setup.exe", StringComparison.OrdinalIgnoreCase) ||
                        name.EndsWith("x64_en-US.msi", StringComparison.OrdinalIgnoreCase))
                    {
                        // Use the API URL for private repo compatibility.
                        // Download with Accept: application/octet-stream to get the binary.
                        return asset.GetProperty("url").GetString();
                    }
                }

                // Only check the first Tauri release
                break;
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
