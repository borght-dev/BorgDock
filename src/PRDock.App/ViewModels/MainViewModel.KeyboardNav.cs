using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace PRDock.App.ViewModels;

public partial class MainViewModel
{
    [ObservableProperty]
    private int _focusedIndex = -1;

    public List<PullRequestCardViewModel> GetVisibleCards()
    {
        return RepoGroups
            .Where(g => g.IsExpanded)
            .SelectMany(g => g.PullRequests)
            .ToList();
    }

    [RelayCommand]
    private void MoveFocusUp()
    {
        var cards = GetVisibleCards();
        if (cards.Count == 0) return;

        ClearFocus();
        FocusedIndex = FocusedIndex <= 0 ? cards.Count - 1 : FocusedIndex - 1;
        if (FocusedIndex >= 0 && FocusedIndex < cards.Count)
            cards[FocusedIndex].IsFocused = true;
    }

    [RelayCommand]
    private void MoveFocusDown()
    {
        var cards = GetVisibleCards();
        if (cards.Count == 0) return;

        ClearFocus();
        FocusedIndex = FocusedIndex < 0 || FocusedIndex >= cards.Count - 1 ? 0 : FocusedIndex + 1;
        if (FocusedIndex >= 0 && FocusedIndex < cards.Count)
            cards[FocusedIndex].IsFocused = true;
    }

    [RelayCommand]
    private void ToggleFocusedDetail()
    {
        var cards = GetVisibleCards();
        if (FocusedIndex >= 0 && FocusedIndex < cards.Count)
        {
            var card = cards[FocusedIndex];
            OpenPRDetailRequested?.Invoke(card);
        }
    }

    [RelayCommand]
    private void CollapseAll()
    {
        var cards = GetVisibleCards();
        foreach (var card in cards)
            card.IsDetailExpanded = false;
    }

    private void ClearFocus()
    {
        foreach (var group in RepoGroups)
            foreach (var pr in group.PullRequests)
                pr.IsFocused = false;
    }
}
