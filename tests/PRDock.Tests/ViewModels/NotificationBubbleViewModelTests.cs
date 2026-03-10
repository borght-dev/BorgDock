using FluentAssertions;
using PRDock.App.Models;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class NotificationBubbleViewModelTests
{
    private static InAppNotification CreateNotification(
        string title = "Check failed: build",
        string message = "#42 Fix the thing (owner/repo)",
        string severity = "error",
        List<(string, string)>? actions = null) => new()
    {
        Title = title,
        Message = message,
        Severity = severity,
        LaunchUrl = "https://github.com/owner/repo/pull/42",
        PrNumber = 42,
        RepoFullName = "owner/repo",
        Actions = actions ?? [("Open in GitHub", "https://github.com/owner/repo/pull/42")]
    };

    [Fact]
    public void Show_SetsPropertiesAndBecomesVisible()
    {
        var vm = new NotificationBubbleViewModel();
        var notification = CreateNotification();

        vm.Show(notification);

        vm.IsVisible.Should().BeTrue();
        vm.Title.Should().Be("Check failed: build");
        vm.Message.Should().Be("#42 Fix the thing (owner/repo)");
        vm.Severity.Should().Be("error");
        vm.SeverityIcon.Should().Be("\u2715");
    }

    [Fact]
    public void Show_WithActions_SetsPrimaryAction()
    {
        var vm = new NotificationBubbleViewModel();
        var notification = CreateNotification(actions:
        [
            ("Open in GitHub", "https://github.com/owner/repo/pull/42"),
            ("Fix with Claude", "prdock://fix/owner/repo/42")
        ]);

        vm.Show(notification);

        vm.HasPrimaryAction.Should().BeTrue();
        vm.PrimaryActionLabel.Should().Be("Open in GitHub");
        vm.PrimaryActionUrl.Should().Be("https://github.com/owner/repo/pull/42");
        vm.HasSecondaryAction.Should().BeTrue();
        vm.SecondaryActionLabel.Should().Be("Fix with Claude");
        vm.SecondaryActionUrl.Should().Be("prdock://fix/owner/repo/42");
    }

    [Fact]
    public void Show_WithNoActions_HasNoPrimaryAction()
    {
        var vm = new NotificationBubbleViewModel();
        var notification = CreateNotification(actions: []);

        vm.Show(notification);

        vm.HasPrimaryAction.Should().BeFalse();
        vm.HasSecondaryAction.Should().BeFalse();
    }

    [Fact]
    public void Show_WithOneAction_HasPrimaryOnly()
    {
        var vm = new NotificationBubbleViewModel();
        var notification = CreateNotification(actions:
        [
            ("Open", "https://example.com")
        ]);

        vm.Show(notification);

        vm.HasPrimaryAction.Should().BeTrue();
        vm.HasSecondaryAction.Should().BeFalse();
    }

    [Fact]
    public void Show_WhenAlreadyVisible_QueuesNotification()
    {
        var vm = new NotificationBubbleViewModel();

        vm.Show(CreateNotification(title: "First"));
        vm.Show(CreateNotification(title: "Second"));

        vm.IsVisible.Should().BeTrue();
        vm.Title.Should().Be("First"); // First is still showing
        vm.QueueCount.Should().Be(1);  // Second is queued
    }

    [Fact]
    public void Show_MultipleQueued_TracksCount()
    {
        var vm = new NotificationBubbleViewModel();

        vm.Show(CreateNotification(title: "First"));
        vm.Show(CreateNotification(title: "Second"));
        vm.Show(CreateNotification(title: "Third"));

        vm.QueueCount.Should().Be(2);
    }

    [Fact]
    public void Dismiss_HidesNotification()
    {
        var vm = new NotificationBubbleViewModel();
        vm.Show(CreateNotification());

        vm.DismissCommand.Execute(null);

        vm.IsVisible.Should().BeFalse();
    }

    [Theory]
    [InlineData("error", "\u2715")]
    [InlineData("success", "\u2713")]
    [InlineData("warning", "\u26A0")]
    [InlineData("info", "\u2139")]
    public void Show_SetsSeverityIcon(string severity, string expectedIcon)
    {
        var vm = new NotificationBubbleViewModel();
        vm.Show(CreateNotification(severity: severity));
        vm.SeverityIcon.Should().Be(expectedIcon);
    }

    [Fact]
    public void ProgressFraction_StartsAtOne()
    {
        var vm = new NotificationBubbleViewModel();
        vm.Show(CreateNotification());
        vm.ProgressFraction.Should().Be(1.0);
    }

    [Fact]
    public void LaunchUrl_SetFromNotification()
    {
        var vm = new NotificationBubbleViewModel();
        vm.Show(CreateNotification());
        vm.LaunchUrl.Should().Be("https://github.com/owner/repo/pull/42");
    }
}
