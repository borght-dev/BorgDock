using CommunityToolkit.Mvvm.ComponentModel;

namespace PRDock.App.ViewModels;

public partial class PullRequestCardViewModel
{
    [ObservableProperty]
    private bool _isFocused;

    [ObservableProperty]
    private bool _isDetailExpanded;
}
