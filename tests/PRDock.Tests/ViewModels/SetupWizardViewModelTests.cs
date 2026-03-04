using FluentAssertions;
using NSubstitute;
using PRDock.App.Models;
using PRDock.App.Services;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class SetupWizardViewModelTests
{
    private readonly IGitHubAuthService _authService = Substitute.For<IGitHubAuthService>();
    private readonly IRepoDiscoveryService _repoDiscoveryService = Substitute.For<IRepoDiscoveryService>();
    private readonly ISettingsService _settingsService = Substitute.For<ISettingsService>();

    private SetupWizardViewModel CreateSut() => new(_authService, _repoDiscoveryService, _settingsService);

    [Fact]
    public void InitialState_StartsAtStepAuth()
    {
        var sut = CreateSut();

        sut.CurrentStep.Should().Be(SetupWizardViewModel.StepAuth);
        sut.CanGoBack.Should().BeFalse();
        sut.IsCompleted.Should().BeFalse();
    }

    [Fact]
    public void CanGoNext_OnAuthStep_FalseByDefault()
    {
        var sut = CreateSut();
        sut.CanGoNext.Should().BeFalse();
    }

    [Fact]
    public void CanGoNext_OnAuthStep_TrueWhenAuthValid()
    {
        var sut = CreateSut();
        sut.IsAuthValid = true;
        sut.CanGoNext.Should().BeTrue();
    }

    [Fact]
    public void CanGoNext_OnAuthStep_TrueWhenPatProvided()
    {
        var sut = CreateSut();
        sut.PersonalAccessToken = "ghp_test123";
        sut.CanGoNext.Should().BeTrue();
    }

    [Fact]
    public async Task CheckAuth_WithGhCliToken_SetsAuthValid()
    {
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns("ghp_token123");
        var sut = CreateSut();

        await sut.CheckAuthCommand.ExecuteAsync(null);

        sut.IsAuthValid.Should().BeTrue();
        sut.UseGhCli.Should().BeTrue();
        sut.AuthStatusMessage.Should().Contain("gh CLI");
    }

    [Fact]
    public async Task CheckAuth_WithNoToken_SetsAuthInvalid()
    {
        _authService.GetTokenAsync(Arg.Any<CancellationToken>()).Returns((string?)null);
        var sut = CreateSut();

        await sut.CheckAuthCommand.ExecuteAsync(null);

        sut.IsAuthValid.Should().BeFalse();
        sut.UseGhCli.Should().BeFalse();
    }

    [Fact]
    public async Task GoNext_FromAuth_MovesToRepos()
    {
        _repoDiscoveryService.DiscoverReposAsync(Arg.Any<IEnumerable<string>>(), Arg.Any<CancellationToken>())
            .Returns(Array.Empty<DiscoveredRepo>());

        var sut = CreateSut();
        sut.IsAuthValid = true;

        await sut.GoNextCommand.ExecuteAsync(null);

        sut.CurrentStep.Should().Be(SetupWizardViewModel.StepRepos);
        sut.CanGoBack.Should().BeTrue();
    }

    [Fact]
    public async Task GoNext_FromRepos_TriggersDiscovery()
    {
        var repos = new List<DiscoveredRepo>
        {
            new() { Owner = "org", Name = "repo1", LocalPath = @"C:\Dev\repo1" }
        };
        _repoDiscoveryService.DiscoverReposAsync(Arg.Any<IEnumerable<string>>(), Arg.Any<CancellationToken>())
            .Returns(repos);

        var sut = CreateSut();
        sut.IsAuthValid = true;

        await sut.GoNextCommand.ExecuteAsync(null);

        sut.DiscoveredRepos.Should().HaveCount(1);
        sut.DiscoveredRepos[0].Owner.Should().Be("org");
        sut.DiscoveredRepos[0].Name.Should().Be("repo1");
        sut.DiscoveredRepos[0].IsSelected.Should().BeTrue();
    }

    [Fact]
    public void CanGoNext_OnReposStep_FalseWhenNoReposSelected()
    {
        var sut = CreateSut();
        sut.CurrentStep = SetupWizardViewModel.StepRepos;
        sut.CanGoNext.Should().BeFalse();
    }

    [Fact]
    public void CanGoNext_OnReposStep_TrueWhenRepoSelected()
    {
        var sut = CreateSut();
        sut.CurrentStep = SetupWizardViewModel.StepRepos;
        sut.DiscoveredRepos.Add(new DiscoveredRepoItem { Owner = "org", Name = "repo", IsSelected = true });
        sut.CanGoNext.Should().BeTrue();
    }

    [Fact]
    public void GoBack_FromRepos_MovesToAuth()
    {
        var sut = CreateSut();
        sut.CurrentStep = SetupWizardViewModel.StepRepos;
        sut.GoBackCommand.Execute(null);
        sut.CurrentStep.Should().Be(SetupWizardViewModel.StepAuth);
    }

    [Fact]
    public void GoBack_FromAuth_DoesNothing()
    {
        var sut = CreateSut();
        sut.GoBackCommand.Execute(null);
        sut.CurrentStep.Should().Be(SetupWizardViewModel.StepAuth);
    }

    [Fact]
    public void CanGoNext_OnWorktreesStep_AlwaysTrue()
    {
        var sut = CreateSut();
        sut.CurrentStep = SetupWizardViewModel.StepWorktrees;
        sut.CanGoNext.Should().BeTrue();
    }

    [Fact]
    public void CanGoNext_OnSidebarStep_AlwaysTrue()
    {
        var sut = CreateSut();
        sut.CurrentStep = SetupWizardViewModel.StepSidebar;
        sut.CanGoNext.Should().BeTrue();
    }

    [Fact]
    public void IsOnFinalStep_TrueOnlySidebarStep()
    {
        var sut = CreateSut();
        sut.CurrentStep = SetupWizardViewModel.StepAuth;
        sut.IsOnFinalStep.Should().BeFalse();

        sut.CurrentStep = SetupWizardViewModel.StepSidebar;
        sut.IsOnFinalStep.Should().BeTrue();
    }

    [Fact]
    public void NextButtonText_ShowsFinishOnFinalStep()
    {
        var sut = CreateSut();
        sut.CurrentStep = SetupWizardViewModel.StepAuth;
        sut.NextButtonText.Should().Be("Next");

        sut.CurrentStep = SetupWizardViewModel.StepSidebar;
        sut.NextButtonText.Should().Be("Finish");
    }

    [Fact]
    public async Task Finish_SavesSettingsWithSelectedRepos()
    {
        AppSettings? savedSettings = null;
        _settingsService.SaveAsync(Arg.Do<AppSettings>(s => savedSettings = s)).Returns(Task.CompletedTask);

        var sut = CreateSut();
        sut.IsAuthValid = true;
        sut.UseGhCli = true;
        sut.SidebarEdge = "left";
        sut.SidebarMode = "autohide";
        sut.CurrentStep = SetupWizardViewModel.StepSidebar;
        sut.DiscoveredRepos.Add(new DiscoveredRepoItem
        {
            Owner = "org", Name = "repo1", LocalPath = @"C:\Dev\repo1", IsSelected = true, WorktreeSubfolder = ".wt"
        });
        sut.DiscoveredRepos.Add(new DiscoveredRepoItem
        {
            Owner = "org", Name = "repo2", LocalPath = @"C:\Dev\repo2", IsSelected = false
        });

        await sut.GoNextCommand.ExecuteAsync(null);

        savedSettings.Should().NotBeNull();
        savedSettings!.GitHub.AuthMethod.Should().Be("ghCli");
        savedSettings.Repos.Should().HaveCount(1);
        savedSettings.Repos[0].Owner.Should().Be("org");
        savedSettings.Repos[0].Name.Should().Be("repo1");
        savedSettings.Repos[0].WorktreeBasePath.Should().Be(@"C:\Dev\repo1");
        savedSettings.Repos[0].WorktreeSubfolder.Should().Be(".wt");
        savedSettings.UI.SidebarEdge.Should().Be("left");
        savedSettings.UI.SidebarMode.Should().Be("autohide");
        sut.IsCompleted.Should().BeTrue();
        sut.CurrentStep.Should().Be(SetupWizardViewModel.StepDone);
    }

    [Fact]
    public async Task Finish_WithPat_SavesPatSettings()
    {
        AppSettings? savedSettings = null;
        _settingsService.SaveAsync(Arg.Do<AppSettings>(s => savedSettings = s)).Returns(Task.CompletedTask);

        var sut = CreateSut();
        sut.UseGhCli = false;
        sut.PersonalAccessToken = "ghp_mytoken";
        sut.CurrentStep = SetupWizardViewModel.StepSidebar;
        sut.DiscoveredRepos.Add(new DiscoveredRepoItem
        {
            Owner = "org", Name = "repo", IsSelected = true
        });

        await sut.GoNextCommand.ExecuteAsync(null);

        savedSettings.Should().NotBeNull();
        savedSettings!.GitHub.AuthMethod.Should().Be("pat");
        savedSettings.GitHub.PersonalAccessToken.Should().Be("ghp_mytoken");
    }

    [Fact]
    public void SidebarEdge_DefaultsToRight()
    {
        var sut = CreateSut();
        sut.SidebarEdge.Should().Be("right");
    }

    [Fact]
    public void SidebarMode_DefaultsToPinned()
    {
        var sut = CreateSut();
        sut.SidebarMode.Should().Be("pinned");
    }

    [Fact]
    public void CanGoNext_OnDoneStep_IsFalse()
    {
        var sut = CreateSut();
        sut.CurrentStep = SetupWizardViewModel.StepDone;
        sut.CanGoNext.Should().BeFalse();
    }

    [Fact]
    public void CanGoBack_OnDoneStep_IsFalse()
    {
        var sut = CreateSut();
        sut.CurrentStep = SetupWizardViewModel.StepDone;
        sut.CanGoBack.Should().BeFalse();
    }
}
