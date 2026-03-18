using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.App.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private readonly ISettingsService _settingsService;
    private readonly IStartupManager? _startupManager;
    private readonly IUpdateService? _updateService;
    private readonly IMigrationService? _migrationService;

    public SettingsViewModel(
        ISettingsService settingsService,
        IStartupManager? startupManager = null,
        IUpdateService? updateService = null,
        IMigrationService? migrationService = null)
    {
        _settingsService = settingsService;
        _startupManager = startupManager;
        _updateService = updateService;
        _migrationService = migrationService;
        CurrentVersion = updateService?.CurrentVersion ?? "dev";
        LoadFromSettings(_settingsService.CurrentSettings);

        if (_migrationService is not null)
        {
            _migrationService.MigrationAvailable += info =>
            {
                System.Windows.Application.Current?.Dispatcher?.InvokeAsync(() =>
                {
                    IsTauriAvailable = true;
                    TauriVersion = info.Version;
                    _pendingMigration = info;
                });
            };
        }
    }

    private Models.MigrationInfo? _pendingMigration;

    // --- GitHub section ---

    [ObservableProperty]
    private string _authMethod = "ghCli";

    [ObservableProperty]
    private string _personalAccessToken = "";

    [ObservableProperty]
    private string _username = "";

    [ObservableProperty]
    private int _pollIntervalSeconds = 60;

    // --- Repositories section ---

    public ObservableCollection<RepoSettingsItemViewModel> Repositories { get; } = [];

    [ObservableProperty]
    private RepoSettingsItemViewModel? _selectedRepository;

    [RelayCommand]
    private void AddRepository()
    {
        var repo = new RepoSettingsItemViewModel();
        Repositories.Add(repo);
        SelectedRepository = repo;
    }

    [RelayCommand]
    private void RemoveRepository()
    {
        if (SelectedRepository is null) return;
        Repositories.Remove(SelectedRepository);
        SelectedRepository = Repositories.LastOrDefault();
    }

    // --- Appearance section ---

    [ObservableProperty]
    private string _sidebarEdge = "right";

    [ObservableProperty]
    private int _sidebarWidthPx = 800;

    [ObservableProperty]
    private string _theme = "system";

    [ObservableProperty]
    private string _badgeStyle = "GlassCapsule";

    [ObservableProperty]
    private string _indicatorStyle = "SegmentRing";

    [ObservableProperty]
    private string _editorCommand = "code";

    [ObservableProperty]
    private bool _runAtStartup;

    // --- Notifications section ---

    [ObservableProperty]
    private bool _toastOnCheckStatusChange = true;

    [ObservableProperty]
    private bool _toastOnNewPR;

    [ObservableProperty]
    private bool _toastOnReviewUpdate = true;

    // --- Claude Code section ---

    [ObservableProperty]
    private string _defaultPostFixAction = "commitAndNotify";

    [ObservableProperty]
    private string _claudeCodePath = "";

    // --- Azure DevOps section ---

    [ObservableProperty]
    private string _adoOrganization = "";

    [ObservableProperty]
    private string _adoProject = "";

    [ObservableProperty]
    private string _adoPersonalAccessToken = "";

    [ObservableProperty]
    private int _adoPollIntervalSeconds = 120;

    [ObservableProperty]
    private string _adoConnectionStatus = "";

    [ObservableProperty]
    private bool _isTestingAdoConnection;

    [RelayCommand]
    private async Task TestAdoConnectionAsync()
    {
        IsTestingAdoConnection = true;
        AdoConnectionStatus = "Testing...";

        try
        {
            var sp = ((PRDock.App.App)System.Windows.Application.Current).ServiceProvider;
            var adoClient = sp?.GetService(typeof(Infrastructure.AzureDevOpsHttpClient)) as Infrastructure.AzureDevOpsHttpClient;
            if (adoClient is null)
            {
                AdoConnectionStatus = "Service unavailable.";
                return;
            }

            var error = await adoClient.TestConnectionAsync(AdoOrganization, AdoProject, AdoPersonalAccessToken);
            AdoConnectionStatus = error ?? "Connected successfully!";
        }
        catch (Exception ex)
        {
            AdoConnectionStatus = $"Failed: {ex.Message}";
        }
        finally
        {
            IsTestingAdoConnection = false;
        }
    }

    // --- Hotkey section ---

    [ObservableProperty]
    private string _globalHotkey = "Ctrl+Win+Shift+G";

    [ObservableProperty]
    private bool _isRecordingHotkey;

    [RelayCommand]
    private void ToggleHotkeyRecording()
    {
        IsRecordingHotkey = !IsRecordingHotkey;
    }

    public void ApplyRecordedHotkey(string hotkey)
    {
        GlobalHotkey = hotkey;
        IsRecordingHotkey = false;
    }

    public void CancelHotkeyRecording()
    {
        IsRecordingHotkey = false;
    }

    // --- Updates section ---

    [ObservableProperty]
    private bool _autoCheckForUpdates = true;

    [ObservableProperty]
    private bool _autoDownloadUpdates = true;

    [ObservableProperty]
    private string _currentVersion = "";

    [ObservableProperty]
    private string _updateStatusText = "";

    [ObservableProperty]
    private bool _isCheckingForUpdates;

    [ObservableProperty]
    private bool _isUpdateAvailable;

    [ObservableProperty]
    private bool _isTauriAvailable;

    [ObservableProperty]
    private string _tauriVersion = "";

    [ObservableProperty]
    private bool _isMigrating;

    [ObservableProperty]
    private int _migrationProgress;

    [RelayCommand]
    private async Task MigrateToTauriAsync()
    {
        if (_migrationService is null || _pendingMigration is null) return;

        IsMigrating = true;
        MigrationProgress = 0;

        try
        {
            var progress = new Progress<int>(p => MigrationProgress = p);
            var installerPath = await _migrationService.DownloadInstallerAsync(_pendingMigration, progress);
            _migrationService.LaunchInstallerAndExit(installerPath);
        }
        catch
        {
            UpdateStatusText = "Migration download failed.";
            IsMigrating = false;
        }
    }

    [RelayCommand]
    private async Task CheckForUpdatesAsync()
    {
        if (_updateService is null) return;

        IsCheckingForUpdates = true;
        UpdateStatusText = "Checking...";

        try
        {
            var info = await _updateService.CheckForUpdateAsync();
            if (info is not null)
            {
                IsUpdateAvailable = true;
                UpdateStatusText = $"Version {info.Version} available!";
            }
            else if (_updateService.IsInstalled)
            {
                UpdateStatusText = "You're on the latest version.";
            }
            else
            {
                UpdateStatusText = "Auto-update unavailable (not installed via setup).";
            }
        }
        catch
        {
            UpdateStatusText = "Failed to check for updates.";
        }
        finally
        {
            IsCheckingForUpdates = false;
        }
    }

    [RelayCommand]
    private void ApplyUpdate()
    {
        _updateService?.ApplyUpdateAndRestart();
    }

    // --- Validation ---

    [ObservableProperty]
    private string? _validationError;

    public bool HasValidationError => ValidationError is not null;

    // --- Static option lists ---

    public static IReadOnlyList<string> AuthMethodOptions { get; } = ["ghCli", "pat"];
    public static IReadOnlyList<string> SidebarEdgeOptions { get; } = ["left", "right"];
    public static IReadOnlyList<string> ThemeOptions { get; } = ["system", "light", "dark"];
    public static IReadOnlyList<string> BadgeStyleOptions { get; } =
        ["GlassCapsule", "MinimalNotch", "FloatingIsland", "LiquidMorph", "SpectralBar"];
    public static IReadOnlyList<string> IndicatorStyleOptions { get; } = ["SegmentRing", "SignalDots"];
    public static IReadOnlyList<string> PostFixActionOptions { get; } = ["commitAndNotify", "commitOnly", "notifyOnly", "none"];

    // --- Commands ---

    [RelayCommand]
    private async Task SaveAsync()
    {
        var error = Validate();
        if (error is not null)
        {
            ValidationError = error;
            return;
        }

        ValidationError = null;
        var settings = ToAppSettings();
        await _settingsService.SaveAsync(settings);
        _startupManager?.SyncWithSettings(RunAtStartup);
        SaveCompleted?.Invoke();
    }

    [RelayCommand]
    private void Cancel()
    {
        LoadFromSettings(_settingsService.CurrentSettings);
        ValidationError = null;
        CancelCompleted?.Invoke();
    }

    public event Action? SaveCompleted;
    public event Action? CancelCompleted;

    // --- Mapping ---

    internal void LoadFromSettings(AppSettings settings)
    {
        AuthMethod = settings.GitHub.AuthMethod;
        PersonalAccessToken = settings.GitHub.PersonalAccessToken ?? "";
        Username = settings.GitHub.Username;
        PollIntervalSeconds = settings.GitHub.PollIntervalSeconds;

        Repositories.Clear();
        foreach (var repo in settings.Repos)
        {
            Repositories.Add(new RepoSettingsItemViewModel
            {
                Owner = repo.Owner,
                Name = repo.Name,
                Enabled = repo.Enabled,
                WorktreeBasePath = repo.WorktreeBasePath,
                WorktreeSubfolder = repo.WorktreeSubfolder,
                FixPromptTemplate = repo.FixPromptTemplate ?? ""
            });
        }

        SidebarEdge = settings.UI.SidebarEdge;
        SidebarWidthPx = settings.UI.SidebarWidthPx;
        Theme = settings.UI.Theme;
        BadgeStyle = settings.UI.BadgeStyle;
        IndicatorStyle = settings.UI.IndicatorStyle;
        EditorCommand = settings.UI.EditorCommand;
        RunAtStartup = settings.UI.RunAtStartup;

        ToastOnCheckStatusChange = settings.Notifications.ToastOnCheckStatusChange;
        ToastOnNewPR = settings.Notifications.ToastOnNewPR;
        ToastOnReviewUpdate = settings.Notifications.ToastOnReviewUpdate;

        DefaultPostFixAction = settings.ClaudeCode.DefaultPostFixAction;
        ClaudeCodePath = settings.ClaudeCode.ClaudeCodePath ?? "";

        GlobalHotkey = settings.UI.GlobalHotkey;

        AdoOrganization = settings.AzureDevOps.Organization;
        AdoProject = settings.AzureDevOps.Project;
        AdoPersonalAccessToken = settings.AzureDevOps.PersonalAccessToken ?? "";
        AdoPollIntervalSeconds = settings.AzureDevOps.PollIntervalSeconds;

        AutoCheckForUpdates = settings.Updates.AutoCheckEnabled;
        AutoDownloadUpdates = settings.Updates.AutoDownload;
    }

    internal AppSettings ToAppSettings()
    {
        var current = _settingsService.CurrentSettings;
        var isConfigured = Repositories.Count > 0
            && (AuthMethod == "ghCli" || !string.IsNullOrWhiteSpace(PersonalAccessToken));
        return new AppSettings
        {
            SetupComplete = current.SetupComplete || isConfigured,
            GitHub = new GitHubSettings
            {
                AuthMethod = AuthMethod,
                PersonalAccessToken = string.IsNullOrWhiteSpace(PersonalAccessToken) ? null : PersonalAccessToken,
                Username = Username,
                PollIntervalSeconds = PollIntervalSeconds
            },
            Repos = Repositories.Select(r => new RepoSettings
            {
                Owner = r.Owner,
                Name = r.Name,
                Enabled = r.Enabled,
                WorktreeBasePath = r.WorktreeBasePath,
                WorktreeSubfolder = r.WorktreeSubfolder,
                FixPromptTemplate = string.IsNullOrWhiteSpace(r.FixPromptTemplate) ? null : r.FixPromptTemplate
            }).ToList(),
            UI = new UiSettings
            {
                SidebarEdge = SidebarEdge,
                SidebarWidthPx = SidebarWidthPx,
                Theme = Theme,
                BadgeStyle = BadgeStyle,
                IndicatorStyle = IndicatorStyle,
                GlobalHotkey = GlobalHotkey,
                EditorCommand = EditorCommand,
                RunAtStartup = RunAtStartup
            },
            Notifications = new NotificationSettings
            {
                ToastOnCheckStatusChange = ToastOnCheckStatusChange,
                ToastOnNewPR = ToastOnNewPR,
                ToastOnReviewUpdate = ToastOnReviewUpdate
            },
            ClaudeCode = new ClaudeCodeSettings
            {
                DefaultPostFixAction = DefaultPostFixAction,
                ClaudeCodePath = string.IsNullOrWhiteSpace(ClaudeCodePath) ? null : ClaudeCodePath
            },
            ClaudeReview = current.ClaudeReview,
            AzureDevOps = new AzureDevOpsSettings
            {
                Organization = AdoOrganization,
                Project = AdoProject,
                PersonalAccessToken = string.IsNullOrWhiteSpace(AdoPersonalAccessToken) ? null : AdoPersonalAccessToken,
                PollIntervalSeconds = AdoPollIntervalSeconds,
                FavoriteQueryIds = current.AzureDevOps.FavoriteQueryIds,
                LastSelectedQueryId = current.AzureDevOps.LastSelectedQueryId
            },
            Updates = new UpdateSettings
            {
                AutoCheckEnabled = AutoCheckForUpdates,
                AutoDownload = AutoDownloadUpdates
            }
        };
    }

    internal string? Validate()
    {
        if (PollIntervalSeconds < 15 || PollIntervalSeconds > 300)
            return "Poll interval must be between 15 and 300 seconds.";

        if (SidebarWidthPx < 200 || SidebarWidthPx > 1200)
            return "Sidebar width must be between 200 and 1200 pixels.";

        if (AuthMethod == "pat" && string.IsNullOrWhiteSpace(PersonalAccessToken))
            return "Personal access token is required when using PAT auth.";

        foreach (var repo in Repositories)
        {
            if (string.IsNullOrWhiteSpace(repo.Owner) || string.IsNullOrWhiteSpace(repo.Name))
                return "All repositories must have an owner and name.";
        }

        return null;
    }
}

public partial class RepoSettingsItemViewModel : ObservableObject
{
    [ObservableProperty]
    private string _owner = "";

    [ObservableProperty]
    private string _name = "";

    [ObservableProperty]
    private bool _enabled = true;

    [ObservableProperty]
    private string _worktreeBasePath = "";

    [ObservableProperty]
    private string _worktreeSubfolder = ".worktrees";

    [ObservableProperty]
    private string _fixPromptTemplate = "";
}
