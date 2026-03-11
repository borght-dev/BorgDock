using System.Windows;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class WorkItemDetailWindow : Window
{
    public WorkItemDetailWindow(WorkItemDetailViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();

        DetailPanel.CloseRequested += () => Close();
        viewModel.WorkItemDeleted += () => Close();

        viewModel.DownloadAttachmentRequested += OnDownloadAttachmentRequested;
    }

    private async void OnDownloadAttachmentRequested(WorkItemAttachmentViewModel attachment)
    {
        var dialog = new Microsoft.Win32.SaveFileDialog
        {
            FileName = attachment.Name,
            Title = "Save Attachment"
        };

        if (dialog.ShowDialog() != true) return;

        var app = (App)System.Windows.Application.Current;
        var sp = app.ServiceProvider;
        var adoService = sp?.GetService(typeof(Services.IAzureDevOpsService)) as Services.IAzureDevOpsService;
        if (adoService is null) return;

        try
        {
            // Extract attachment ID from URL
            var url = attachment.Url;
            var idStr = url.Split('/').LastOrDefault(s => Guid.TryParse(s, out _));
            if (idStr is null || !Guid.TryParse(idStr, out var attachmentId)) return;

            using var stream = await adoService.DownloadAttachmentAsync(attachmentId, attachment.Name);
            using var fileStream = System.IO.File.Create(dialog.FileName);
            await stream.CopyToAsync(fileStream);

            if (DataContext is WorkItemDetailViewModel vm)
                vm.StatusText = $"Saved {attachment.Name}";
        }
        catch (Exception ex)
        {
            if (DataContext is WorkItemDetailViewModel vm)
                vm.StatusText = $"Download failed: {ex.Message}";
        }
    }

    protected override void OnMouseLeftButtonDown(System.Windows.Input.MouseButtonEventArgs e)
    {
        base.OnMouseLeftButtonDown(e);
        DragMove();
    }
}
