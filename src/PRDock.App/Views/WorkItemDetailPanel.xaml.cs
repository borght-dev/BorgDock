using System.Windows;
using System.Windows.Input;
using PRDock.App.ViewModels;
using WpfUserControl = System.Windows.Controls.UserControl;

namespace PRDock.App.Views;

public partial class WorkItemDetailPanel : WpfUserControl
{
    public WorkItemDetailPanel()
    {
        InitializeComponent();
    }

    private void Close_Click(object sender, RoutedEventArgs e)
    {
        if (DataContext is WorkItemDetailViewModel vm)
        {
            // Signal parent to close
            CloseRequested?.Invoke();
        }
    }

    private void Attachment_Click(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement { DataContext: WorkItemAttachmentViewModel attachment }
            && DataContext is WorkItemDetailViewModel vm)
        {
            vm.DownloadAttachmentCommand.Execute(attachment);
        }
    }

    public event Action? CloseRequested;
}
