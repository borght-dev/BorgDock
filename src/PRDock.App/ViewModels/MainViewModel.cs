using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace PRDock.App.ViewModels;

public partial class MainViewModel : ObservableObject
{
    [ObservableProperty]
    private bool _isSidebarVisible = true;

    [ObservableProperty]
    private bool _isPinned = true;

    [ObservableProperty]
    private string _statusText = "PRDock — 0 open PRs";

    [ObservableProperty]
    private string _sidebarMode = "pinned";

    [RelayCommand]
    private void ToggleSidebar()
    {
        IsSidebarVisible = !IsSidebarVisible;
    }

    [RelayCommand]
    private void TogglePin()
    {
        IsPinned = !IsPinned;
        SidebarMode = IsPinned ? "pinned" : "autohide";
    }

    [RelayCommand]
    private void MinimizeToBadge()
    {
        IsSidebarVisible = false;
    }

    [RelayCommand]
    private void OpenSettings()
    {
        // Placeholder — settings UI not yet implemented.
    }
}
