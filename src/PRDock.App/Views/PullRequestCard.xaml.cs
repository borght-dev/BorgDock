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

    private void CardBorder_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (DataContext is not PullRequestCardViewModel card)
            return;

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

        card.IsDetailExpanded = !card.IsDetailExpanded;
        if (card.IsDetailExpanded)
            card.DetailExpandRequested?.Invoke(card);
    }

    private void Hyperlink_RequestNavigate(object sender, System.Windows.Navigation.RequestNavigateEventArgs e)
    {
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = e.Uri.AbsoluteUri,
            UseShellExecute = true
        });
        e.Handled = true;
    }
}
