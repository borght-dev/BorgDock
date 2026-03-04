namespace PRDock.App.Models;

public sealed class PullRequest
{
    public int Number { get; set; }
    public string Title { get; set; } = "";
    public string HeadRef { get; set; } = "";
    public string BaseRef { get; set; } = "";
    public string AuthorLogin { get; set; } = "";
    public string AuthorAvatarUrl { get; set; } = "";
    public string State { get; set; } = "open";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool IsDraft { get; set; }
    public bool? Mergeable { get; set; }
    public string HtmlUrl { get; set; } = "";
    public string RepoOwner { get; set; } = "";
    public string RepoName { get; set; } = "";
    public ReviewStatus ReviewStatus { get; set; } = ReviewStatus.None;
    public int CommentCount { get; set; }
    public List<string> Labels { get; set; } = [];
}
