namespace PRDock.App.Models;

public enum CommentSeverity
{
    Unknown,
    Critical,
    Suggestion,
    Praise
}

public sealed class ClaudeReviewComment
{
    public string Id { get; set; } = "";
    public string Author { get; set; } = "";
    public string Body { get; set; } = "";
    public string? FilePath { get; set; }
    public int? LineNumber { get; set; }
    public CommentSeverity Severity { get; set; } = CommentSeverity.Unknown;
    public DateTimeOffset CreatedAt { get; set; }
    public string HtmlUrl { get; set; } = "";

    public static CommentSeverity DetectSeverity(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
            return CommentSeverity.Unknown;

        var lower = body.ToLowerInvariant();

        if (lower.Contains("critical") || lower.Contains("vulnerability") || lower.Contains("security"))
            return CommentSeverity.Critical;

        if (lower.Contains("suggest") || lower.Contains("consider") || lower.Contains("could"))
            return CommentSeverity.Suggestion;

        if (lower.Contains("well done") || lower.Contains("excellent") || lower.Contains("good"))
            return CommentSeverity.Praise;

        return CommentSeverity.Unknown;
    }
}
