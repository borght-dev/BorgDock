namespace PRDock.App.Models;

public sealed class PullRequestWithChecks
{
    public PullRequest PullRequest { get; set; } = new();
    public IReadOnlyList<CheckRun> Checks { get; set; } = [];

    public string OverallStatus => Checks.Any(c => c.IsFailed) ? "red"
        : Checks.Any(c => c.IsPending) ? "yellow"
        : Checks.Where(c => !c.IsSkipped).All(c => c.IsSuccess) && Checks.Any(c => !c.IsSkipped) ? "green"
        : "gray";

    public IReadOnlyList<string> FailedCheckNames => Checks.Where(c => c.IsFailed).Select(c => c.Name).ToList();
    public IReadOnlyList<string> PendingCheckNames => Checks.Where(c => c.IsPending).Select(c => c.Name).ToList();
    public int PassedCount => Checks.Count(c => c.IsSuccess);
    public int SkippedCount => Checks.Count(c => c.IsSkipped);
}
