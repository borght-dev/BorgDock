using FluentAssertions;
using PRDock.App.ViewModels;

namespace PRDock.Tests.Views;

public class SidebarAutoHideTests
{
    [Fact]
    public void MinimizeToBadge_HidesSidebar()
    {
        var vm = new MainViewModel();
        vm.MinimizeToBadgeCommand.Execute(null);
        vm.IsSidebarVisible.Should().BeFalse();
    }

    [Fact]
    public void ToggleSidebar_TogglesVisibility()
    {
        var vm = new MainViewModel();
        vm.IsSidebarVisible.Should().BeTrue();

        vm.ToggleSidebarCommand.Execute(null);
        vm.IsSidebarVisible.Should().BeFalse();

        vm.ToggleSidebarCommand.Execute(null);
        vm.IsSidebarVisible.Should().BeTrue();
    }
}
