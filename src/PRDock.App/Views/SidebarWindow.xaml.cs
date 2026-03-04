using System.Windows;
using System.Windows.Input;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class SidebarWindow : Window
{
    public SidebarWindow(MainViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();
        Loaded += SidebarWindow_Loaded;
    }

    private void SidebarWindow_Loaded(object sender, RoutedEventArgs e)
    {
        Left = SystemParameters.WorkArea.Right - Width;
        Top = SystemParameters.WorkArea.Top;
        Height = SystemParameters.WorkArea.Height;
    }

    protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e)
    {
        base.OnMouseLeftButtonDown(e);
        DragMove();
    }
}
