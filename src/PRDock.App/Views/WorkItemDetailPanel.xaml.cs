using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
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

    private void RichTextResize_DragDelta(object sender, DragDeltaEventArgs e)
    {
        // Find the Border sibling (the HtmlWebView container) above this Thumb
        if (sender is not Thumb thumb) return;
        var parent = VisualTreeHelper.GetParent(thumb) as StackPanel;
        if (parent is null) return;

        // The Border is the second child (index 1) in the StackPanel: Label, Border, Thumb
        for (int i = 0; i < VisualTreeHelper.GetChildrenCount(parent); i++)
        {
            if (VisualTreeHelper.GetChild(parent, i) is Border border && border.Child is HtmlWebView)
            {
                var newHeight = border.ActualHeight + e.VerticalChange;
                border.Height = Math.Max(100, newHeight);
                break;
            }
        }
    }

    public event Action? CloseRequested;
}
