using CommunityToolkit.Mvvm.ComponentModel;

namespace PRDock.App.ViewModels;

public partial class RepoGroupViewModel
{
    [ObservableProperty]
    private bool _isRecentlyClosed;
}
