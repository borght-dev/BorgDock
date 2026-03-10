using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;

namespace PRDock.App.ViewModels;

public partial class NotificationBubbleViewModel : ObservableObject
{
    private const int AutoDismissMs = 8000;
    private const int TickIntervalMs = 50;

    private readonly Queue<InAppNotification> _queue = new();
    private DispatcherTimer? _timer;
    private int _elapsedMs;

    [ObservableProperty]
    private bool _isVisible;

    [ObservableProperty]
    private string _title = "";

    [ObservableProperty]
    private string _message = "";

    [ObservableProperty]
    private string _severity = "info";

    [ObservableProperty]
    private string _severityIcon = "\u2139";

    [ObservableProperty]
    private double _progressFraction = 1.0;

    [ObservableProperty]
    private string? _launchUrl;

    [ObservableProperty]
    private string _primaryActionLabel = "";

    [ObservableProperty]
    private string _primaryActionUrl = "";

    [ObservableProperty]
    private bool _hasPrimaryAction;

    [ObservableProperty]
    private string _secondaryActionLabel = "";

    [ObservableProperty]
    private string _secondaryActionUrl = "";

    [ObservableProperty]
    private bool _hasSecondaryAction;

    [ObservableProperty]
    private int _queueCount;

    public void Show(InAppNotification notification)
    {
        if (IsVisible)
        {
            _queue.Enqueue(notification);
            QueueCount = _queue.Count;
            return;
        }

        DisplayNotification(notification);
    }

    private void DisplayNotification(InAppNotification notification)
    {
        Title = notification.Title;
        Message = notification.Message;
        Severity = notification.Severity;
        SeverityIcon = notification.Severity switch
        {
            "error" => "\u2715",
            "success" => "\u2713",
            "warning" => "\u26A0",
            _ => "\u2139"
        };
        LaunchUrl = notification.LaunchUrl;

        if (notification.Actions.Count > 0)
        {
            PrimaryActionLabel = notification.Actions[0].Label;
            PrimaryActionUrl = notification.Actions[0].Url;
            HasPrimaryAction = true;
        }
        else
        {
            HasPrimaryAction = false;
        }

        if (notification.Actions.Count > 1)
        {
            SecondaryActionLabel = notification.Actions[1].Label;
            SecondaryActionUrl = notification.Actions[1].Url;
            HasSecondaryAction = true;
        }
        else
        {
            HasSecondaryAction = false;
        }

        _elapsedMs = 0;
        ProgressFraction = 1.0;
        IsVisible = true;
        QueueCount = _queue.Count;

        StartTimer();
    }

    private void StartTimer()
    {
        _timer?.Stop();
        _timer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(TickIntervalMs)
        };
        _timer.Tick += (_, _) =>
        {
            _elapsedMs += TickIntervalMs;
            ProgressFraction = Math.Max(0, 1.0 - (double)_elapsedMs / AutoDismissMs);

            if (_elapsedMs >= AutoDismissMs)
            {
                Dismiss();
            }
        };
        _timer.Start();
    }

    [RelayCommand]
    private void Dismiss()
    {
        _timer?.Stop();
        IsVisible = false;

        if (_queue.Count > 0)
        {
            var next = _queue.Dequeue();
            QueueCount = _queue.Count;
            // Small delay before showing next notification
            var delay = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(300) };
            delay.Tick += (_, _) =>
            {
                delay.Stop();
                DisplayNotification(next);
            };
            delay.Start();
        }
    }

    [RelayCommand]
    private void PrimaryAction()
    {
        if (!string.IsNullOrEmpty(PrimaryActionUrl))
        {
            OpenUrl(PrimaryActionUrl);
        }
        Dismiss();
    }

    [RelayCommand]
    private void SecondaryAction()
    {
        if (!string.IsNullOrEmpty(SecondaryActionUrl))
        {
            OpenUrl(SecondaryActionUrl);
        }
        Dismiss();
    }

    [RelayCommand]
    private void OpenInBrowser()
    {
        if (!string.IsNullOrEmpty(LaunchUrl))
        {
            OpenUrl(LaunchUrl);
        }
    }

    /// <summary>
    /// Pause the auto-dismiss timer (e.g. on mouse hover).
    /// </summary>
    public void PauseTimer() => _timer?.Stop();

    /// <summary>
    /// Resume the auto-dismiss timer (e.g. on mouse leave).
    /// </summary>
    public void ResumeTimer() => _timer?.Start();

    private static void OpenUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch
        {
            // best-effort
        }
    }
}
