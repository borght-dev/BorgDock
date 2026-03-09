using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Interop;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PRDock.App.Infrastructure;
using PRDock.App.Services;
using PRDock.App.Models;
using PRDock.App.ViewModels;
using PRDock.App.Views;
using Serilog;
using WinFormsApp = System.Windows.Forms.Application;
using WinFormsScreen = System.Windows.Forms.Screen;

namespace PRDock.App;

public partial class App : System.Windows.Application
{
    private static readonly string AppDataDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PRDock");

    private static readonly string LockFilePath = Path.Combine(AppDataDir, "prdock.lock");

    private Mutex? _singleInstanceMutex;
    private ServiceProvider? _serviceProvider;

    public ServiceProvider? ServiceProvider => _serviceProvider;
    internal ThemeManager? ThemeManager => _themeManager;
    private System.Windows.Forms.NotifyIcon? _notifyIcon;
    private ThemeManager? _themeManager;
    private HotKeyManager? _hotKeyManager;
    private SidebarWindow? _sidebarWindow;
    private MainViewModel? _mainViewModel;
    private FloatingBadgeWindow? _floatingBadgeWindow;
    private FloatingBadgeViewModel? _floatingBadgeVm;

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
            .MinimumLevel.Debug()
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

        // Show setup wizard on first run
        Log.Information("Settings loaded: SetupComplete={SetupComplete}, RepoCount={RepoCount}",
            settingsService.CurrentSettings.SetupComplete, settingsService.CurrentSettings.Repos.Count);
        var hasAnyRepo = settingsService.CurrentSettings.Repos.Any();
        var hasAuthConfigured = settingsService.CurrentSettings.GitHub.AuthMethod == "ghCli"
            || !string.IsNullOrWhiteSpace(settingsService.CurrentSettings.GitHub.PersonalAccessToken);
        var needsSetup = !settingsService.CurrentSettings.SetupComplete && (!hasAnyRepo || !hasAuthConfigured);
        if (needsSetup)
        {
            var wizardVm = new SetupWizardViewModel(
                _serviceProvider.GetRequiredService<IGitHubAuthService>(),
                _serviceProvider.GetRequiredService<IRepoDiscoveryService>(),
                settingsService);
            var wizard = new SetupWizardWindow(wizardVm);
            var result = wizard.ShowDialog();
            if (result != true)
            {
                Shutdown();
                return;
            }

            // Reload settings after wizard saved them
            await settingsService.LoadAsync();
        }
        else if (!settingsService.CurrentSettings.SetupComplete)
        {
            // Recover from older builds where SetupComplete was not persisted correctly.
            settingsService.CurrentSettings.SetupComplete = true;
            await settingsService.SaveAsync(settingsService.CurrentSettings);
        }

        // Sync startup shortcut with settings
        var startupManager = _serviceProvider.GetRequiredService<IStartupManager>();
        startupManager.SyncWithSettings(settingsService.CurrentSettings.UI.RunAtStartup);

        // Initialize theme
        _themeManager = new ThemeManager(this);
        _themeManager.ApplyTheme(settingsService.CurrentSettings.UI.Theme);

        // Create main view model and sidebar window (before polling so event handlers are wired up)
        var pollingService = _serviceProvider.GetRequiredService<IPRPollingService>();
        _mainViewModel = _serviceProvider.GetRequiredService<MainViewModel>();
        _sidebarWindow = new SidebarWindow(_mainViewModel);
        _mainViewModel.ApplySidebarPreferences(settingsService.CurrentSettings.UI);
        _sidebarWindow.ApplyUiSettings(settingsService.CurrentSettings.UI);

        // Load cached PR data for instant display while fresh data loads
        var cacheService = _serviceProvider.GetRequiredService<IPRCacheService>();
        var cached = await cacheService.LoadCachedAsync();
        if (cached.Count > 0)
        {
            _mainViewModel.ProcessPollResults(cached);
            Log.Information("Displayed {Count} cached PRs while fetching fresh data", cached.Count);
        }

        // Create floating badge window
        _floatingBadgeVm = new FloatingBadgeViewModel();
        _floatingBadgeWindow = new FloatingBadgeWindow(_floatingBadgeVm);

        _floatingBadgeVm.ExpandSidebarRequested += () =>
        {
            if (_sidebarWindow is not null)
            {
                var badgeScreen = GetWindowScreen(_floatingBadgeWindow);
                _sidebarWindow.RevealOnScreen(badgeScreen);
            }

            _mainViewModel!.IsSidebarVisible = true;
        };
        _floatingBadgeVm.QuitRequested += () => Shutdown();
        _floatingBadgeVm.SettingsRequested += () => _mainViewModel?.OpenSettingsCommand.Execute(null);

        // Wire up auto-update checks
        var updateService = _serviceProvider.GetRequiredService<IUpdateService>();
        updateService.UpdateAvailable += info =>
        {
            Dispatcher.InvokeAsync(() =>
                _floatingBadgeVm?.ShowToast($"PRDock {info.Version} available \u2014 open Settings to update."));
        };
        if (settingsService.CurrentSettings.Updates.AutoCheckEnabled)
            updateService.StartPeriodicChecks();

