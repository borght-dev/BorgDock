namespace PRDock.App.Models;

public sealed class CheckSuite
{
    public long Id { get; set; }
    public string Status { get; set; } = "";
    public string? Conclusion { get; set; }
    public string HeadSha { get; set; } = "";
    public List<CheckRun> CheckRuns { get; set; } = [];
}
