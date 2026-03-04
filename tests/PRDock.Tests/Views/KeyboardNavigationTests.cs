using FluentAssertions;
using PRDock.App.ViewModels;
using Xunit;

namespace PRDock.Tests.Views;

public class KeyboardNavigationTests
{
    private static MainViewModel CreateViewModelWithCards(int count)
    {
        var vm = new MainViewModel();
        var cards = Enumerable.Range(1, count).Select(i => new PullRequestCardViewModel
        {
            Number = i,
            Title = $"PR #{i}",
            RepoOwner = "owner",
            RepoName = "repo",
            UpdatedAt = DateTime.UtcNow
        }).ToList();
        vm.UpdatePullRequests(cards);
        return vm;
    }

    private static MainViewModel CreateViewModelWithMultipleGroups()
    {
        var vm = new MainViewModel();
        var cards = new List<PullRequestCardViewModel>
        {
            new() { Number = 1, Title = "PR 1", RepoOwner = "owner", RepoName = "repo-a", UpdatedAt = DateTime.UtcNow },
            new() { Number = 2, Title = "PR 2", RepoOwner = "owner", RepoName = "repo-a", UpdatedAt = DateTime.UtcNow.AddMinutes(-1) },
            new() { Number = 3, Title = "PR 3", RepoOwner = "owner", RepoName = "repo-b", UpdatedAt = DateTime.UtcNow },
        };
        vm.UpdatePullRequests(cards);
        return vm;
    }

    [Fact]
    public void MoveFocusDown_FromMinusOne_FocusesFirstCard()
    {
        var vm = CreateViewModelWithCards(3);

        vm.MoveFocusDownCommand.Execute(null);

        vm.FocusedIndex.Should().Be(0);
        vm.GetVisibleCards()[0].IsFocused.Should().BeTrue();
    }

    [Fact]
    public void MoveFocusDown_FromFirstCard_FocusesSecondCard()
    {
        var vm = CreateViewModelWithCards(3);
        vm.MoveFocusDownCommand.Execute(null); // focus index 0

        vm.MoveFocusDownCommand.Execute(null); // focus index 1

        vm.FocusedIndex.Should().Be(1);
        vm.GetVisibleCards()[1].IsFocused.Should().BeTrue();
        vm.GetVisibleCards()[0].IsFocused.Should().BeFalse();
    }

    [Fact]
    public void MoveFocusDown_FromLastCard_WrapsToFirst()
    {
        var vm = CreateViewModelWithCards(3);
        vm.MoveFocusDownCommand.Execute(null); // 0
        vm.MoveFocusDownCommand.Execute(null); // 1
        vm.MoveFocusDownCommand.Execute(null); // 2

        vm.MoveFocusDownCommand.Execute(null); // should wrap to 0

        vm.FocusedIndex.Should().Be(0);
        vm.GetVisibleCards()[0].IsFocused.Should().BeTrue();
        vm.GetVisibleCards()[2].IsFocused.Should().BeFalse();
    }

    [Fact]
    public void MoveFocusUp_FromMinusOne_FocusesLastCard()
    {
        var vm = CreateViewModelWithCards(3);

        vm.MoveFocusUpCommand.Execute(null);

        vm.FocusedIndex.Should().Be(2);
        vm.GetVisibleCards()[2].IsFocused.Should().BeTrue();
    }

    [Fact]
    public void MoveFocusUp_FromFirstCard_WrapsToLast()
    {
        var vm = CreateViewModelWithCards(3);
        vm.MoveFocusDownCommand.Execute(null); // focus index 0

        vm.MoveFocusUpCommand.Execute(null); // should wrap to last

        vm.FocusedIndex.Should().Be(2);
        vm.GetVisibleCards()[2].IsFocused.Should().BeTrue();
        vm.GetVisibleCards()[0].IsFocused.Should().BeFalse();
    }

    [Fact]
    public void MoveFocusUp_FromSecondCard_FocusesFirst()
    {
        var vm = CreateViewModelWithCards(3);
        vm.MoveFocusDownCommand.Execute(null); // 0
        vm.MoveFocusDownCommand.Execute(null); // 1

        vm.MoveFocusUpCommand.Execute(null);

        vm.FocusedIndex.Should().Be(0);
        vm.GetVisibleCards()[0].IsFocused.Should().BeTrue();
    }

    [Fact]
    public void MoveFocusDown_WithNoCards_DoesNothing()
    {
        var vm = new MainViewModel();

        vm.MoveFocusDownCommand.Execute(null);

        vm.FocusedIndex.Should().Be(-1);
    }

