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

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
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

        if (!File.Exists(SettingsFilePath))
        {
            _logger.LogInformation("Settings file not found at {Path}. Creating defaults.", SettingsFilePath);
            CurrentSettings = new AppSettings();
            await WriteSettingsFileAsync(CurrentSettings);
            return;
        }

        try
        {
            var json = await File.ReadAllTextAsync(SettingsFilePath);
            var settings = JsonSerializer.Deserialize<AppSettings>(json, JsonOptions);
            CurrentSettings = settings ?? new AppSettings();
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Corrupt settings file at {Path}. Falling back to defaults.", SettingsFilePath);
            CurrentSettings = new AppSettings();
        }
    }

    public async Task SaveAsync(AppSettings settings)
    {
        Directory.CreateDirectory(SettingsDirectory);
        CurrentSettings = settings;
        await WriteSettingsFileAsync(settings);
        SettingsChanged?.Invoke(settings);
    }

    private static async Task WriteSettingsFileAsync(AppSettings settings)
    {
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        await File.WriteAllTextAsync(SettingsFilePath, json);
    }
}
