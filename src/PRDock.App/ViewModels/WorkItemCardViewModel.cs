using CommunityToolkit.Mvvm.ComponentModel;

namespace PRDock.App.ViewModels;

public partial class WorkItemCardViewModel : ObservableObject
{
    [ObservableProperty]
    private int _id;

    [ObservableProperty]
    private string _title = "";

    [ObservableProperty]
    private string _state = "";

    [ObservableProperty]
    private string _workItemType = "";

    [ObservableProperty]
    private string _assignedTo = "";

    [ObservableProperty]
    private int? _priority;

    [ObservableProperty]
    private string _tags = "";

    [ObservableProperty]
    private string _age = "";

    [ObservableProperty]
    private string _htmlUrl = "";

    [ObservableProperty]
    private bool _isSelected;

    [ObservableProperty]
    private bool _isTracked;

    [ObservableProperty]
    private bool _isWorkingOn;

    [ObservableProperty]
    private string _worktreePath = "";

    public int TrackingSortWeight => IsWorkingOn ? 0 : IsTracked ? 1 : 2;

    public static string FormatAge(DateTime? date)
    {
        if (date is null) return "";
        var span = DateTime.UtcNow - date.Value.ToUniversalTime();
        if (span.TotalMinutes < 60) return $"{(int)span.TotalMinutes}m";
        if (span.TotalHours < 24) return $"{(int)span.TotalHours}h";
        if (span.TotalDays < 30) return $"{(int)span.TotalDays}d";
        return $"{(int)(span.TotalDays / 30)}mo";
    }

    public static WorkItemCardViewModel FromWorkItem(
        PRDock.App.Models.WorkItem wi,
        bool isTracked = false,
        bool isWorkingOn = false,
        string worktreePath = "")
    {
        return new WorkItemCardViewModel
        {
            Id = wi.Id,
            Title = wi.Title,
            State = wi.State,
            WorkItemType = wi.WorkItemType,
            AssignedTo = wi.AssignedTo,
            Priority = wi.Priority,
            Tags = wi.Tags,
            Age = FormatAge(wi.ChangedDate),
            HtmlUrl = wi.HtmlUrl,
            IsTracked = isTracked,
            IsWorkingOn = isWorkingOn,
            WorktreePath = worktreePath,
        };
    }
}
