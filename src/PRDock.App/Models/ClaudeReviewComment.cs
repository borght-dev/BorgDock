using System.Text.RegularExpressions;

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

    // Regex for section headers like "## Issues", "**Issues**", "### Positives", "**Positive notes**", etc.
    // Longer alternatives must come before shorter ones (e.g. "positive notes?" before "positives?")
    private static readonly Regex SectionHeaderRegex = new(
        @"^(?:#{1,4}\s+|\*{2})(?<name>positive notes?|positives?|issues?|problems?|concerns?|praise|strengths?|what.?s good|good)(?:\*{2})?",
        RegexOptions.IgnoreCase | RegexOptions.Multiline | RegexOptions.Compiled);

    // Regex for numbered list items: "1. ...", "2. ...", etc.
    private static readonly Regex NumberedItemRegex = new(
        @"^(\d+)\.\s+",
        RegexOptions.Multiline | RegexOptions.Compiled);

    // Regex for bullet list items: "• ...", "- ...", "* ..."
    private static readonly Regex BulletItemRegex = new(
        @"^[\u2022\-\*]\s+",
        RegexOptions.Multiline | RegexOptions.Compiled);

    /// <summary>
    /// Splits a structured review comment (containing Issues/Positives sections) into individual items.
    /// Returns a single-element list with the original comment if no structure is detected.
    /// </summary>
    public static List<ClaudeReviewComment> SplitStructuredReview(ClaudeReviewComment comment)
    {
        if (string.IsNullOrWhiteSpace(comment.Body))
            return [comment];

        var sections = ParseSections(comment.Body);
        if (sections.Count == 0)
            return [comment];

        var results = new List<ClaudeReviewComment>();
        foreach (var (severity, items) in sections)
        {
            foreach (var item in items)
            {
                results.Add(new ClaudeReviewComment
                {
                    Id = $"{comment.Id}_{results.Count}",
                    Author = comment.Author,
                    Body = item,
                    FilePath = comment.FilePath,
                    LineNumber = comment.LineNumber,
                    Severity = severity,
                    CreatedAt = comment.CreatedAt,
                    HtmlUrl = comment.HtmlUrl
                });
            }
        }

        return results.Count > 0 ? results : [comment];
    }

    private static List<(CommentSeverity Severity, List<string> Items)> ParseSections(string body)
    {
        var matches = SectionHeaderRegex.Matches(body);
        if (matches.Count == 0)
            return [];

        var sections = new List<(CommentSeverity Severity, List<string> Items)>();

        for (var i = 0; i < matches.Count; i++)
        {
            var match = matches[i];
            var sectionName = match.Groups["name"].Value.ToLowerInvariant();
            var severity = ClassifySectionName(sectionName);

            // Extract text between this header and the next (or end of body)
            var start = match.Index + match.Length;
            var end = i + 1 < matches.Count ? matches[i + 1].Index : body.Length;
            var sectionBody = body[start..end].Trim();

            var items = ExtractItems(sectionBody);
            if (items.Count > 0)
                sections.Add((severity, items));
        }

        return sections;
    }

    private static CommentSeverity ClassifySectionName(string name)
    {
        if (name.StartsWith("positive") || name.StartsWith("praise") ||
            name.StartsWith("strength") || name.StartsWith("good") ||
            name.StartsWith("what"))
            return CommentSeverity.Praise;

        if (name.StartsWith("issue") || name.StartsWith("problem") || name.StartsWith("concern"))
            return CommentSeverity.Suggestion;

        return CommentSeverity.Unknown;
    }

    private static List<string> ExtractItems(string sectionBody)
    {
        var items = new List<string>();

        // Try numbered items first (e.g. "1. Magic number...")
        if (NumberedItemRegex.IsMatch(sectionBody))
        {
            var splits = NumberedItemRegex.Split(sectionBody);
            // splits alternates: [preamble, "1", item1text, "2", item2text, ...]
            for (var i = 2; i < splits.Length; i += 2)
            {
                var text = splits[i].Trim();
                if (text.Length > 0)
                    items.Add(text);
            }
        }
        // Try bullet items
        else if (BulletItemRegex.IsMatch(sectionBody))
        {
            var splits = BulletItemRegex.Split(sectionBody);
            foreach (var part in splits)
            {
                var text = part.Trim();
                if (text.Length > 0)
                    items.Add(text);
            }
        }

        // If no list structure found but there's body text, treat the whole section as one item
        if (items.Count == 0 && sectionBody.Length > 0)
            items.Add(sectionBody);

        return items;
    }

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
