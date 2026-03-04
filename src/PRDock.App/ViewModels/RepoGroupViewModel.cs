using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace PRDock.App.ViewModels;

public partial class RepoGroupViewModel : ObservableObject
{
    [ObservableProperty]
    private string _repoFullName = "";

    [ObservableProperty]
    private int _prCount;

    [ObservableProperty]
    private bool _isExpanded = true;

    public ObservableCollection<PullRequestCardViewModel> PullRequests { get; } = [];

    [RelayCommand]
    private void ToggleExpand()
    {
        IsExpanded = !IsExpanded;
    }
}
