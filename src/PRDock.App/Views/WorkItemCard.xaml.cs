using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using PRDock.App.Models;
using PRDock.App.ViewModels;
using WpfUserControl = System.Windows.Controls.UserControl;
using MenuItem = System.Windows.Controls.MenuItem;

namespace PRDock.App.Views;

public partial class WorkItemCard : WpfUserControl
{
    public WorkItemCard()
    {
        InitializeComponent();
    }

    private void Row_Click(object sender, MouseButtonEventArgs e)
    {
        if (DataContext is WorkItemCardViewModel card)
        {
            var parent = this.FindAncestorDataContext<WorkItemsViewModel>();
            parent?.OpenWorkItemDetailCommand.Execute(card);
        }
    }

    private void ToggleTracked_Click(object sender, RoutedEventArgs e)
    {
        e.Handled = true;
        if (DataContext is WorkItemCardViewModel card)
        {
            var parent = this.FindAncestorDataContext<WorkItemsViewModel>();
            parent?.ToggleTrackedCommand.Execute(card);
        }
    }

    private void ToggleWorkingOn_Click(object sender, RoutedEventArgs e)
    {
        e.Handled = true;
        if (DataContext is WorkItemCardViewModel card)
        {
            var parent = this.FindAncestorDataContext<WorkItemsViewModel>();
            parent?.ToggleWorkingOnCommand.Execute(card);
        }
    }

    private void WorkingOnBtn_MouseEnter(object sender, System.Windows.Input.MouseEventArgs e)
    {
        var parent = this.FindAncestorDataContext<WorkItemsViewModel>();
        var card = DataContext as WorkItemCardViewModel;

        if (card?.IsWorkingOn == true)
        {
            WorkingOnBtn.ToolTip = "Stop working on this item";
        }
        else if (parent?.ActiveWorktree is { } wt)
        {
            WorkingOnBtn.ToolTip = $"Working on \u2192 {wt.BranchName}";
        }
        else
        {
            WorkingOnBtn.ToolTip = "Mark as working on (right-click to pick worktree first)";
        }
    }

    private void ContextTrack_Click(object sender, RoutedEventArgs e)
    {
        if (DataContext is WorkItemCardViewModel card)
        {
            var parent = this.FindAncestorDataContext<WorkItemsViewModel>();
            parent?.ToggleTrackedCommand.Execute(card);
        }
    }

    private void ContextWorkingOn_Click(object sender, RoutedEventArgs e)
    {
        if (DataContext is WorkItemCardViewModel card)
        {
            var parent = this.FindAncestorDataContext<WorkItemsViewModel>();
            parent?.ToggleWorkingOnCommand.Execute(card);
        }
    }

    private void CardContextMenu_Opened(object sender, RoutedEventArgs e)
    {
        WorktreeSubmenu.Items.Clear();

        var parent = this.FindAncestorDataContext<WorkItemsViewModel>();
        if (parent is null || parent.AvailableWorktrees.Count == 0)
        {
            var empty = new MenuItem
            {
                Header = new System.Windows.Controls.TextBlock
                {
                    Text = "No worktrees found",
                    FontSize = 11,
                    Foreground = (System.Windows.Media.Brush)FindResource("TextGhostBrush")
                },
                IsEnabled = false
            };
            WorktreeSubmenu.Items.Add(empty);
            return;
        }

        var card = DataContext as WorkItemCardViewModel;

        foreach (var wt in parent.AvailableWorktrees)
        {
            var stack = new System.Windows.Controls.StackPanel();

            var branchText = new System.Windows.Controls.TextBlock
            {
                Text = wt.BranchName,
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Foreground = (System.Windows.Media.Brush)FindResource("TextPrimaryBrush"),
            };
            stack.Children.Add(branchText);

            var pathText = new System.Windows.Controls.TextBlock
            {
                Text = wt.Path,
                FontSize = 10,
                FontFamily = (System.Windows.Media.FontFamily)FindResource("CodeFontFamily"),
                Foreground = (System.Windows.Media.Brush)FindResource("TextGhostBrush"),
                TextTrimming = TextTrimming.CharacterEllipsis,
                MaxWidth = 320,
                Margin = new Thickness(0, 1, 0, 0),
            };
            stack.Children.Add(pathText);

            var item = new MenuItem
            {
                Header = stack,
                Tag = wt,
                IsChecked = card?.WorktreePath == wt.Path,
            };
            item.Click += WorktreeMenuItem_Click;
            WorktreeSubmenu.Items.Add(item);
        }
    }

    private async void WorktreeMenuItem_Click(object sender, RoutedEventArgs e)
    {
        if (sender is MenuItem mi && mi.Tag is WorktreeInfo wt && DataContext is WorkItemCardViewModel card)
        {
            var parent = this.FindAncestorDataContext<WorkItemsViewModel>();
            if (parent is not null)
                await parent.AssignWorktreeToItemAsync(card, wt);
        }
    }
}

internal static class VisualTreeExtensions
{
    /// <summary>
    /// Walks the visual tree (not logical tree) to find an ancestor with a matching DataContext.
    /// This works reliably inside DataTemplates where logical Parent can be null.
    /// </summary>
    public static T? FindAncestorDataContext<T>(this DependencyObject element) where T : class
    {
        var current = VisualTreeHelper.GetParent(element);
        while (current is not null)
        {
            if (current is FrameworkElement fe && fe.DataContext is T match)
                return match;
            current = VisualTreeHelper.GetParent(current);
        }
        return null;
    }

    // Keep old method for backward compatibility
    public static T? FindParentDataContext<T>(this FrameworkElement element) where T : class
    {
        return FindAncestorDataContext<T>(element);
    }
}
