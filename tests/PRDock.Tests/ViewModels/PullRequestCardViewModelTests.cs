using System.ComponentModel;
using FluentAssertions;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class PullRequestCardViewModelTests
{
    [Fact]
    public void DefaultValues_AreCorrect()
    {
        var vm = new PullRequestCardViewModel();

        vm.Number.Should().Be(0);
        vm.Title.Should().Be("");
        vm.HeadRef.Should().Be("");
        vm.BaseRef.Should().Be("");
        vm.AuthorLogin.Should().Be("");
        vm.Age.Should().Be("");
        vm.StatusDotColor.Should().Be("gray");
        vm.IsMyPr.Should().BeFalse();
        vm.CheckSummary.Should().Be("");
        vm.ReviewBadgeText.Should().Be("");
        vm.HasMergeConflict.Should().BeFalse();
        vm.HasAllChecksPassed.Should().BeFalse();
        vm.CanBypassMerge.Should().BeFalse();
        vm.HtmlUrl.Should().Be("");
        vm.RepoOwner.Should().Be("");
        vm.RepoName.Should().Be("");
    }

    [Fact]
    public void Collections_AreInitialized()
    {
        var vm = new PullRequestCardViewModel();

        vm.FailedChecks.Should().NotBeNull();
        vm.FailedChecks.Should().BeEmpty();
        vm.PendingChecks.Should().NotBeNull();
        vm.PendingChecks.Should().BeEmpty();
    }

    [Fact]
    public void FormatAge_JustNow_WhenLessThan60Seconds()
    {
        var now = DateTime.UtcNow;
        PullRequestCardViewModel.FormatAge(now.AddSeconds(-30)).Should().Be("just now");
        PullRequestCardViewModel.FormatAge(now.AddSeconds(-5)).Should().Be("just now");
    }

    [Fact]
    public void FormatAge_Minutes_WhenLessThan60Minutes()
    {
        var now = DateTime.UtcNow;
        PullRequestCardViewModel.FormatAge(now.AddMinutes(-1)).Should().Be("1m ago");
        PullRequestCardViewModel.FormatAge(now.AddMinutes(-5)).Should().Be("5m ago");
        PullRequestCardViewModel.FormatAge(now.AddMinutes(-59)).Should().Be("59m ago");
    }

    [Fact]
    public void FormatAge_Hours_WhenLessThan24Hours()
    {
        var now = DateTime.UtcNow;
        PullRequestCardViewModel.FormatAge(now.AddHours(-1)).Should().Be("1h ago");
        PullRequestCardViewModel.FormatAge(now.AddHours(-2)).Should().Be("2h ago");
        PullRequestCardViewModel.FormatAge(now.AddHours(-23)).Should().Be("23h ago");
    }

    [Fact]
    public void FormatAge_Days_WhenLessThan14Days()
    {
        var now = DateTime.UtcNow;
        PullRequestCardViewModel.FormatAge(now.AddDays(-1)).Should().Be("1d ago");
        PullRequestCardViewModel.FormatAge(now.AddDays(-3)).Should().Be("3d ago");
        PullRequestCardViewModel.FormatAge(now.AddDays(-13)).Should().Be("13d ago");
    }

    [Fact]
    public void FormatAge_Weeks_When14DaysOrMore()
    {
        var now = DateTime.UtcNow;
        PullRequestCardViewModel.FormatAge(now.AddDays(-14)).Should().Be("2w ago");
        PullRequestCardViewModel.FormatAge(now.AddDays(-21)).Should().Be("3w ago");
        PullRequestCardViewModel.FormatAge(now.AddDays(-28)).Should().Be("4w ago");
    }

    [Fact]
    public void PropertyChanged_FiresForTitle()
    {
        var vm = new PullRequestCardViewModel();
        var changedProperties = new List<string>();
        vm.PropertyChanged += (_, e) => changedProperties.Add(e.PropertyName!);

        vm.Title = "Fix bug";

        changedProperties.Should().Contain("Title");
    }

    [Fact]
    public void PropertyChanged_FiresForStatusDotColor()
    {
        var vm = new PullRequestCardViewModel();
        var changedProperties = new List<string>();
        vm.PropertyChanged += (_, e) => changedProperties.Add(e.PropertyName!);

        vm.StatusDotColor = "green";

        changedProperties.Should().Contain("StatusDotColor");
    }

    [Fact]
    public void PropertyChanged_FiresForNumber()
    {
        var vm = new PullRequestCardViewModel();
        var changedProperties = new List<string>();
        vm.PropertyChanged += (_, e) => changedProperties.Add(e.PropertyName!);

        vm.Number = 42;

        changedProperties.Should().Contain("Number");
    }

    [Fact]
    public void PropertyChanged_FiresForIsMyPr()
    {
        var vm = new PullRequestCardViewModel();
        var changedProperties = new List<string>();
        vm.PropertyChanged += (_, e) => changedProperties.Add(e.PropertyName!);

        vm.IsMyPr = true;

        changedProperties.Should().Contain("IsMyPr");
    }

    [Fact]
    public void PropertyChanged_FiresForHasMergeConflict()
    {
        var vm = new PullRequestCardViewModel();
        var changedProperties = new List<string>();
        vm.PropertyChanged += (_, e) => changedProperties.Add(e.PropertyName!);

        vm.HasMergeConflict = true;

        changedProperties.Should().Contain("HasMergeConflict");
    }

    [Fact]
    public void SetProperties_RoundTrip()
    {
        var vm = new PullRequestCardViewModel
        {
            Number = 123,
            Title = "Add feature",
            HeadRef = "feature/branch",
            BaseRef = "main",
            AuthorLogin = "octocat",
            Age = "2h ago",
            StatusDotColor = "green",
            IsMyPr = true,
            CheckSummary = "6 passed",
            ReviewBadgeText = "Approved",
            HasMergeConflict = false,
            HasAllChecksPassed = true,
            CanBypassMerge = true,
            HtmlUrl = "https://github.com/owner/repo/pull/123",
            RepoOwner = "owner",
            RepoName = "repo"
        };

        vm.Number.Should().Be(123);
        vm.Title.Should().Be("Add feature");
        vm.HeadRef.Should().Be("feature/branch");
        vm.BaseRef.Should().Be("main");
        vm.AuthorLogin.Should().Be("octocat");
        vm.Age.Should().Be("2h ago");
        vm.StatusDotColor.Should().Be("green");
        vm.IsMyPr.Should().BeTrue();
        vm.CheckSummary.Should().Be("6 passed");
        vm.ReviewBadgeText.Should().Be("Approved");
        vm.HasMergeConflict.Should().BeFalse();
        vm.HasAllChecksPassed.Should().BeTrue();
        vm.CanBypassMerge.Should().BeTrue();
        vm.HtmlUrl.Should().Be("https://github.com/owner/repo/pull/123");
        vm.RepoOwner.Should().Be("owner");
        vm.RepoName.Should().Be("repo");
    }

    [Fact]
    public void FailedChecks_CanAddAndRemoveItems()
    {
        var vm = new PullRequestCardViewModel();

        vm.FailedChecks.Add("lint");
        vm.FailedChecks.Add("build");

        vm.FailedChecks.Should().HaveCount(2);
        vm.FailedChecks.Should().Contain("lint");
        vm.FailedChecks.Should().Contain("build");

        vm.FailedChecks.Remove("lint");
        vm.FailedChecks.Should().HaveCount(1);
    }

    [Fact]
    public void PendingChecks_CanAddAndRemoveItems()
    {
        var vm = new PullRequestCardViewModel();

        vm.PendingChecks.Add("deploy");

        vm.PendingChecks.Should().HaveCount(1);
        vm.PendingChecks.Should().Contain("deploy");
    }

    [Fact]
    public void BypassMergeCommand_InvokesBypassMergeRequestedCallback()
    {
        var vm = new PullRequestCardViewModel();
        PullRequestCardViewModel? callbackArg = null;
        vm.BypassMergeRequested = card => callbackArg = card;

        vm.BypassMergeCommand.Execute(null);

        callbackArg.Should().BeSameAs(vm);
    }
}
