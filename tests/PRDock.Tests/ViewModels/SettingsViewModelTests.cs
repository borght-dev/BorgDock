using FluentAssertions;
using NSubstitute;
using PRDock.App.Models;
using PRDock.App.Services;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class SettingsViewModelTests
{
    private static ISettingsService CreateMockSettingsService(AppSettings? settings = null)
    {
        var service = Substitute.For<ISettingsService>();
        service.CurrentSettings.Returns(settings ?? new AppSettings());
        return service;
    }

    [Fact]
    public void Constructor_LoadsDefaultSettings()
    {
        var service = CreateMockSettingsService();
        var vm = new SettingsViewModel(service);

        vm.AuthMethod.Should().Be("ghCli");
        vm.Username.Should().Be("");
        vm.PollIntervalSeconds.Should().Be(60);
        vm.SidebarEdge.Should().Be("right");
        vm.SidebarMode.Should().Be("pinned");
        vm.SidebarWidthPx.Should().Be(420);
        vm.Theme.Should().Be("system");
        vm.EditorCommand.Should().Be("code");
        vm.ToastOnCheckStatusChange.Should().BeTrue();
        vm.ToastOnNewPR.Should().BeFalse();
        vm.ToastOnReviewUpdate.Should().BeTrue();
        vm.DefaultPostFixAction.Should().Be("commitAndNotify");
        vm.ClaudeCodePath.Should().Be("");
    }

    [Fact]
    public void Constructor_LoadsCustomSettings()
    {
        var settings = new AppSettings
        {
            GitHub = new GitHubSettings
            {
                AuthMethod = "pat",
                PersonalAccessToken = "ghp_test123",
                Username = "testuser",
                PollIntervalSeconds = 120
            },
            Repos =
            [
                new RepoSettings { Owner = "octocat", Name = "hello-world", WorktreeBasePath = @"C:\repos" }
            ],
            UI = new UiSettings
            {
                SidebarEdge = "left",
                SidebarMode = "autohide",
                SidebarWidthPx = 500,
                Theme = "dark",
                EditorCommand = "vim"
            },
            Notifications = new NotificationSettings
            {
                ToastOnCheckStatusChange = false,
                ToastOnNewPR = true,
                ToastOnReviewUpdate = false
            },
            ClaudeCode = new ClaudeCodeSettings
            {
                DefaultPostFixAction = "none",
                ClaudeCodePath = @"C:\claude\claude.exe"
            }
        };

        var service = CreateMockSettingsService(settings);
        var vm = new SettingsViewModel(service);

        vm.AuthMethod.Should().Be("pat");
        vm.PersonalAccessToken.Should().Be("ghp_test123");
        vm.Username.Should().Be("testuser");
        vm.PollIntervalSeconds.Should().Be(120);
        vm.Repositories.Should().HaveCount(1);
        vm.Repositories[0].Owner.Should().Be("octocat");
        vm.Repositories[0].Name.Should().Be("hello-world");
        vm.Repositories[0].WorktreeBasePath.Should().Be(@"C:\repos");
        vm.SidebarEdge.Should().Be("left");
        vm.SidebarMode.Should().Be("autohide");
        vm.SidebarWidthPx.Should().Be(500);
        vm.Theme.Should().Be("dark");
        vm.EditorCommand.Should().Be("vim");
        vm.ToastOnCheckStatusChange.Should().BeFalse();
        vm.ToastOnNewPR.Should().BeTrue();
        vm.ToastOnReviewUpdate.Should().BeFalse();
        vm.DefaultPostFixAction.Should().Be("none");
        vm.ClaudeCodePath.Should().Be(@"C:\claude\claude.exe");
    }

    [Fact]
    public void AddRepositoryCommand_AddsNewRepo()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());

        vm.AddRepositoryCommand.Execute(null);

        vm.Repositories.Should().HaveCount(1);
        vm.SelectedRepository.Should().Be(vm.Repositories[0]);
    }

    [Fact]
    public void RemoveRepositoryCommand_RemovesSelectedRepo()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.AddRepositoryCommand.Execute(null);
        vm.AddRepositoryCommand.Execute(null);
        vm.SelectedRepository = vm.Repositories[0];

        vm.RemoveRepositoryCommand.Execute(null);

        vm.Repositories.Should().HaveCount(1);
    }

    [Fact]
    public void RemoveRepositoryCommand_WithNoSelection_DoesNothing()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.AddRepositoryCommand.Execute(null);
        vm.SelectedRepository = null;

        vm.RemoveRepositoryCommand.Execute(null);

        vm.Repositories.Should().HaveCount(1);
    }

    [Fact]
    public void Validate_PollIntervalTooLow_ReturnsError()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.PollIntervalSeconds = 10;

        vm.Validate().Should().Contain("Poll interval");
    }

    [Fact]
    public void Validate_PollIntervalTooHigh_ReturnsError()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.PollIntervalSeconds = 500;

        vm.Validate().Should().Contain("Poll interval");
    }

    [Fact]
    public void Validate_SidebarWidthTooSmall_ReturnsError()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.SidebarWidthPx = 100;

        vm.Validate().Should().Contain("Sidebar width");
    }

    [Fact]
    public void Validate_SidebarWidthTooLarge_ReturnsError()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.SidebarWidthPx = 1000;

        vm.Validate().Should().Contain("Sidebar width");
    }

    [Fact]
    public void Validate_PatAuthWithoutToken_ReturnsError()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.AuthMethod = "pat";
        vm.PersonalAccessToken = "";

        vm.Validate().Should().Contain("Personal access token");
    }

    [Fact]
    public void Validate_PatAuthWithToken_ReturnsNull()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.AuthMethod = "pat";
        vm.PersonalAccessToken = "ghp_abc123";

        vm.Validate().Should().BeNull();
    }

    [Fact]
    public void Validate_RepoWithoutOwner_ReturnsError()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.AddRepositoryCommand.Execute(null);
        vm.Repositories[0].Owner = "";
        vm.Repositories[0].Name = "repo";

        vm.Validate().Should().Contain("owner and name");
    }

    [Fact]
    public void Validate_RepoWithoutName_ReturnsError()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.AddRepositoryCommand.Execute(null);
        vm.Repositories[0].Owner = "owner";
        vm.Repositories[0].Name = "";

        vm.Validate().Should().Contain("owner and name");
    }

    [Fact]
    public void Validate_ValidDefaults_ReturnsNull()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.Validate().Should().BeNull();
    }

    [Fact]
    public async Task SaveCommand_ValidSettings_CallsSaveAsync()
    {
        var service = CreateMockSettingsService();
        var vm = new SettingsViewModel(service);
        vm.Username = "testuser";

        await vm.SaveCommand.ExecuteAsync(null);

        await service.Received(1).SaveAsync(Arg.Is<AppSettings>(s => s.GitHub.Username == "testuser"));
        vm.ValidationError.Should().BeNull();
    }

    [Fact]
    public async Task SaveCommand_InvalidSettings_SetsValidationError()
    {
        var service = CreateMockSettingsService();
        var vm = new SettingsViewModel(service);
        vm.PollIntervalSeconds = 5;

        await vm.SaveCommand.ExecuteAsync(null);

        await service.DidNotReceive().SaveAsync(Arg.Any<AppSettings>());
        vm.ValidationError.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task SaveCommand_FiresSaveCompletedEvent()
    {
        var service = CreateMockSettingsService();
        var vm = new SettingsViewModel(service);
        bool fired = false;
        vm.SaveCompleted += () => fired = true;

        await vm.SaveCommand.ExecuteAsync(null);

        fired.Should().BeTrue();
    }

    [Fact]
    public void CancelCommand_ReloadsFromService()
    {
        var settings = new AppSettings
        {
            GitHub = new GitHubSettings { Username = "original" }
        };
        var service = CreateMockSettingsService(settings);
        var vm = new SettingsViewModel(service);

        vm.Username = "modified";
        vm.CancelCommand.Execute(null);

        vm.Username.Should().Be("original");
    }

    [Fact]
    public void CancelCommand_ClearsValidationError()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.PollIntervalSeconds = 5;

        vm.CancelCommand.Execute(null);

        vm.ValidationError.Should().BeNull();
    }

    [Fact]
    public void CancelCommand_FiresCancelCompletedEvent()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        bool fired = false;
        vm.CancelCompleted += () => fired = true;

        vm.CancelCommand.Execute(null);

        fired.Should().BeTrue();
    }

    [Fact]
    public void ToAppSettings_MapsAllFields()
    {
        var service = CreateMockSettingsService();
        var vm = new SettingsViewModel(service);

        vm.AuthMethod = "pat";
        vm.PersonalAccessToken = "ghp_token";
        vm.Username = "user1";
        vm.PollIntervalSeconds = 90;
        vm.SidebarEdge = "left";
        vm.SidebarMode = "autohide";
        vm.SidebarWidthPx = 350;
        vm.Theme = "dark";
        vm.EditorCommand = "nvim";
        vm.ToastOnCheckStatusChange = false;
        vm.ToastOnNewPR = true;
        vm.ToastOnReviewUpdate = false;
        vm.DefaultPostFixAction = "none";
        vm.ClaudeCodePath = @"C:\claude";

        var result = vm.ToAppSettings();

        result.GitHub.AuthMethod.Should().Be("pat");
        result.GitHub.PersonalAccessToken.Should().Be("ghp_token");
        result.GitHub.Username.Should().Be("user1");
        result.GitHub.PollIntervalSeconds.Should().Be(90);
        result.UI.SidebarEdge.Should().Be("left");
        result.UI.SidebarMode.Should().Be("autohide");
        result.UI.SidebarWidthPx.Should().Be(350);
        result.UI.Theme.Should().Be("dark");
        result.UI.EditorCommand.Should().Be("nvim");
        result.Notifications.ToastOnCheckStatusChange.Should().BeFalse();
        result.Notifications.ToastOnNewPR.Should().BeTrue();
        result.Notifications.ToastOnReviewUpdate.Should().BeFalse();
        result.ClaudeCode.DefaultPostFixAction.Should().Be("none");
        result.ClaudeCode.ClaudeCodePath.Should().Be(@"C:\claude");
    }

    [Fact]
    public void ToAppSettings_EmptyPat_MapsToNull()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.PersonalAccessToken = "";

        var result = vm.ToAppSettings();

        result.GitHub.PersonalAccessToken.Should().BeNull();
    }

    [Fact]
    public void ToAppSettings_WhitespacePat_MapsToNull()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.PersonalAccessToken = "   ";

        var result = vm.ToAppSettings();

        result.GitHub.PersonalAccessToken.Should().BeNull();
    }

    [Fact]
    public void ToAppSettings_PreservesGlobalHotkey()
    {
        var settings = new AppSettings
        {
            UI = new UiSettings { GlobalHotkey = "Ctrl+Shift+P" }
        };
        var vm = new SettingsViewModel(CreateMockSettingsService(settings));

        var result = vm.ToAppSettings();

        result.UI.GlobalHotkey.Should().Be("Ctrl+Shift+P");
    }

    [Fact]
    public void ToAppSettings_PreservesClaudeReview()
    {
        var settings = new AppSettings
        {
            ClaudeReview = new ClaudeReviewSettings { BotUsername = "custom-bot" }
        };
        var vm = new SettingsViewModel(CreateMockSettingsService(settings));

        var result = vm.ToAppSettings();

        result.ClaudeReview.BotUsername.Should().Be("custom-bot");
    }

    [Fact]
    public void ToAppSettings_MapsRepos()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.AddRepositoryCommand.Execute(null);
        vm.Repositories[0].Owner = "octocat";
        vm.Repositories[0].Name = "hello";
        vm.Repositories[0].WorktreeBasePath = @"C:\wt";
        vm.Repositories[0].WorktreeSubfolder = ".trees";
        vm.Repositories[0].FixPromptTemplate = "Fix {{check}}";

        var result = vm.ToAppSettings();

        result.Repos.Should().HaveCount(1);
        result.Repos[0].Owner.Should().Be("octocat");
        result.Repos[0].Name.Should().Be("hello");
        result.Repos[0].WorktreeBasePath.Should().Be(@"C:\wt");
        result.Repos[0].WorktreeSubfolder.Should().Be(".trees");
        result.Repos[0].FixPromptTemplate.Should().Be("Fix {{check}}");
    }

    [Fact]
    public void ToAppSettings_EmptyFixPrompt_MapsToNull()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.AddRepositoryCommand.Execute(null);
        vm.Repositories[0].Owner = "o";
        vm.Repositories[0].Name = "n";
        vm.Repositories[0].FixPromptTemplate = "";

        var result = vm.ToAppSettings();

        result.Repos[0].FixPromptTemplate.Should().BeNull();
    }

    [Fact]
    public void StaticOptions_ContainExpectedValues()
    {
        SettingsViewModel.AuthMethodOptions.Should().Contain("ghCli").And.Contain("pat");
        SettingsViewModel.SidebarEdgeOptions.Should().Contain("left").And.Contain("right");
        SettingsViewModel.SidebarModeOptions.Should().Contain("pinned").And.Contain("autohide");
        SettingsViewModel.ThemeOptions.Should().Contain("system").And.Contain("light").And.Contain("dark");
        SettingsViewModel.PostFixActionOptions.Should().Contain("commitAndNotify").And.Contain("none");
    }

    [Fact]
    public void LoadFromSettings_NullPat_MapsToEmptyString()
    {
        var settings = new AppSettings
        {
            GitHub = new GitHubSettings { PersonalAccessToken = null }
        };
        var vm = new SettingsViewModel(CreateMockSettingsService(settings));

        vm.PersonalAccessToken.Should().Be("");
    }

    [Fact]
    public void LoadFromSettings_NullClaudeCodePath_MapsToEmptyString()
    {
        var settings = new AppSettings
        {
            ClaudeCode = new ClaudeCodeSettings { ClaudeCodePath = null }
        };
        var vm = new SettingsViewModel(CreateMockSettingsService(settings));

        vm.ClaudeCodePath.Should().Be("");
    }

    [Fact]
    public void RepoSettingsItemViewModel_DefaultValues()
    {
        var item = new RepoSettingsItemViewModel();

        item.Owner.Should().Be("");
        item.Name.Should().Be("");
        item.Enabled.Should().BeTrue();
        item.WorktreeBasePath.Should().Be("");
        item.WorktreeSubfolder.Should().Be(".worktrees");
        item.FixPromptTemplate.Should().Be("");
    }

    [Fact]
    public void AddThenRemoveAll_LeavesEmptyList()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.AddRepositoryCommand.Execute(null);
        vm.AddRepositoryCommand.Execute(null);

        vm.SelectedRepository = vm.Repositories[0];
        vm.RemoveRepositoryCommand.Execute(null);
        vm.SelectedRepository = vm.Repositories[0];
        vm.RemoveRepositoryCommand.Execute(null);

        vm.Repositories.Should().BeEmpty();
    }

    [Fact]
    public void RemoveRepository_SelectsLast()
    {
        var vm = new SettingsViewModel(CreateMockSettingsService());
        vm.AddRepositoryCommand.Execute(null);
        vm.Repositories[0].Owner = "first";
        vm.AddRepositoryCommand.Execute(null);
        vm.Repositories[1].Owner = "second";
        vm.AddRepositoryCommand.Execute(null);
        vm.Repositories[2].Owner = "third";

        vm.SelectedRepository = vm.Repositories[1]; // select "second"
        vm.RemoveRepositoryCommand.Execute(null);

        vm.SelectedRepository.Should().NotBeNull();
        vm.SelectedRepository!.Owner.Should().Be("third");
    }
}
