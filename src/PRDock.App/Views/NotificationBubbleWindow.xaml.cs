using System.ComponentModel;
using System.Windows;
using System.Windows.Media.Animation;
using PRDock.App.Infrastructure;
using PRDock.App.ViewModels;
using WinFormsScreen = System.Windows.Forms.Screen;

namespace PRDock.App.Views;

public partial class NotificationBubbleWindow : Window
{
    private readonly NotificationBubbleViewModel _viewModel;

    public NotificationBubbleWindow(NotificationBubbleViewModel viewModel)
    {
        _viewModel = viewModel;
        DataContext = viewModel;
        InitializeComponent();

        viewModel.PropertyChanged += ViewModel_PropertyChanged;
    }

    private void ViewModel_PropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName != nameof(NotificationBubbleViewModel.IsVisible))
            return;

        if (_viewModel.IsVisible)
        {
            PositionWindow();
            Show();
            PlaySlideIn();
        }
        else
        {
            PlaySlideOut();
        }
    }

    private void PositionWindow()
    {
        var screen = WinFormsScreen.PrimaryScreen;
        if (screen is null) return;

        var workArea = screen.WorkingArea;
        Left = workArea.Right / DpiScaleX() - Width - 12;
        Top = workArea.Bottom / DpiScaleY() - ActualHeight - 12;

        // If ActualHeight is 0 (first show), estimate
        if (ActualHeight < 1)
        {
            Top = workArea.Bottom / DpiScaleY() - 160;
        }
    }

    private double DpiScaleX()
    {
        var source = PresentationSource.FromVisual(this);
        return source?.CompositionTarget?.TransformToDevice.M11 ?? 1.0;
    }

    private double DpiScaleY()
    {
        var source = PresentationSource.FromVisual(this);
        return source?.CompositionTarget?.TransformToDevice.M22 ?? 1.0;
    }

    private void PlaySlideIn()
    {
        // Slide in from right (CSS-like slide animation)
        var slide = new DoubleAnimation(400, 0, AnimationHelper.Slow)
        {
            EasingFunction = AnimationHelper.EaseOut
        };
        SlideTransform.BeginAnimation(System.Windows.Media.TranslateTransform.XProperty, slide);

        // Also fade in for extra polish
        AnimationHelper.Fade(this, 0, 1, AnimationHelper.Normal);
    }

    private void PlaySlideOut()
    {
        var slide = new DoubleAnimation(0, 400, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseIn
        };
        // Fade out simultaneously
        var fade = new DoubleAnimation(1, 0, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseIn
        };
        fade.Completed += (_, _) => Hide();
        BeginAnimation(OpacityProperty, fade);
        SlideTransform.BeginAnimation(System.Windows.Media.TranslateTransform.XProperty, slide);
    }

    private void Card_MouseEnter(object sender, System.Windows.Input.MouseEventArgs e)
    {
        _viewModel.PauseTimer();
    }

    private void Card_MouseLeave(object sender, System.Windows.Input.MouseEventArgs e)
    {
        _viewModel.ResumeTimer();
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        // Prevent actual close — just hide
        e.Cancel = true;
        Hide();
    }
}
