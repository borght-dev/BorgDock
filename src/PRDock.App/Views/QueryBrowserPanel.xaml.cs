using System.Windows;
using System.Windows.Input;
using PRDock.App.ViewModels;
using WpfUserControl = System.Windows.Controls.UserControl;

namespace PRDock.App.Views;

public partial class QueryBrowserPanel : WpfUserControl
{
    public QueryBrowserPanel()
    {
        InitializeComponent();
    }

    private void FavoriteQuery_Click(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement { DataContext: AdoQueryTreeNode node }
            && DataContext is WorkItemsViewModel vm)
        {
            vm.SelectQueryCommand.Execute(node);
        }
    }

    private void QueryNode_Click(object sender, MouseButtonEventArgs e)
    {
        if (sender is not FrameworkElement { DataContext: AdoQueryTreeNode node }) return;

        if (node.IsFolder)
        {
            node.IsExpanded = !node.IsExpanded;
        }
        else if (DataContext is WorkItemsViewModel vm)
        {
            vm.SelectQueryCommand.Execute(node);
        }
    }

    private void ToggleFavorite_Click(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement { DataContext: AdoQueryTreeNode node }
            && DataContext is WorkItemsViewModel vm)
        {
            vm.ToggleFavoriteCommand.Execute(node);
            e.Handled = true;
        }
    }
}
