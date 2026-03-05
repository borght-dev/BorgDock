using System.Windows;
using System.Windows.Input;
using PRDock.App.ViewModels;
using WpfKeyEventArgs = System.Windows.Input.KeyEventArgs;

namespace PRDock.App.Views;

public partial class PRDetailWindow : Window
{
    public PRDetailWindow(PRDetailViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();
    }

    private PRDetailViewModel ViewModel => (PRDetailViewModel)DataContext;

    protected override void OnKeyDown(WpfKeyEventArgs e)
    {
        base.OnKeyDown(e);

        if (e.Key == Key.Escape)
        {
            e.Handled = true;
            Close();
            return;
        }

        // Ctrl+1-5 to switch tabs
        if (Keyboard.Modifiers == ModifierKeys.Control)
        {
            var tabName = e.Key switch
            {
                Key.D1 => "Description",
                Key.D2 => "Commits",
                Key.D3 => "Files",
                Key.D4 => "Checks",
                Key.D5 => "Comments",
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
