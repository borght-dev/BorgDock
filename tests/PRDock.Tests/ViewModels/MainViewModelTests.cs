using System.ComponentModel;
using FluentAssertions;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class MainViewModelTests
{
    [Fact]
    public void DefaultValues_AreCorrect()
    {
        var vm = new MainViewModel();

        vm.IsSidebarVisible.Should().BeTrue();
        vm.IsPinned.Should().BeTrue();
        vm.StatusText.Should().Be("PRDock \u2014 0 open PRs");
        vm.SidebarMode.Should().Be("pinned");
    }

    [Fact]
    public void ToggleSidebarCommand_FlipsIsSidebarVisible()
    {
        var vm = new MainViewModel();
        vm.IsSidebarVisible.Should().BeTrue();

        vm.ToggleSidebarCommand.Execute(null);

        vm.IsSidebarVisible.Should().BeFalse();

        vm.ToggleSidebarCommand.Execute(null);

        vm.IsSidebarVisible.Should().BeTrue();
    }

    [Fact]
    public void TogglePinCommand_FlipsIsPinnedAndUpdatesSidebarMode()
    {
        var vm = new MainViewModel();
        vm.IsPinned.Should().BeTrue();
        vm.SidebarMode.Should().Be("pinned");

        vm.TogglePinCommand.Execute(null);

        vm.IsPinned.Should().BeFalse();
        vm.SidebarMode.Should().Be("autohide");

        vm.TogglePinCommand.Execute(null);

        vm.IsPinned.Should().BeTrue();
        vm.SidebarMode.Should().Be("pinned");
    }

    [Fact]
    public void MinimizeToBadgeCommand_SetsIsSidebarVisibleToFalse()
    {
        var vm = new MainViewModel();
        vm.IsSidebarVisible.Should().BeTrue();

        vm.MinimizeToBadgeCommand.Execute(null);

        vm.IsSidebarVisible.Should().BeFalse();
    }

    [Fact]
    public void MinimizeToBadgeCommand_WhenAlreadyHidden_StaysHidden()
    {
        var vm = new MainViewModel();
        vm.ToggleSidebarCommand.Execute(null); // hide
        vm.IsSidebarVisible.Should().BeFalse();

        vm.MinimizeToBadgeCommand.Execute(null);

        vm.IsSidebarVisible.Should().BeFalse();
    }

    [Fact]
    public void PropertyChanged_FiresForIsSidebarVisible()
    {
        var vm = new MainViewModel();
        var changedProperties = new List<string>();
        vm.PropertyChanged += (_, e) => changedProperties.Add(e.PropertyName!);

        vm.ToggleSidebarCommand.Execute(null);

        changedProperties.Should().Contain("IsSidebarVisible");
    }

    [Fact]
    public void PropertyChanged_FiresForIsPinnedAndSidebarMode()
    {
        var vm = new MainViewModel();
        var changedProperties = new List<string>();
        vm.PropertyChanged += (_, e) => changedProperties.Add(e.PropertyName!);

        vm.TogglePinCommand.Execute(null);

        changedProperties.Should().Contain("IsPinned");
        changedProperties.Should().Contain("SidebarMode");
    }

    [Fact]
    public void PropertyChanged_FiresForStatusText()
    {
        var vm = new MainViewModel();
        var changedProperties = new List<string>();
        vm.PropertyChanged += (_, e) => changedProperties.Add(e.PropertyName!);

        vm.StatusText = "PRDock \u2014 5 open PRs";

        changedProperties.Should().Contain("StatusText");
    }

    [Fact]
    public void OpenSettingsCommand_DoesNotThrow()
    {
        var vm = new MainViewModel();

        var act = () => vm.OpenSettingsCommand.Execute(null);

        act.Should().NotThrow();
    }
}
