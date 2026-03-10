using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Animation;
using PRDock.App.Infrastructure;
using PRDock.App.ViewModels;
using WpfKeyEventArgs = System.Windows.Input.KeyEventArgs;

namespace PRDock.App.Views;

public partial class PRDetailWindow : Window
{
    private bool _isClosingAnimated;
    private string? _lastTab;

    public PRDetailWindow(PRDetailViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();
        Loaded += (_, _) => PlayEntranceAnimation();
        viewModel.PropertyChanged += OnViewModelPropertyChanged;
    }

    private PRDetailViewModel ViewModel => (PRDetailViewModel)DataContext;

    private void OnViewModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(PRDetailViewModel.ActiveTab))
        {
            var newTab = ViewModel.ActiveTab;
            if (newTab != _lastTab)
            {
                _lastTab = newTab;
                PlayTabContentFade();
            }
        }
    }

    private void PlayTabContentFade()
    {
        // Quick fade: 0 → 1 with slight upward slide
        TabContentGrid.Opacity = 0;
        var fade = new DoubleAnimation(0, 1, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseOut
        };
        TabContentGrid.BeginAnimation(OpacityProperty, fade);
    }

    private void PlayEntranceAnimation()
    {
        // Fade + slide in from the side
        Opacity = 0;
        var fade = new DoubleAnimation(0, 1, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseOut
        };
        BeginAnimation(OpacityProperty, fade);
    }

    private void PlayExitAnimation(Action onCompleted)
    {
        var fade = new DoubleAnimation(1, 0, AnimationHelper.Fast)
        {
            EasingFunction = AnimationHelper.EaseIn
        };
        fade.Completed += (_, _) => onCompleted();
        BeginAnimation(OpacityProperty, fade);
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        if (!_isClosingAnimated)
        {
            e.Cancel = true;
            _isClosingAnimated = true;
            PlayExitAnimation(() => Close());
            return;
        }

        base.OnClosing(e);
    }

    protected override void OnKeyDown(WpfKeyEventArgs e)
    {
        base.OnKeyDown(e);

        if (e.Key == Key.Escape)
        {
            e.Handled = true;
            Close();
            return;
        }

        // Ctrl+1-3 to switch tabs
        if (Keyboard.Modifiers == ModifierKeys.Control)
        {
            var tabName = e.Key switch
            {
                Key.D1 => "Overview",
                Key.D2 => "Checks",
                Key.D3 => "Reviews",
                _ => null
            };

            if (tabName is not null)
            {
                e.Handled = true;
                ViewModel.SetTabCommand.Execute(tabName);
            }
        }
    }

    private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount == 1)
            DragMove();
    }
}
