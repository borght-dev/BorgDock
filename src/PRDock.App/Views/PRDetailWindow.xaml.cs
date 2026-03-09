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

        // Ctrl+1-3 to switch tabs
        if (Keyboard.Modifiers == ModifierKeys.Control)
        {
            var tabName = e.Key switch
            {
                Key.D1 => "Overview",
                Key.D2 => "Checks",
                Key.D3 => "Reviews",
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
