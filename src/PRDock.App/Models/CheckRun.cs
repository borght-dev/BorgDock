namespace PRDock.App.Models;

public sealed class CheckRun
{
    public long Id { get; set; }
    public string Name { get; set; } = "";
    public string Status { get; set; } = "";
    public string? Conclusion { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string HtmlUrl { get; set; } = "";
    public long CheckSuiteId { get; set; }

    public bool IsCompleted => Status == "completed";
    public bool IsSuccess => IsCompleted && Conclusion == "success";
    public bool IsFailed => IsCompleted && (Conclusion == "failure" || Conclusion == "timed_out");
    public bool IsPending => !IsCompleted;
}
