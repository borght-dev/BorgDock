using FluentAssertions;
using PRDock.App.Models;

namespace PRDock.Tests.Models;

public class ClaudeReviewCommentTests
{
    [Fact]
    public void DefaultValues_AreCorrect()
    {
        var comment = new ClaudeReviewComment();
        comment.Id.Should().BeEmpty();
        comment.Author.Should().BeEmpty();
        comment.Body.Should().BeEmpty();
        comment.FilePath.Should().BeNull();
        comment.LineNumber.Should().BeNull();
        comment.Severity.Should().Be(CommentSeverity.Unknown);
        comment.CreatedAt.Should().Be(default);
        comment.HtmlUrl.Should().BeEmpty();
    }

    [Theory]
    [InlineData("This is a critical issue", CommentSeverity.Critical)]
    [InlineData("Found a security vulnerability", CommentSeverity.Critical)]
    [InlineData("This has a vulnerability", CommentSeverity.Critical)]
    [InlineData("CRITICAL: fix this now", CommentSeverity.Critical)]
    [InlineData("Security concern here", CommentSeverity.Critical)]
    public void DetectSeverity_CriticalKeywords_ReturnsCritical(string body, CommentSeverity expected)
    {
        ClaudeReviewComment.DetectSeverity(body).Should().Be(expected);
    }

    [Theory]
    [InlineData("I suggest using a different approach", CommentSeverity.Suggestion)]
    [InlineData("Consider refactoring this method", CommentSeverity.Suggestion)]
    [InlineData("You could simplify this logic", CommentSeverity.Suggestion)]
    public void DetectSeverity_SuggestionKeywords_ReturnsSuggestion(string body, CommentSeverity expected)
    {
        ClaudeReviewComment.DetectSeverity(body).Should().Be(expected);
    }

    [Theory]
    [InlineData("Well done on this implementation", CommentSeverity.Praise)]
    [InlineData("Excellent work here", CommentSeverity.Praise)]
    [InlineData("Good job on the tests", CommentSeverity.Praise)]
    public void DetectSeverity_PraiseKeywords_ReturnsPraise(string body, CommentSeverity expected)
    {
        ClaudeReviewComment.DetectSeverity(body).Should().Be(expected);
    }

    [Theory]
    [InlineData("Just a regular comment")]
    [InlineData("Updated the imports")]
    [InlineData("Fixed a typo")]
    public void DetectSeverity_NoKeywords_ReturnsUnknown(string body)
    {
        ClaudeReviewComment.DetectSeverity(body).Should().Be(CommentSeverity.Unknown);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void DetectSeverity_NullOrWhitespace_ReturnsUnknown(string? body)
    {
        ClaudeReviewComment.DetectSeverity(body!).Should().Be(CommentSeverity.Unknown);
    }

    [Fact]
    public void DetectSeverity_CriticalTakesPrecedenceOverSuggestion()
    {
        var body = "This is critical, I suggest fixing it immediately";
        ClaudeReviewComment.DetectSeverity(body).Should().Be(CommentSeverity.Critical);
    }

    [Fact]
    public void DetectSeverity_CaseInsensitive()
    {
        ClaudeReviewComment.DetectSeverity("CRITICAL issue").Should().Be(CommentSeverity.Critical);
        ClaudeReviewComment.DetectSeverity("SUGGEST a change").Should().Be(CommentSeverity.Suggestion);
        ClaudeReviewComment.DetectSeverity("EXCELLENT work").Should().Be(CommentSeverity.Praise);
    }

    [Fact]
    public void SplitStructuredReview_NoSections_ReturnsSingleComment()
    {
        var comment = new ClaudeReviewComment { Id = "1", Body = "Just a simple comment" };
        var result = ClaudeReviewComment.SplitStructuredReview(comment);
        result.Should().HaveCount(1);
        result[0].Body.Should().Be("Just a simple comment");
    }

    [Fact]
    public void SplitStructuredReview_IssuesAndPositives_SplitsCorrectly()
    {
        var body = """
            ## Code Review
            Good set of targeted fixes.

            ## Issues
            1. Magic number for cancelled status (medium)
            2. Layer violation: shared component depends on workspace (medium)
            3. cursor-pointer class remains after switching to double-click (low)

            ## Positives
            • float? fix for OperationalHours is correct
            • PrefillRulesTable tests are thorough
            • Contract test updated with new color fields
            """;
        var comment = new ClaudeReviewComment { Id = "42", Body = body, Author = "claude[bot]" };
        var result = ClaudeReviewComment.SplitStructuredReview(comment);

        var suggestions = result.Where(c => c.Severity == CommentSeverity.Suggestion).ToList();
        var praise = result.Where(c => c.Severity == CommentSeverity.Praise).ToList();

        suggestions.Should().HaveCount(3);
        praise.Should().HaveCount(3);
        result.Should().OnlyContain(c => c.Author == "claude[bot]");
        result.Should().OnlyContain(c => c.Id.StartsWith("42_"));
    }

    [Fact]
    public void SplitStructuredReview_BoldHeaders_SplitsCorrectly()
    {
        var body = """
            **Issues**
            1. First issue here
            2. Second issue here

            **Positive notes**
            - Good work on the refactor
            - Clean separation of concerns
            """;
        var comment = new ClaudeReviewComment { Id = "10", Body = body };
        var result = ClaudeReviewComment.SplitStructuredReview(comment);

        var suggestions = result.Where(c => c.Severity == CommentSeverity.Suggestion).ToList();
        var praise = result.Where(c => c.Severity == CommentSeverity.Praise).ToList();

        suggestions.Should().HaveCount(2);
        praise.Should().HaveCount(2);
    }

    [Fact]
    public void SplitStructuredReview_EmptyBody_ReturnsSingleComment()
    {
        var comment = new ClaudeReviewComment { Id = "1", Body = "" };
        var result = ClaudeReviewComment.SplitStructuredReview(comment);
        result.Should().HaveCount(1);
    }

    [Fact]
    public void SplitStructuredReview_PreservesMetadata()
    {
        var body = """
            ## Issues
            1. A problem

            ## Positives
            - A good thing
            """;
        var created = DateTimeOffset.UtcNow;
        var comment = new ClaudeReviewComment
        {
            Id = "99", Author = "bot", Body = body,
            CreatedAt = created, HtmlUrl = "https://example.com"
        };
        var result = ClaudeReviewComment.SplitStructuredReview(comment);

        result.Should().HaveCount(2);
        result.Should().OnlyContain(c => c.Author == "bot");
        result.Should().OnlyContain(c => c.CreatedAt == created);
        result.Should().OnlyContain(c => c.HtmlUrl == "https://example.com");
    }
}