        // Wire up badge updates and start polling (after all event handlers are registered)
        pollingService.PollCompleted += results =>
        {
            var total = results.Count;
            var failing = results.Count(r => r.OverallStatus == "red");
            var pending = results.Count(r => r.OverallStatus == "yellow");
            System.Windows.Application.Current?.Dispatcher?.InvokeAsync(() =>
                _floatingBadgeVm?.Update(total, failing, pending));
        };
        pollingService.StartPolling();

        // Wire up merge/close celebration notifications
        _mainViewModel.PrClosedOrMerged += (title, author, prNumber, repoFullName) =>
        {
            var message = $"\ud83c\udf89 PR #{prNumber} merged! {title}";
            Dispatcher.InvokeAsync(() =>
            {
                _floatingBadgeVm?.ShowToast(message);
                if (_mainViewModel is not null)
                    _mainViewModel.StatusText = message;
            });
        };

        settingsService.SettingsChanged += settings =>
        {
            Dispatcher.InvokeAsync(() =>
            {
                _themeManager?.ApplyTheme(settings.UI.Theme);
                _mainViewModel?.ApplySidebarPreferences(settings.UI);
                _sidebarWindow?.ApplyUiSettings(settings.UI);
            });
        };

        _mainViewModel.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(MainViewModel.IsSidebarVisible))
            {
                if (_mainViewModel.IsSidebarVisible)
                {
                    _sidebarWindow.Show();
                    _floatingBadgeWindow?.Hide();
                }
                else
                {
                    _sidebarWindow.Hide();
                    _floatingBadgeWindow?.Show();
                }
            }
        };

        // Show sidebar
        _sidebarWindow.Show();

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
        services.AddSingleton<IUpdateService, UpdateService>();
        services.AddSingleton<ISettingsService, SettingsService>();
        services.AddSingleton<IGitHubAuthService, GitHubAuthService>();
        services.AddSingleton<IGitHubActionsService, GitHubActionsService>();
        services.AddSingleton<IGitHubService, GitHubService>();
        services.AddSingleton<IPRPollingService, PRPollingService>();
        services.AddSingleton<IGitCommandRunner, GitCommandRunner>();
        services.AddSingleton<IWorktreeService, WorktreeService>();
        services.AddSingleton<IClaudeCodeLauncher, ClaudeCodeLauncher>();
        services.AddSingleton<ILogParserService, LogParserService>();
        services.AddSingleton<INotificationService, NotificationService>();
        services.AddSingleton<IRepoDiscoveryService, RepoDiscoveryService>();
        services.AddSingleton<IPRCacheService, PRCacheService>();
        services.AddSingleton<IStartupManager, StartupManager>();

        // Infrastructure
        services.AddSingleton<GitHubHttpClient>();
        services.AddSingleton<ProcessTracker>();
        services.AddSingleton<IRetryHandler, RetryHandler>();

        // ViewModels
        services.AddTransient<PRDetailViewModel>(sp =>
            new PRDetailViewModel(
                sp.GetRequiredService<IGitHubService>(),
                sp.GetRequiredService<IGitCommandRunner>(),
                sp.GetRequiredService<ISettingsService>()));
        services.AddSingleton<MainViewModel>(sp =>
            new MainViewModel(
                sp.GetRequiredService<IPRPollingService>(),
                sp.GetRequiredService<GitHubHttpClient>(),
                sp.GetRequiredService<ISettingsService>(),
                sp.GetRequiredService<IGitHubActionsService>(),
                sp.GetRequiredService<ILogParserService>(),
                sp.GetRequiredService<INotificationService>(),
                sp.GetRequiredService<IClaudeCodeLauncher>(),
                sp.GetRequiredService<IWorktreeService>(),
                sp.GetRequiredService<IGitHubService>(),
                sp.GetRequiredService<IGitCommandRunner>()));
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

    private static WinFormsScreen? GetWindowScreen(Window? window)
    {
        if (window is null)
            return null;

        var handle = new WindowInteropHelper(window).Handle;
        return handle == IntPtr.Zero ? null : WinFormsScreen.FromHandle(handle);
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
        // Stop periodic update checks
        if (_serviceProvider?.GetService<IUpdateService>() is { } updateService)
            updateService.StopPeriodicChecks();

        // Stop polling before disposing services
        if (_serviceProvider?.GetService<IPRPollingService>() is { } pollingService)
            pollingService.StopPolling();

        _hotKeyManager?.Dispose();
        _themeManager?.Dispose();

        _floatingBadgeWindow?.Close();
        _notifyIcon?.Dispose();
        _serviceProvider?.Dispose();

        DeleteLockFile();
        _singleInstanceMutex?.ReleaseMutex();
        _singleInstanceMutex?.Dispose();

        Log.CloseAndFlush();
        base.OnExit(e);
    }
}
