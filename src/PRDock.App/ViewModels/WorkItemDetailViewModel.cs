using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Infrastructure;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.App.ViewModels;

public partial class WorkItemDetailViewModel : ObservableObject
{
    private readonly IAzureDevOpsService _adoService;
    private readonly ISettingsService _settingsService;
    private int _workItemId;
    private string _workItemType = "";

    public WorkItemDetailViewModel(
        IAzureDevOpsService adoService,
        ISettingsService settingsService)
    {
        _adoService = adoService;
        _settingsService = settingsService;
    }

    [ObservableProperty]
    private int _id;

    [ObservableProperty]
    private string _title = "";

    [ObservableProperty]
    private string _state = "";

    [ObservableProperty]
    private string _assignedTo = "";

    [ObservableProperty]
    private string _description = "";

    [ObservableProperty]
    private int? _priority;

    [ObservableProperty]
    private string _tags = "";

    [ObservableProperty]
    private string _areaPath = "";

    [ObservableProperty]
    private string _iterationPath = "";

    [ObservableProperty]
    private string _type = "";

    [ObservableProperty]
    private string _htmlUrl = "";

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private bool _isSaving;

    [ObservableProperty]
    private string _statusText = "";

    [ObservableProperty]
    private bool _isNewItem;

    [ObservableProperty]
    private string _newItemType = "User Story";

    public ObservableCollection<WorkItemAttachmentViewModel> Attachments { get; } = [];
    public ObservableCollection<DynamicFieldItem> RichTextFields { get; } = [];
    public ObservableCollection<DynamicFieldItem> StandardFields { get; } = [];
    public ObservableCollection<DynamicFieldItem> CustomFields { get; } = [];
    public ObservableCollection<string> AvailableStates { get; } = [];

    public static IReadOnlyList<string> WorkItemTypeOptions { get; } =
        ["User Story", "Bug", "Task", "Feature", "Epic"];

