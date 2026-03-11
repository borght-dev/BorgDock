using System.Windows;
using System.Windows.Input;
using PRDock.App.ViewModels;
using WpfUserControl = System.Windows.Controls.UserControl;

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
            // Find the WorkItemsViewModel from parent DataContext
            var parent = this.FindParentDataContext<WorkItemsViewModel>();
            parent?.OpenWorkItemDetailCommand.Execute(card);
        }
    }
}

internal static class VisualTreeExtensions
{
    public static T? FindParentDataContext<T>(this FrameworkElement element) where T : class
    {
        var current = element.Parent as FrameworkElement;
        while (current is not null)
        {
            if (current.DataContext is T match)
                return match;
            current = current.Parent as FrameworkElement;
        }
        return null;
    }
}
