namespace PRDock.App.Models;

public sealed class PullRequestFileChange
{
    public string Filename { get; set; } = "";
    public string Status { get; set; } = "";
    public int Additions { get; set; }
    public int Deletions { get; set; }
    public string? Patch { get; set; }
    public string? PreviousFilename { get; set; }
}
