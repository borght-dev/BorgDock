using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.App.ViewModels;

public partial class SetupWizardViewModel : ObservableObject
{
    private readonly IGitHubAuthService _authService;
    private readonly IRepoDiscoveryService _repoDiscoveryService;
    private readonly ISettingsService _settingsService;

    public const int StepAuth = 0;
    public const int StepRepos = 1;
    public const int StepWorktrees = 2;
    public const int StepSidebar = 3;
    public const int StepDone = 4;
    public const int TotalSteps = 5;

    public SetupWizardViewModel(
        IGitHubAuthService authService,
        IRepoDiscoveryService repoDiscoveryService,
        ISettingsService settingsService)
    {
        _authService = authService;
        _repoDiscoveryService = repoDiscoveryService;
        _settingsService = settingsService;
    }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanGoNext))]
    [NotifyPropertyChangedFor(nameof(CanGoBack))]
    [NotifyPropertyChangedFor(nameof(IsOnFinalStep))]
    [NotifyPropertyChangedFor(nameof(NextButtonText))]
    private int _currentStep;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanGoNext))]
    private bool _isAuthValid;

    [ObservableProperty]
    private string _authStatusMessage = "Checking...";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanGoNext))]
    private string _personalAccessToken = "";

    [ObservableProperty]
    private bool _useGhCli = true;

    [ObservableProperty]
    private bool _isScanning;

    [ObservableProperty]
    private string _sidebarEdge = "right";

    [ObservableProperty]
    private string _sidebarMode = "pinned";

    [ObservableProperty]
    private bool _isCompleted;

    public ObservableCollection<DiscoveredRepoItem> DiscoveredRepos { get; } = [];

    public bool CanGoNext => CurrentStep switch
    {
        StepAuth => IsAuthValid || !string.IsNullOrWhiteSpace(PersonalAccessToken),
        StepRepos => DiscoveredRepos.Any(r => r.IsSelected),
        StepWorktrees => true,
        StepSidebar => true,
        StepDone => false,
        _ => false
    };

    public bool CanGoBack => CurrentStep > StepAuth && CurrentStep < StepDone;

    public bool IsOnFinalStep => CurrentStep == StepSidebar;

    public string NextButtonText => IsOnFinalStep ? "Finish" : "Next";

    [RelayCommand]
    private async Task CheckAuthAsync()
    {
        AuthStatusMessage = "Checking gh CLI authentication...";
        var token = await _authService.GetTokenAsync();

        if (!string.IsNullOrEmpty(token))
        {
            IsAuthValid = true;
            UseGhCli = true;
            AuthStatusMessage = "Authenticated via gh CLI";
        }
        else
        {
            IsAuthValid = false;
            UseGhCli = false;
            AuthStatusMessage = "gh CLI not available. Enter a Personal Access Token:";
        }
    }

    [RelayCommand]
    private async Task DiscoverReposAsync()
    {
        IsScanning = true;
        DiscoveredRepos.Clear();

        try
        {
            var scanPaths = new[] { @"D:\", @"C:\Dev", @"C:\Users" };
            var repos = await _repoDiscoveryService.DiscoverReposAsync(scanPaths);

            foreach (var repo in repos)
            {
                DiscoveredRepos.Add(new DiscoveredRepoItem
                {
                    Owner = repo.Owner,
                    Name = repo.Name,
                    LocalPath = repo.LocalPath,
                    IsSelected = true
                });
            }
        }
        finally
        {
            IsScanning = false;
            OnPropertyChanged(nameof(CanGoNext));
        }
    }

    [RelayCommand]
    private async Task GoNextAsync()
    {
        if (CurrentStep == StepSidebar)
        {
            await FinishWizardAsync();
            return;
        }

        CurrentStep++;

        if (CurrentStep == StepRepos)
        {
            await DiscoverReposAsync();
        }
    }

    [RelayCommand]
    private void GoBack()
    {
        if (CurrentStep > StepAuth)
            CurrentStep--;
    }

    private async Task FinishWizardAsync()
    {
        var settings = new AppSettings
        {
            GitHub = new GitHubSettings
            {
                AuthMethod = UseGhCli ? "ghCli" : "pat",
                PersonalAccessToken = UseGhCli ? null : PersonalAccessToken
            },
            Repos = DiscoveredRepos
                .Where(r => r.IsSelected)
                .Select(r => new RepoSettings
                {
                    Owner = r.Owner,
                    Name = r.Name,
                    Enabled = true,
                    WorktreeBasePath = r.LocalPath,
                    WorktreeSubfolder = r.WorktreeSubfolder
                })
                .ToList(),
            UI = new UiSettings
            {
                SidebarEdge = SidebarEdge,
                SidebarMode = SidebarMode
            }
        };

        await _settingsService.SaveAsync(settings);
        CurrentStep = StepDone;
        IsCompleted = true;
    }
}

public partial class DiscoveredRepoItem : ObservableObject
{
    [ObservableProperty]
    private string _owner = "";

    [ObservableProperty]
    private string _name = "";

    [ObservableProperty]
    private string _localPath = "";

    [ObservableProperty]
    private bool _isSelected = true;

    [ObservableProperty]
    private string _worktreeSubfolder = ".worktrees";

    public string FullName => $"{Owner}/{Name}";
}
