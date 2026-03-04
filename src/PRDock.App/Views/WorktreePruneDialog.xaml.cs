using System.Windows;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class WorktreePruneDialog : Window
{
    public WorktreePruneDialog(WorktreePruneViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
        Loaded += async (_, _) => await viewModel.LoadWorktreesCommand.ExecuteAsync(null);
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
