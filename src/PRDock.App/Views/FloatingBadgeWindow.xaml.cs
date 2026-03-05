using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Animation;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class FloatingBadgeWindow : Window
{
    private string _lastBackgroundColor = "green";

    public FloatingBadgeWindow(FloatingBadgeViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();

        viewModel.PropertyChanged += ViewModel_PropertyChanged;
    }

    private void ViewModel_PropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(FloatingBadgeViewModel.BackgroundColor))
        {
            var vm = (FloatingBadgeViewModel)DataContext;
            if (vm.BackgroundColor != _lastBackgroundColor)
            {
                _lastBackgroundColor = vm.BackgroundColor;
                PlayPulseAnimation();
            }
        }
    }

    private void PlayPulseAnimation()
    {
        if (TryFindResource("PulseAnimation") is Storyboard storyboard)
        {
            storyboard.Begin();
        }
    }

    private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton == MouseButton.Left)
        {
            var startLeft = Left;
            var startTop = Top;
            DragMove();

            // DragMove() is blocking — after it returns, check if the window
            // actually moved. If it didn't, treat it as a click.
            if (Math.Abs(Left - startLeft) < 4 && Math.Abs(Top - startTop) < 4)
            {
                if (DataContext is FloatingBadgeViewModel vm)
                {
                    vm.ExpandSidebarCommand.Execute(null);
                }
            }
        }
    }

    private void BadgeBorder_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        // Click is now handled in Window_MouseLeftButtonDown after DragMove returns.
        // This handler is kept for backwards compatibility but DragMove() consumes
        // the mouse-up event, so it rarely fires in practice.
        if (DataContext is FloatingBadgeViewModel vm)
        {
            vm.ExpandSidebarCommand.Execute(null);
        }
    }
}
