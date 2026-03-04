using FluentAssertions;
using PRDock.App.ViewModels;
using PRDock.App.Views;

namespace PRDock.Tests.Views;

public class SidebarAutoHideTests
{
    [Fact]
    public void AnimationState_DefaultValues()
    {
        AnimationState.Visible.Should().Be((AnimationState)0);
        AnimationState.Hidden.Should().Be((AnimationState)1);
        AnimationState.SlidingIn.Should().Be((AnimationState)2);
        AnimationState.SlidingOut.Should().Be((AnimationState)3);
    }

    [Fact]
    public void TogglePin_SwitchesSidebarModeToAutohide()
    {
        var vm = new MainViewModel();
        vm.TogglePinCommand.Execute(null);
        vm.IsPinned.Should().BeFalse();
        vm.SidebarMode.Should().Be("autohide");
    }

    [Fact]
    public void TogglePin_SwitchesSidebarModeBackToPinned()
    {
        var vm = new MainViewModel();
        vm.TogglePinCommand.Execute(null);
        vm.TogglePinCommand.Execute(null);
        vm.IsPinned.Should().BeTrue();
        vm.SidebarMode.Should().Be("pinned");
    }

    [Fact]
    public void SidebarMode_DefaultIsPinned()
    {
        var vm = new MainViewModel();
        vm.SidebarMode.Should().Be("pinned");
        vm.IsPinned.Should().BeTrue();
    }

    [Fact]
    public void AnimationState_HasAllExpectedValues()
    {
        var values = Enum.GetValues<AnimationState>();
        values.Should().HaveCount(4);
        values.Should().Contain(AnimationState.Visible);
        values.Should().Contain(AnimationState.Hidden);
        values.Should().Contain(AnimationState.SlidingIn);
        values.Should().Contain(AnimationState.SlidingOut);
    }

    [Fact]
    public void TogglePin_RaisesPropertyChanged_ForSidebarMode()
    {
        var vm = new MainViewModel();
        var changedProperties = new List<string>();
        vm.PropertyChanged += (_, e) => changedProperties.Add(e.PropertyName!);
        vm.TogglePinCommand.Execute(null);
        changedProperties.Should().Contain(nameof(MainViewModel.SidebarMode));
        changedProperties.Should().Contain(nameof(MainViewModel.IsPinned));
    }

    [Fact]
    public void TogglePin_MultipleTimes_AlternatesBetweenModes()
    {
        var vm = new MainViewModel();
        for (int i = 0; i < 5; i++)
        {
            vm.TogglePinCommand.Execute(null);
            vm.SidebarMode.Should().Be("autohide");
            vm.IsPinned.Should().BeFalse();
            vm.TogglePinCommand.Execute(null);
            vm.SidebarMode.Should().Be("pinned");
            vm.IsPinned.Should().BeTrue();
        }
    }

    [Fact]
    public void EaseOutCurve_ProducesExpectedValues()
    {
        static double EaseOut(double t) => 1.0 - Math.Pow(1.0 - t, 3);
        EaseOut(0.0).Should().BeApproximately(0.0, 0.001);
        EaseOut(1.0).Should().BeApproximately(1.0, 0.001);
        EaseOut(0.5).Should().BeGreaterThan(0.5);
        double prev = 0;
        for (double t = 0.1; t <= 1.0; t += 0.1)
        {
            double val = EaseOut(t);
            val.Should().BeGreaterThan(prev);
            prev = val;
        }
    }

    [Fact]
    public void SlideAnimation_DurationsAreReasonable()
    {
        const double slideInMs = 200;
        const double slideOutDelayMs = 500;
        const double slideOutMs = 200;
        slideInMs.Should().BeInRange(100, 500);
        slideOutDelayMs.Should().BeInRange(300, 1000);
        slideOutMs.Should().BeInRange(100, 500);
    }

    [Fact]
    public void MinimizeToBadge_HidesSidebarInBothModes()
    {
        var vm = new MainViewModel();
        vm.MinimizeToBadgeCommand.Execute(null);
        vm.IsSidebarVisible.Should().BeFalse();
        vm.IsSidebarVisible = true;
        vm.TogglePinCommand.Execute(null);
        vm.MinimizeToBadgeCommand.Execute(null);
        vm.IsSidebarVisible.Should().BeFalse();
    }
}