    [Fact]
    public void MoveFocusUp_WithNoCards_DoesNothing()
    {
        var vm = new MainViewModel();

        vm.MoveFocusUpCommand.Execute(null);

        vm.FocusedIndex.Should().Be(-1);
    }

    [Fact]
    public void ToggleFocusedDetail_ExpandsDetailOnFocusedCard()
    {
        var vm = CreateViewModelWithCards(3);
        vm.MoveFocusDownCommand.Execute(null); // focus index 0

        vm.ToggleFocusedDetailCommand.Execute(null);

        vm.GetVisibleCards()[0].IsDetailExpanded.Should().BeTrue();
    }

    [Fact]
    public void ToggleFocusedDetail_CollapsesWhenAlreadyExpanded()
    {
        var vm = CreateViewModelWithCards(3);
        vm.MoveFocusDownCommand.Execute(null);
        vm.ToggleFocusedDetailCommand.Execute(null); // expand

        vm.ToggleFocusedDetailCommand.Execute(null); // collapse

        vm.GetVisibleCards()[0].IsDetailExpanded.Should().BeFalse();
    }

    [Fact]
    public void ToggleFocusedDetail_WhenNoCardFocused_DoesNothing()
    {
        var vm = CreateViewModelWithCards(3);

        vm.ToggleFocusedDetailCommand.Execute(null);

        vm.GetVisibleCards().Should().AllSatisfy(c => c.IsDetailExpanded.Should().BeFalse());
    }

    [Fact]
    public void CollapseAll_CollapsesAllExpandedDetails()
    {
        var vm = CreateViewModelWithCards(3);
        vm.GetVisibleCards()[0].IsDetailExpanded = true;
        vm.GetVisibleCards()[1].IsDetailExpanded = true;

        vm.CollapseAllCommand.Execute(null);

        vm.GetVisibleCards().Should().AllSatisfy(c => c.IsDetailExpanded.Should().BeFalse());
    }

    [Fact]
    public void ClearFocus_ClearsAllFocusedFlags()
    {
        var vm = CreateViewModelWithCards(3);
        vm.MoveFocusDownCommand.Execute(null); // focus 0
        vm.MoveFocusDownCommand.Execute(null); // focus 1, clears 0

        // Only index 1 should be focused
        var cards = vm.GetVisibleCards();
        cards[0].IsFocused.Should().BeFalse();
        cards[1].IsFocused.Should().BeTrue();
        cards[2].IsFocused.Should().BeFalse();
    }

    [Fact]
    public void GetVisibleCards_ExcludesCollapsedGroups()
    {
        var vm = CreateViewModelWithMultipleGroups();
        vm.RepoGroups.Should().HaveCount(2);

        // Collapse first group
        vm.RepoGroups[0].IsExpanded = false;

        var visible = vm.GetVisibleCards();
        visible.Should().HaveCount(1);
        visible[0].Number.Should().Be(3); // Only repo-b card
    }

    [Fact]
    public void GetVisibleCards_ReturnsAllCardsFromExpandedGroups()
    {
        var vm = CreateViewModelWithMultipleGroups();

        var visible = vm.GetVisibleCards();

        visible.Should().HaveCount(3);
    }

    [Fact]
    public void FocusedIndex_InitializesToMinusOne()
    {
        var vm = new MainViewModel();

        vm.FocusedIndex.Should().Be(-1);
    }

    [Fact]
    public void IsFocused_DefaultsFalse()
    {
        var card = new PullRequestCardViewModel();

        card.IsFocused.Should().BeFalse();
    }

    [Fact]
    public void IsDetailExpanded_DefaultsFalse()
    {
        var card = new PullRequestCardViewModel();

        card.IsDetailExpanded.Should().BeFalse();
    }

    [Fact]
    public void MoveFocusDown_NavigatesAcrossGroups()
    {
        var vm = CreateViewModelWithMultipleGroups();

        // Navigate through all 3 cards across 2 groups
        vm.MoveFocusDownCommand.Execute(null); // card 0 (repo-a)
        vm.MoveFocusDownCommand.Execute(null); // card 1 (repo-a)
        vm.MoveFocusDownCommand.Execute(null); // card 2 (repo-b)

        vm.FocusedIndex.Should().Be(2);
        vm.GetVisibleCards()[2].IsFocused.Should().BeTrue();
    }
}
