using System.IO;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed class SettingsService : ISettingsService
{
    private static readonly string SettingsDirectory =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PRDock");

    private static readonly string SettingsFilePath =
        Path.Combine(SettingsDirectory, "settings.json");

    private static readonly string BackupFilePath =
        Path.Combine(SettingsDirectory, "settings.json.bak");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private readonly ILogger<SettingsService> _logger;

    public SettingsService(ILogger<SettingsService> logger)
    {
        _logger = logger;
    }

    public AppSettings CurrentSettings { get; private set; } = new();

    public event Action<AppSettings>? SettingsChanged;

    public async Task LoadAsync()
    {
        Directory.CreateDirectory(SettingsDirectory);

        // Try main file first, then backup if main is missing or corrupt
        var loaded = await TryLoadFromFileAsync(SettingsFilePath);
        if (loaded is not null)
        {
            CurrentSettings = loaded;
        }
        else
        {
            // Main file missing or corrupt — try backup
            loaded = await TryLoadFromFileAsync(BackupFilePath);
            if (loaded is not null)
            {
                _logger.LogWarning("Restored settings from backup file {Path}.", BackupFilePath);
                CurrentSettings = loaded;
                // Re-write the main file from the restored backup
                await AtomicWriteAsync(SettingsFilePath, loaded);
            }
            else
            {
                // No usable settings file at all — create defaults
                _logger.LogInformation("No settings files found. Creating defaults at {Path}.", SettingsFilePath);
                CurrentSettings = new AppSettings();
                await AtomicWriteAsync(SettingsFilePath, CurrentSettings);
            }
        }

        // In debug builds, overlay settings.dev.json from the repo root
        ApplyDevOverrides();
    }

    public async Task SaveAsync(AppSettings settings)
    {
        Directory.CreateDirectory(SettingsDirectory);
        CurrentSettings = settings;
        _logger.LogInformation("Saving settings: SetupComplete={SetupComplete}, RepoCount={RepoCount}",
            settings.SetupComplete, settings.Repos.Count);

        // Write backup first, then main file (atomic writes for both)
        await AtomicWriteAsync(BackupFilePath, settings);
        await AtomicWriteAsync(SettingsFilePath, settings);

        SettingsChanged?.Invoke(settings);
    }

    private async Task<AppSettings?> TryLoadFromFileAsync(string path)
    {
        if (!File.Exists(path))
            return null;

        try
        {
            var fileInfo = new FileInfo(path);
            _logger.LogInformation("Reading settings: {Path} ({Size} bytes, modified {Modified})",
                path, fileInfo.Length, fileInfo.LastWriteTimeUtc.ToString("O"));

            var json = await File.ReadAllTextAsync(path);
            _logger.LogDebug("Raw settings JSON ({Length} chars): {Json}",
                json.Length, json.Length > 500 ? json[..500] + "..." : json);

            var settings = JsonSerializer.Deserialize<AppSettings>(json, JsonOptions);
            if (settings is null)
            {
                _logger.LogWarning("Deserialized null from {Path}.", path);
                return null;
            }

            _logger.LogInformation("Loaded: SetupComplete={SetupComplete}, Repos={RepoCount}, Auth={Auth}",
                settings.SetupComplete, settings.Repos.Count, settings.GitHub.AuthMethod);
            return settings;
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Corrupt settings file at {Path}.", path);
            return null;
        }
        catch (IOException ex)
        {
            _logger.LogError(ex, "Failed to read settings file at {Path}.", path);
            return null;
        }
    }

    /// <summary>
    /// In DEBUG builds, merges non-default values from settings.dev.json (repo root)
    /// into the current settings. This lets developers keep credentials locally
    /// without polluting %APPDATA% settings or committing secrets.
    /// </summary>
    [System.Diagnostics.Conditional("DEBUG")]
    private void ApplyDevOverrides()
    {
        var devPath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "settings.dev.json");
        devPath = Path.GetFullPath(devPath); // normalize

        if (!File.Exists(devPath))
            return;

        try
        {
            var json = File.ReadAllText(devPath);
            var overrides = JsonSerializer.Deserialize<AppSettings>(json, JsonOptions);
            if (overrides is null) return;

            _logger.LogInformation("Applying dev overrides from {Path}", devPath);

            // Merge ADO settings if they have values
            var ado = overrides.AzureDevOps;
            if (!string.IsNullOrWhiteSpace(ado.Organization))
                CurrentSettings.AzureDevOps.Organization = ado.Organization;
            if (!string.IsNullOrWhiteSpace(ado.Project))
                CurrentSettings.AzureDevOps.Project = ado.Project;
            if (!string.IsNullOrWhiteSpace(ado.PersonalAccessToken))
                CurrentSettings.AzureDevOps.PersonalAccessToken = ado.PersonalAccessToken;

            // Merge GitHub settings if they have values
            var gh = overrides.GitHub;
            if (!string.IsNullOrWhiteSpace(gh.PersonalAccessToken))
                CurrentSettings.GitHub.PersonalAccessToken = gh.PersonalAccessToken;
            if (!string.IsNullOrWhiteSpace(gh.Username))
                CurrentSettings.GitHub.Username = gh.Username;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load dev overrides from {Path}", devPath);
        }
    }

    /// <summary>
    /// Writes settings atomically: serialize to a temp file, then replace the target.
    /// Prevents corruption from mid-write crashes or process kills.
    /// </summary>
    private static async Task AtomicWriteAsync(string targetPath, AppSettings settings)
    {
        var tempPath = targetPath + ".tmp";
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        await File.WriteAllTextAsync(tempPath, json);
        File.Move(tempPath, targetPath, overwrite: true);
    }
}
