namespace PRDock.App.Models;

public sealed class WorktreeInfo
{
    public string Path { get; set; } = "";
    public string BranchName { get; set; } = "";
    public bool IsMainWorktree { get; set; }
}
