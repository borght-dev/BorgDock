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
}
