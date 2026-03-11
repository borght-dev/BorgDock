using System.Text.Json;
using System.Text.Json.Serialization;

namespace PRDock.App.Models;

public sealed class WorkItem
{
    public int Id { get; set; }
    public int Rev { get; set; }
    public string Url { get; set; } = "";
    public Dictionary<string, object?> Fields { get; set; } = new();

    public List<WorkItemRelation> Relations { get; set; } = [];

    // Convenience accessors for common fields
    public string Title => GetField<string>("System.Title") ?? "";
    public string State => GetField<string>("System.State") ?? "";
    public string WorkItemType => GetField<string>("System.WorkItemType") ?? "";
    public string AssignedTo => GetAssignedToDisplayName();
    public int? Priority => GetField<int?>("Microsoft.VSTS.Common.Priority");
    public string Description => GetField<string>("System.Description") ?? "";
    public string Tags => GetField<string>("System.Tags") ?? "";
    public DateTime? CreatedDate => GetField<DateTime?>("System.CreatedDate");
    public DateTime? ChangedDate => GetField<DateTime?>("System.ChangedDate");
    public string AreaPath => GetField<string>("System.AreaPath") ?? "";
    public string IterationPath => GetField<string>("System.IterationPath") ?? "";

    public string HtmlUrl { get; set; } = "";

    private T? GetField<T>(string fieldName)
    {
        if (!Fields.TryGetValue(fieldName, out var value) || value is null)
            return default;

        if (value is JsonElement element)
        {
            try
            {
                return element.Deserialize<T>();
            }
            catch
            {
                return default;
            }
        }

        if (value is T typed)
            return typed;

        try
        {
            return (T)Convert.ChangeType(value, typeof(T));
        }
        catch
        {
            return default;
        }
    }

    private string GetAssignedToDisplayName()
    {
        if (!Fields.TryGetValue("System.AssignedTo", out var value) || value is null)
            return "";

        if (value is JsonElement element)
        {
            if (element.ValueKind == JsonValueKind.Object && element.TryGetProperty("displayName", out var dn))
                return dn.GetString() ?? "";
            if (element.ValueKind == JsonValueKind.String)
                return element.GetString() ?? "";
        }

        return value.ToString() ?? "";
    }
}

public sealed class WorkItemRelation
{
    public string Rel { get; set; } = "";
    public string Url { get; set; } = "";
    public Dictionary<string, object?> Attributes { get; set; } = new();

    public bool IsAttachment => Rel == "AttachedFile";
    public string? Name => Attributes.TryGetValue("name", out var n) ? n?.ToString() : null;
    public long? ResourceSize => Attributes.TryGetValue("resourceSize", out var s) && s is JsonElement je ? je.GetInt64() : null;
}

public sealed class WorkItemAttachment
{
    public Guid Id { get; set; }
    public string FileName { get; set; } = "";
    public long Size { get; set; }
    public string Url { get; set; } = "";
}
