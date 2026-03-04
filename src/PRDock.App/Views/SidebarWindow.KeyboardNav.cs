using WpfKeyEventArgs = System.Windows.Input.KeyEventArgs;
using Key = System.Windows.Input.Key;

namespace PRDock.App.Views;

public partial class SidebarWindow
{
    protected override void OnPreviewKeyDown(WpfKeyEventArgs e)
    {
        base.OnPreviewKeyDown(e);

        switch (e.Key)
        {
            case Key.Up:
                ViewModel.MoveFocusUpCommand.Execute(null);
                e.Handled = true;
                break;

            case Key.Down:
                ViewModel.MoveFocusDownCommand.Execute(null);
                e.Handled = true;
                break;

            case Key.Enter:
                ViewModel.ToggleFocusedDetailCommand.Execute(null);
                e.Handled = true;
                break;

            case Key.Escape:
                ViewModel.CollapseAllCommand.Execute(null);
                e.Handled = true;
                break;
        }
    }
}
