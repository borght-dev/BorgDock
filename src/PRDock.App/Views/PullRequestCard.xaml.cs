using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using PRDock.App.Infrastructure;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class PullRequestCard : System.Windows.Controls.UserControl
{
    public PullRequestCard()
    {
        InitializeComponent();
        DataContextChanged += OnDataContextChanged;
    }

    private void OnDataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (e.OldValue is PullRequestCardViewModel oldVm)
            oldVm.PropertyChanged -= OnViewModelPropertyChanged;
        if (e.NewValue is PullRequestCardViewModel newVm)
            newVm.PropertyChanged += OnViewModelPropertyChanged;
    }

    private void OnViewModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(PullRequestCardViewModel.IsExpanded) && sender is PullRequestCardViewModel vm)
        {
            if (vm.IsExpanded)
                PlayExpandAnimation();
            // Collapse is instant (visibility binding handles it)
        }
    }

    private void PlayExpandAnimation()
    {
        // Ensure visible before animating
        ExpandedContent.Visibility = Visibility.Visible;

        // Scale Y from 0.95 → 1.0 (subtle vertical unfold)
        var scaleAnim = new DoubleAnimation(0.95, 1.0, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseOut
        };
        ExpandedContentScale.BeginAnimation(ScaleTransform.ScaleYProperty, scaleAnim);

        // Slide from -6 → 0
        var slide = new DoubleAnimation(-6, 0, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseOut
        };
        ExpandedContentTranslate.BeginAnimation(TranslateTransform.YProperty, slide);

        // Fade in
        var fade = new DoubleAnimation(0, 1, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseOut
        };
        ExpandedContent.BeginAnimation(OpacityProperty, fade);
    }

    private void Row_Click(object sender, MouseButtonEventArgs e)
    {
        // Don't toggle if the click was on a Button or Hyperlink inside the card
        if (e.OriginalSource is DependencyObject dep)
        {
            var parent = dep;
            while (parent is not null)
            {
                if (parent is System.Windows.Controls.Button or System.Windows.Documents.Hyperlink)
                    return;
                // Use visual tree for Visuals, logical tree for ContentElements (e.g. Run, Span)
                parent = parent is Visual or System.Windows.Media.Media3D.Visual3D
                    ? VisualTreeHelper.GetParent(parent)
                    : LogicalTreeHelper.GetParent(parent);
            }
        }

        if (DataContext is PullRequestCardViewModel vm)
        {
            vm.ToggleExpandedCommand.Execute(null);
        }
    }
}
