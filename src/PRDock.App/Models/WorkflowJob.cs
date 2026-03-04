namespace PRDock.App.Models;

public sealed class WorkflowJob
{
    public long Id { get; set; }
    public string Name { get; set; } = "";
    public string Status { get; set; } = "";
    public string? Conclusion { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public long RunId { get; set; }
    public string HtmlUrl { get; set; } = "";
}
