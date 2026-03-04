using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PRDock.App.Infrastructure;
using PRDock.App.Services;
using PRDock.App.ViewModels;
using PRDock.App.Views;
using Serilog;
using WinFormsApp = System.Windows.Forms.Application;

namespace PRDock.App;

public partial class App : System.Windows.Application
{
    private static readonly string AppDataDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PRDock");

    private static readonly string LockFilePath = Path.Combine(AppDataDir, "prdock.lock");

    private Mutex? _singleInstanceMutex;
    private ServiceProvider? _serviceProvider;
    private System.Windows.Forms.NotifyIcon? _notifyIcon;
    private ThemeManager? _themeManager;
    private HotKeyManager? _hotKeyManager;
    private WorkAreaManager? _workAreaManager;
    private SidebarWindow? _sidebarWindow;
    private MainViewModel? _mainViewModel;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Single-instance check
        _singleInstanceMutex = new Mutex(true, "PRDock_SingleInstance", out bool createdNew);
        if (!createdNew)
        {
            System.Windows.MessageBox.Show("PRDock is already running.", "PRDock", MessageBoxButton.OK, MessageBoxImage.Information);
            Shutdown();
            return;
        }

        // Create lock file
        Directory.CreateDirectory(AppDataDir);
        WriteLockFile();

        // Configure Serilog
        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .WriteTo.File(
                Path.Combine(AppDataDir, "logs", "prdock-.log"),
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 7)
            .CreateLogger();

        // Build DI container
        var services = new ServiceCollection();
        ConfigureServices(services);
        _serviceProvider = services.BuildServiceProvider();

        // Load settings
        var settingsService = _serviceProvider.GetRequiredService<ISettingsService>();
        await settingsService.LoadAsync();

        // Initialize theme
        _themeManager = new ThemeManager(this);
        _themeManager.ApplyTheme(settingsService.CurrentSettings.UI.Theme);

        // Initialize work area manager (handles crash recovery)
        _workAreaManager = new WorkAreaManager();

        // Start polling
        var pollingService = _serviceProvider.GetRequiredService<IPRPollingService>();
        pollingService.StartPolling();

        // Create main view model and sidebar window
        _mainViewModel = _serviceProvider.GetRequiredService<MainViewModel>();
        _sidebarWindow = new SidebarWindow(_mainViewModel);

        // Wire up pin/unpin to work area reservation
        _mainViewModel.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(MainViewModel.IsPinned))
            {
                if (_mainViewModel.IsPinned)
                {
                    _workAreaManager.ReserveSpace(
                        settingsService.CurrentSettings.UI.SidebarWidthPx,
                        settingsService.CurrentSettings.UI.SidebarEdge);
                }
                else
                {
                    _workAreaManager.RestoreWorkArea();
                }
            }

            if (args.PropertyName == nameof(MainViewModel.IsSidebarVisible))
            {
                if (_mainViewModel.IsSidebarVisible)
                    _sidebarWindow.Show();
                else
                    _sidebarWindow.Hide();
            }
        };

        // Show sidebar
        _sidebarWindow.Show();

        // Reserve work area if starting pinned
        if (_mainViewModel.IsPinned)
        {
            _workAreaManager.ReserveSpace(
                settingsService.CurrentSettings.UI.SidebarWidthPx,
                settingsService.CurrentSettings.UI.SidebarEdge);
        }

        // Register global hotkey
        _hotKeyManager = new HotKeyManager();
        var hwndSource = PresentationSource.FromVisual(_sidebarWindow) as HwndSource;
        if (hwndSource is not null)
        {
            _hotKeyManager.RegisterHotKey(hwndSource.Handle, settingsService.CurrentSettings.UI.GlobalHotkey);
            _hotKeyManager.HotKeyPressed += () =>
            {
                _mainViewModel.ToggleSidebarCommand.Execute(null);
            };
        }

        // Setup system tray
        SetupSystemTray();

        // Enable WinForms message pumping for NotifyIcon
        WinFormsApp.EnableVisualStyles();
    }

    private static void ConfigureServices(ServiceCollection services)
    {
        // Logging
        services.AddLogging(builder =>
        {
            builder.ClearProviders();
            builder.AddSerilog();
        });

        // HTTP
        services.AddHttpClient("GitHub", client =>
        {
            client.BaseAddress = new Uri("https://api.github.com/");
            client.DefaultRequestHeaders.Add("Accept", "application/vnd.github.v3+json");
            client.DefaultRequestHeaders.Add("User-Agent", "PRDock");
        });

        // Services
        services.AddSingleton<ISettingsService, SettingsService>();
        services.AddSingleton<IGitHubAuthService, GitHubAuthService>();
        services.AddSingleton<IGitHubActionsService, GitHubActionsService>();
        services.AddSingleton<IGitHubService, GitHubService>();
        services.AddSingleton<IPRPollingService, PRPollingService>();
        services.AddSingleton<IGitCommandRunner, GitCommandRunner>();
        services.AddSingleton<IWorktreeService, WorktreeService>();

        // Infrastructure
        services.AddSingleton<GitHubHttpClient>();

        // ViewModels
        services.AddSingleton<MainViewModel>(sp =>
            new MainViewModel(sp.GetRequiredService<IPRPollingService>()));
    }

    private void SetupSystemTray()
    {
        _notifyIcon = new System.Windows.Forms.NotifyIcon
        {
            Icon = CreateDefaultIcon(),
            Text = "PRDock — 0 open PRs",
            Visible = true
        };

        _notifyIcon.MouseClick += (_, args) =>
        {
            if (args.Button == System.Windows.Forms.MouseButtons.Left)
            {
                _mainViewModel?.ToggleSidebarCommand.Execute(null);
            }
        };

        var contextMenu = new System.Windows.Forms.ContextMenuStrip();
        contextMenu.Items.Add("Show", null, (_, _) => _mainViewModel?.ToggleSidebarCommand.Execute(null));
        contextMenu.Items.Add("Settings", null, (_, _) => _mainViewModel?.OpenSettingsCommand.Execute(null));
        contextMenu.Items.Add("-");
        contextMenu.Items.Add("Quit", null, (_, _) => Shutdown());

        _notifyIcon.ContextMenuStrip = contextMenu;
    }

    private static System.Drawing.Icon CreateDefaultIcon()
    {
        // Try loading embedded icon resource
        var iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Assets", "tray-icon.ico");
        if (File.Exists(iconPath))
        {
            return new System.Drawing.Icon(iconPath);
        }

        // Fallback: use the application's own icon or default
        return System.Drawing.SystemIcons.Application;
    }

    private static void WriteLockFile()
    {
        try
        {
            File.WriteAllText(LockFilePath, Process.GetCurrentProcess().Id.ToString());
        }
        catch (IOException)
        {
            // Best-effort
        }
    }

    private static void DeleteLockFile()
    {
        try
        {
            if (File.Exists(LockFilePath))
                File.Delete(LockFilePath);
        }
        catch (IOException)
        {
            // Best-effort
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        // Stop polling before disposing services
        if (_serviceProvider?.GetService<IPRPollingService>() is { } pollingService)
            pollingService.StopPolling();

        _hotKeyManager?.Dispose();
        _workAreaManager?.Dispose();
        _themeManager?.Dispose();

        _notifyIcon?.Dispose();
        _serviceProvider?.Dispose();

        DeleteLockFile();
        _singleInstanceMutex?.ReleaseMutex();
        _singleInstanceMutex?.Dispose();

        Log.CloseAndFlush();
        base.OnExit(e);
    }
}
