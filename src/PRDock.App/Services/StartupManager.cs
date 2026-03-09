using System.IO;
using Microsoft.Extensions.Logging;

namespace PRDock.App.Services;

public sealed class StartupManager : IStartupManager
{
    private const string ShortcutName = "PRDock.lnk";

    private readonly string _startupFolder;
    private readonly ILogger<StartupManager> _logger;

    public StartupManager(ILogger<StartupManager> logger)
        : this(Environment.GetFolderPath(Environment.SpecialFolder.Startup), logger)
    {
    }

    internal StartupManager(string startupFolder, ILogger<StartupManager> logger)
    {
        _startupFolder = startupFolder;
        _logger = logger;
    }

    private string ShortcutPath => Path.Combine(_startupFolder, ShortcutName);

    public bool IsEnabled => File.Exists(ShortcutPath);

    public void Enable()
    {
        try
        {
            var exePath = Environment.ProcessPath;
            if (string.IsNullOrEmpty(exePath))
            {
                _logger.LogWarning("Cannot determine process path for startup shortcut");
                return;
            }

            Directory.CreateDirectory(_startupFolder);

            Type shellType = Type.GetTypeFromProgID("WScript.Shell")!;
            dynamic shell = Activator.CreateInstance(shellType)!;
            var shortcut = shell.CreateShortcut(ShortcutPath);
            shortcut.TargetPath = exePath;
            shortcut.WorkingDirectory = Path.GetDirectoryName(exePath);
            shortcut.Description = "PRDock — GitHub PR Monitor";
            shortcut.Save();

            _logger.LogInformation("Startup shortcut created at {Path}", ShortcutPath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create startup shortcut");
        }
    }

    public void Disable()
    {
        try
        {
            if (File.Exists(ShortcutPath))
            {
                File.Delete(ShortcutPath);
                _logger.LogInformation("Startup shortcut removed from {Path}", ShortcutPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove startup shortcut");
        }
    }

    public void SyncWithSettings(bool runAtStartup)
    {
        if (runAtStartup)
            Enable();
        else
            Disable();
    }
}
