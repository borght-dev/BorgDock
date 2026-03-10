using FluentAssertions;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class FloatingBadgeViewModelTests
{
    [Fact]
    public void DefaultValues_AreCorrect()
    {
        var vm = new FloatingBadgeViewModel();

        vm.TotalPrCount.Should().Be(0);
        vm.FailingCount.Should().Be(0);
        vm.PendingCount.Should().Be(0);
        vm.BadgeText.Should().Be("0 PRs");
        vm.BackgroundColor.Should().Be("green");
    }

    [Fact]
    public void Update_SetsAllProperties()
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(5, 2, 1);

        vm.TotalPrCount.Should().Be(5);
        vm.FailingCount.Should().Be(2);
        vm.PendingCount.Should().Be(1);
    }

    [Fact]
    public void Update_WithFailures_SetsBadgeTextWithFailingCount()
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(3, 1, 0);

        vm.BadgeText.Should().Be("3 PRs \u00b7 1 failing");
    }

    [Fact]
    public void Update_WithPendingOnly_SetsBadgeTextWithPendingCount()
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(4, 0, 2);

        vm.BadgeText.Should().Be("4 PRs \u00b7 2 in progress");
    }

    [Fact]
    public void Update_AllGreen_ShowsOnlyPrCount()
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(3, 0, 0);

        vm.BadgeText.Should().Be("3 PRs");
    }

    [Fact]
    public void Update_SinglePr_UsesSingularLabel()
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(1, 0, 0);

        vm.BadgeText.Should().Be("1 PR");
    }

    [Fact]
    public void Update_SinglePrFailing_UsesSingularLabel()
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(1, 1, 0);

        vm.BadgeText.Should().Be("1 PR \u00b7 1 failing");
    }

    [Fact]
    public void Update_FailingAndPending_ShowsBothInBadgeText()
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(5, 2, 3);

        vm.BadgeText.Should().Be("5 PRs \u00b7 2 failing, 3 in progress");
    }

    [Theory]
    [InlineData(1, 0, "red")]
    [InlineData(3, 0, "red")]
    public void BackgroundColor_IsRed_WhenFailuresExist(int failing, int pending, string expected)
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(5, failing, pending);

        vm.BackgroundColor.Should().Be(expected);
    }

    [Theory]
    [InlineData(0, 1, "yellow")]
    [InlineData(0, 5, "yellow")]
    public void BackgroundColor_IsYellow_WhenPendingOnly(int failing, int pending, string expected)
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(3, failing, pending);

        vm.BackgroundColor.Should().Be(expected);
    }

    [Fact]
    public void BackgroundColor_IsGreen_WhenAllPassing()
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(3, 0, 0);

        vm.BackgroundColor.Should().Be("green");
    }

    [Fact]
    public void BackgroundColor_IsRed_WhenBothFailingAndPending()
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(5, 2, 3);

        vm.BackgroundColor.Should().Be("red");
    }

    [Fact]
    public void ExpandSidebarCommand_RaisesEvent()
    {
        var vm = new FloatingBadgeViewModel();
        var raised = false;
        vm.ExpandSidebarRequested += () => raised = true;

        vm.ExpandSidebarCommand.Execute(null);

        raised.Should().BeTrue();
    }

    [Fact]
    public void QuitCommand_RaisesEvent()
    {
        var vm = new FloatingBadgeViewModel();
        var raised = false;
        vm.QuitRequested += () => raised = true;

        vm.QuitCommand.Execute(null);

        raised.Should().BeTrue();
    }

    [Fact]
    public void DockLeftCommand_RaisesEventWithLeft()
    {
        var vm = new FloatingBadgeViewModel();
        string? side = null;
        vm.DockSideRequested += s => side = s;

        vm.DockLeftCommand.Execute(null);

        side.Should().Be("Left");
    }

    [Fact]
    public void DockRightCommand_RaisesEventWithRight()
    {
        var vm = new FloatingBadgeViewModel();
        string? side = null;
        vm.DockSideRequested += s => side = s;

        vm.DockRightCommand.Execute(null);

        side.Should().Be("Right");
    }

    [Fact]
    public void OpenSettingsCommand_RaisesEvent()
    {
        var vm = new FloatingBadgeViewModel();
        var raised = false;
        vm.SettingsRequested += () => raised = true;

        vm.OpenSettingsCommand.Execute(null);

        raised.Should().BeTrue();
    }

    [Fact]
    public void PropertyChanged_FiresForTotalPrCount()
    {
        var vm = new FloatingBadgeViewModel();
        var changed = new List<string>();
        vm.PropertyChanged += (_, e) => changed.Add(e.PropertyName!);

        vm.TotalPrCount = 5;

        changed.Should().Contain("TotalPrCount");
    }

    [Fact]
    public void PropertyChanged_FiresForFailingCount()
    {
        var vm = new FloatingBadgeViewModel();
        var changed = new List<string>();
        vm.PropertyChanged += (_, e) => changed.Add(e.PropertyName!);

        vm.FailingCount = 2;

        changed.Should().Contain("FailingCount");
    }

    [Fact]
    public void PropertyChanged_FiresForBadgeText()
    {
        var vm = new FloatingBadgeViewModel();
        var changed = new List<string>();
        vm.PropertyChanged += (_, e) => changed.Add(e.PropertyName!);

        vm.Update(3, 1, 0);

        changed.Should().Contain("BadgeText");
    }

    [Fact]
    public void PropertyChanged_FiresForBackgroundColor()
    {
        var vm = new FloatingBadgeViewModel();
        var changed = new List<string>();
        vm.PropertyChanged += (_, e) => changed.Add(e.PropertyName!);

        vm.Update(3, 1, 0);

        changed.Should().Contain("BackgroundColor");
    }

    [Fact]
    public void FormatBadgeText_Static_ZeroPrs()
    {
        FloatingBadgeViewModel.FormatBadgeText(0, 0, 0).Should().Be("0 PRs");
    }

    [Fact]
    public void DetermineBackgroundColor_Static_FailingTakesPriority()
    {
        FloatingBadgeViewModel.DetermineBackgroundColor(1, 1).Should().Be("red");
    }

    [Fact]
    public void DetermineBackgroundColor_Static_PendingWhenNoFailures()
    {
        FloatingBadgeViewModel.DetermineBackgroundColor(0, 1).Should().Be("yellow");
    }

    [Fact]
    public void DetermineBackgroundColor_Static_GreenWhenAllClear()
    {
        FloatingBadgeViewModel.DetermineBackgroundColor(0, 0).Should().Be("green");
    }

    [Fact]
    public void Update_CalledMultipleTimes_UpdatesCorrectly()
    {
        var vm = new FloatingBadgeViewModel();

        vm.Update(5, 2, 1);
        vm.BackgroundColor.Should().Be("red");

        vm.Update(3, 0, 0);
        vm.BackgroundColor.Should().Be("green");
        vm.BadgeText.Should().Be("3 PRs");
    }
}
