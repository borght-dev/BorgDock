namespace PRDock.App.Models;

public sealed class AdoQuery
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Path { get; set; } = "";
    public bool IsFolder { get; set; }
    public bool HasChildren { get; set; }
    public List<AdoQuery> Children { get; set; } = [];
}

public sealed class AdoQueryResult
{
    public string QueryType { get; set; } = "";
    public List<AdoQueryWorkItemRef> WorkItems { get; set; } = [];
}

public sealed class AdoQueryWorkItemRef
{
    public int Id { get; set; }
    public string Url { get; set; } = "";
}
