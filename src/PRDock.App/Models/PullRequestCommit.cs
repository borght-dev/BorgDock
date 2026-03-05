namespace PRDock.App.Models;

public sealed class PullRequestCommit
{
    public string Sha { get; set; } = "";
    public string ShortSha => Sha.Length > 7 ? Sha[..7] : Sha;
    public string Message { get; set; } = "";
    public string FirstLineMessage => Message.Contains('\n') ? Message[..Message.IndexOf('\n')] : Message;
    public string AuthorLogin { get; set; } = "";
    public string AuthorAvatarUrl { get; set; } = "";
    public DateTimeOffset Date { get; set; }
}
