using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace PRDock.App.ViewModels;

public partial class FloatingBadgeViewModel : ObservableObject
{
    [ObservableProperty]
    private int _totalPrCount;

    [ObservableProperty]
    private int _failingCount;

    [ObservableProperty]
    private int _pendingCount;

    [ObservableProperty]
    private string _badgeText = "0 PRs";

    [ObservableProperty]
    private string _backgroundColor = "green";

    [ObservableProperty]
    private string _toastText = "";

    [ObservableProperty]
    private bool _isToastVisible;

    public event Action? ExpandSidebarRequested;

    public event Action? QuitRequested;

    public event Action<string>? DockSideRequested;

    public event Action? SettingsRequested;

    public void Update(int totalPrCount, int failingCount, int pendingCount)
    {
        TotalPrCount = totalPrCount;
        FailingCount = failingCount;
        PendingCount = pendingCount;
        BadgeText = FormatBadgeText(totalPrCount, failingCount, pendingCount);
        BackgroundColor = DetermineBackgroundColor(failingCount, pendingCount);
    }

    public async void ShowToast(string message, int durationMs = 4000)
    {
        ToastText = message;
        IsToastVisible = true;
        await System.Threading.Tasks.Task.Delay(durationMs);
        if (ToastText == message)
        {
            IsToastVisible = false;
            ToastText = "";
        }
    }

    internal static string FormatBadgeText(int total, int failing, int pending)
    {
        var prLabel = total == 1 ? "PR" : "PRs";

        if (failing > 0)
            return $"{total} {prLabel} \u00b7 {failing} failing";

        if (pending > 0)
            return $"{total} {prLabel} \u00b7 {pending} pending";

        return $"{total} {prLabel}";
    }

    internal static string DetermineBackgroundColor(int failing, int pending)
    {
        if (failing > 0) return "red";
        if (pending > 0) return "yellow";
        return "green";
    }

    [RelayCommand]
    private void ExpandSidebar()
    {
        ExpandSidebarRequested?.Invoke();
    }

    [RelayCommand]
    private void Quit()
    {
        QuitRequested?.Invoke();
    }

    [RelayCommand]
    private void DockLeft()
    {
        DockSideRequested?.Invoke("Left");
    }

    [RelayCommand]
    private void DockRight()
    {
        DockSideRequested?.Invoke("Right");
    }

    [RelayCommand]
    private void OpenSettings()
    {
        SettingsRequested?.Invoke();
    }
}