    [RelayCommand]
    private async Task LoadAsync(int workItemId)
    {
        _workItemId = workItemId;
        IsLoading = true;
        IsNewItem = false;

        try
        {
            var wi = await _adoService.GetWorkItemAsync(workItemId);
            Id = wi.Id;
            Title = wi.Title;
            State = wi.State;
            AssignedTo = wi.AssignedTo;
            Description = wi.Description;
            Priority = wi.Priority;
            Tags = wi.Tags;
            AreaPath = wi.AreaPath;
            IterationPath = wi.IterationPath;
            Type = wi.WorkItemType;
            HtmlUrl = wi.HtmlUrl;
            _workItemType = wi.WorkItemType;

            Attachments.Clear();
            foreach (var rel in wi.Relations.Where(r => r.IsAttachment))
            {
                Attachments.Add(new WorkItemAttachmentViewModel
                {
                    Name = rel.Name ?? "attachment",
                    Size = rel.ResourceSize ?? 0,
                    Url = rel.Url
                });
            }

            // Fetch valid states for this work item type
            AvailableStates.Clear();
            try
            {
                var states = await _adoService.GetWorkItemTypeStatesAsync(wi.WorkItemType);
                foreach (var s in states)
                    AvailableStates.Add(s);
            }
            catch (Exception stateEx)
            {
                Serilog.Log.Warning(stateEx, "Failed to fetch states for {Type}", wi.WorkItemType);
            }

            // Populate dynamic fields from all remaining API fields
            RichTextFields.Clear();
            StandardFields.Clear();
            CustomFields.Clear();
            var classified = WorkItemFieldClassifier.Classify(wi.Fields);
            foreach (var f in classified)
            {
                var col = f.Section switch
                {
                    FieldSection.RichText => RichTextFields,
                    FieldSection.Custom => CustomFields,
                    _ => StandardFields,
                };
                col.Add(f);
            }

            StatusText = "";
        }
        catch (Exception ex)
        {
            StatusText = $"Failed to load: {ex.Message}";
            Serilog.Log.Warning(ex, "Failed to load work item {Id}", workItemId);
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    private async Task SaveAsync()
    {
        IsSaving = true;
        try
        {
            var patches = new List<JsonPatchOperation>();

            if (IsNewItem)
            {
                patches.Add(new JsonPatchOperation { Op = "add", Path = "/fields/System.Title", Value = Title });
                if (!string.IsNullOrEmpty(Description))
                    patches.Add(new JsonPatchOperation { Op = "add", Path = "/fields/System.Description", Value = Description });
                if (Priority.HasValue)
                    patches.Add(new JsonPatchOperation { Op = "add", Path = "/fields/Microsoft.VSTS.Common.Priority", Value = Priority.Value });
                if (!string.IsNullOrEmpty(Tags))
                    patches.Add(new JsonPatchOperation { Op = "add", Path = "/fields/System.Tags", Value = Tags });
                if (!string.IsNullOrEmpty(AssignedTo))
                    patches.Add(new JsonPatchOperation { Op = "add", Path = "/fields/System.AssignedTo", Value = AssignedTo });

                var created = await _adoService.CreateWorkItemAsync(NewItemType, patches);
                Id = created.Id;
                _workItemId = created.Id;
                _workItemType = created.WorkItemType;
                HtmlUrl = created.HtmlUrl;
                IsNewItem = false;
                StatusText = $"Created #{created.Id}";
                WorkItemSaved?.Invoke();
            }
            else
            {
                patches.Add(new JsonPatchOperation { Op = "replace", Path = "/fields/System.Title", Value = Title });
                patches.Add(new JsonPatchOperation { Op = "replace", Path = "/fields/System.State", Value = State });
                patches.Add(new JsonPatchOperation { Op = "replace", Path = "/fields/System.Description", Value = Description ?? "" });
                patches.Add(new JsonPatchOperation { Op = "replace", Path = "/fields/System.Tags", Value = Tags ?? "" });
                if (!string.IsNullOrEmpty(AssignedTo))
                    patches.Add(new JsonPatchOperation { Op = "replace", Path = "/fields/System.AssignedTo", Value = AssignedTo });
                if (Priority.HasValue)
                    patches.Add(new JsonPatchOperation { Op = "replace", Path = "/fields/Microsoft.VSTS.Common.Priority", Value = Priority.Value });

                await _adoService.UpdateWorkItemAsync(_workItemId, patches);
                StatusText = "Saved";
                WorkItemSaved?.Invoke();
            }
        }
        catch (Exception ex)
        {
            StatusText = $"Save failed: {ex.Message}";
            Serilog.Log.Warning(ex, "Failed to save work item");
        }
        finally
        {
            IsSaving = false;
        }
    }

    [RelayCommand]
    private async Task DeleteAsync()
    {
        if (_workItemId == 0 || IsNewItem) return;

        IsSaving = true;
        try
        {
            await _adoService.DeleteWorkItemAsync(_workItemId);
            StatusText = $"Deleted #{_workItemId}";
            WorkItemDeleted?.Invoke();
        }
        catch (Exception ex)
        {
            StatusText = $"Delete failed: {ex.Message}";
            Serilog.Log.Warning(ex, "Failed to delete work item {Id}", _workItemId);
        }
        finally
        {
            IsSaving = false;
        }
    }

    [RelayCommand]
    private void OpenInBrowser()
    {
        if (string.IsNullOrWhiteSpace(HtmlUrl)) return;
        try
        {
            Process.Start(new ProcessStartInfo(HtmlUrl) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to open URL");
        }
    }

    [RelayCommand]
    private async Task DownloadAttachmentAsync(WorkItemAttachmentViewModel attachment)
    {
        DownloadAttachmentRequested?.Invoke(attachment);
    }

    public void PrepareNewItem()
    {
        IsNewItem = true;
        Id = 0;
        _workItemId = 0;
        Title = "";
        State = "New";
        AssignedTo = "";
        Description = "";
        Priority = 2;
        Tags = "";
        Type = "User Story";
        HtmlUrl = "";
        Attachments.Clear();
        RichTextFields.Clear();
        StandardFields.Clear();
        CustomFields.Clear();
        StatusText = "";
    }

    public event Action? WorkItemSaved;
    public event Action? WorkItemDeleted;
    public event Action<WorkItemAttachmentViewModel>? DownloadAttachmentRequested;
}

public partial class WorkItemAttachmentViewModel : ObservableObject
{
    [ObservableProperty]
    private string _name = "";

    [ObservableProperty]
    private long _size;

    [ObservableProperty]
    private string _url = "";

    public string SizeDisplay => Size switch
    {
        < 1024 => $"{Size} B",
        < 1024 * 1024 => $"{Size / 1024.0:F1} KB",
        _ => $"{Size / (1024.0 * 1024):F1} MB"
    };
}
