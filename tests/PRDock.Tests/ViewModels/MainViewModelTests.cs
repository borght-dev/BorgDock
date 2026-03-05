using System.ComponentModel;
using FluentAssertions;
using PRDock.App.Models;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class MainViewModelTests
{
    [Fact]
    public void DefaultValues_AreCorrect()
    {
        var vm = new MainViewModel();

        vm.IsSidebarVisible.Should().BeTrue();
        vm.StatusText.Should().Be("PRDock \u2014 0 open PRs");
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

    [Theory]
    [InlineData(ReviewStatus.Approved, false, "\u2713 Approved", "green")]
    [InlineData(ReviewStatus.ChangesRequested, false, "\u2717 Changes requested", "red")]
    [InlineData(ReviewStatus.Commented, false, "Commented", "gray")]
    [InlineData(ReviewStatus.Pending, false, "Review required", "yellow")]
    [InlineData(ReviewStatus.None, false, "Review required", "yellow")]
    public void FormatReviewBadge_NonDraft_ReturnsCorrectTextAndColor(
        ReviewStatus status, bool isDraft, string expectedText, string expectedColor)
    {
        var (text, color) = MainViewModel.FormatReviewBadge(status, isDraft);

        text.Should().Be(expectedText);
        color.Should().Be(expectedColor);
    }

    [Theory]
    [InlineData(ReviewStatus.Approved)]
    [InlineData(ReviewStatus.ChangesRequested)]
    [InlineData(ReviewStatus.Pending)]
    [InlineData(ReviewStatus.None)]
    public void FormatReviewBadge_Draft_ReturnsEmptyText(ReviewStatus status)
    {
        var (text, color) = MainViewModel.FormatReviewBadge(status, isDraft: true);

        text.Should().BeEmpty();
        color.Should().Be("gray");
    }
}
