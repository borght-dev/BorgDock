using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.App.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private readonly ISettingsService _settingsService;

    public SettingsViewModel(ISettingsService settingsService)
    {
        _settingsService = settingsService;
        LoadFromSettings(_settingsService.CurrentSettings);
    }

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
    private int _sidebarWidthPx = 420;

    [ObservableProperty]
    private string _theme = "system";

    [ObservableProperty]
    private string _editorCommand = "code";

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

    // --- Validation ---

    [ObservableProperty]
    private string? _validationError;

    public bool HasValidationError => ValidationError is not null;

    // --- Static option lists ---

    public static IReadOnlyList<string> AuthMethodOptions { get; } = ["ghCli", "pat"];
    public static IReadOnlyList<string> SidebarEdgeOptions { get; } = ["left", "right"];
public static IReadOnlyList<string> ThemeOptions { get; } = ["system", "light", "dark"];
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
        EditorCommand = settings.UI.EditorCommand;

        ToastOnCheckStatusChange = settings.Notifications.ToastOnCheckStatusChange;
        ToastOnNewPR = settings.Notifications.ToastOnNewPR;
        ToastOnReviewUpdate = settings.Notifications.ToastOnReviewUpdate;

        DefaultPostFixAction = settings.ClaudeCode.DefaultPostFixAction;
        ClaudeCodePath = settings.ClaudeCode.ClaudeCodePath ?? "";
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
                GlobalHotkey = current.UI.GlobalHotkey,
                EditorCommand = EditorCommand
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
            ClaudeReview = current.ClaudeReview
        };
    }

    internal string? Validate()
    {
        if (PollIntervalSeconds < 15 || PollIntervalSeconds > 300)
            return "Poll interval must be between 15 and 300 seconds.";

        if (SidebarWidthPx < 200 || SidebarWidthPx > 800)
            return "Sidebar width must be between 200 and 800 pixels.";

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
