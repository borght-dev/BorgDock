using System.Windows;
using System.Windows.Input;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class SetupWizardWindow : Window
{
    public SetupWizardWindow(SetupWizardViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();
        Loaded += async (_, _) => await viewModel.CheckAuthCommand.ExecuteAsync(null);
        MouseLeftButtonDown += (_, e) => { if (e.ChangedButton == MouseButton.Left) DragMove(); };
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
