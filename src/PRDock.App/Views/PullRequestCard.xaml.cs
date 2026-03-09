using System.Windows;
using System.Windows.Input;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class PullRequestCard : System.Windows.Controls.UserControl
{
    public PullRequestCard()
    {
        InitializeComponent();
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
                parent = System.Windows.Media.VisualTreeHelper.GetParent(parent);
            }
        }

        if (DataContext is PullRequestCardViewModel vm)
        {
            vm.ToggleExpandedCommand.Execute(null);
        }
    }
}
