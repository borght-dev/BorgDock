using System.Windows;
using System.Windows.Media.Animation;
using PRDock.App.Infrastructure;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class WorktreePruneDialog : Window
{
    public WorktreePruneDialog(WorktreePruneViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
        Loaded += async (_, _) =>
        {
            PlayEntranceAnimation();
            await viewModel.LoadWorktreesCommand.ExecuteAsync(null);
        };
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
        Close();
    }
}
