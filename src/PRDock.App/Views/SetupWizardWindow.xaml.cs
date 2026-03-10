using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Animation;
using PRDock.App.Infrastructure;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class SetupWizardWindow : Window
{
    public SetupWizardWindow(SetupWizardViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();
        Loaded += async (_, _) =>
        {
            PlayEntranceAnimation();
            await viewModel.CheckAuthCommand.ExecuteAsync(null);
        };
        MouseLeftButtonDown += (_, e) => { if (e.ChangedButton == MouseButton.Left) DragMove(); };
    }

    private void PlayEntranceAnimation()
    {
        // Scale + fade in (dialog pop)
        Opacity = 0;
        var fade = new DoubleAnimation(0, 1, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseOut
        };
        BeginAnimation(OpacityProperty, fade);
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = true;
        Close();
    }

    private void CloseWindowButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
