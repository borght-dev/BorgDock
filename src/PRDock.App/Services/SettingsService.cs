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
            return;
        }

        // Main file missing or corrupt — try backup
        loaded = await TryLoadFromFileAsync(BackupFilePath);
        if (loaded is not null)
        {
            _logger.LogWarning("Restored settings from backup file {Path}.", BackupFilePath);
            CurrentSettings = loaded;
            // Re-write the main file from the restored backup
            await AtomicWriteAsync(SettingsFilePath, loaded);
            return;
        }

        // No usable settings file at all — create defaults
        _logger.LogInformation("No settings files found. Creating defaults at {Path}.", SettingsFilePath);
        CurrentSettings = new AppSettings();
        await AtomicWriteAsync(SettingsFilePath, CurrentSettings);
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
