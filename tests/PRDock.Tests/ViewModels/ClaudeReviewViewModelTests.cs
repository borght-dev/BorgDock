using FluentAssertions;
using PRDock.App.Models;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class ClaudeReviewViewModelTests
{
    private readonly ClaudeReviewViewModel _vm = new();

    [Fact]
    public void LoadComments_EmptyList_SetsNoCommentsState()
    {
        _vm.LoadComments([]);

        _vm.ReviewComments.Should().BeEmpty();
        _vm.HasComments.Should().BeFalse();
        _vm.SummaryText.Should().Be("No review comments");
    }

    [Fact]
    public void LoadComments_GroupsBySeverity()
    {
        var comments = new List<ClaudeReviewComment>
        {
            new() { Id = "1", Body = "Critical issue", Severity = CommentSeverity.Critical },
            new() { Id = "2", Body = "A suggestion", Severity = CommentSeverity.Suggestion },
            new() { Id = "3", Body = "Another suggestion", Severity = CommentSeverity.Suggestion },
            new() { Id = "4", Body = "Well done", Severity = CommentSeverity.Praise },
            new() { Id = "5", Body = "Just a note", Severity = CommentSeverity.Unknown },
        };

        _vm.LoadComments(comments);

        _vm.ReviewComments.Should().HaveCount(5);
        _vm.CriticalComments.Should().HaveCount(1);
        _vm.SuggestionComments.Should().HaveCount(2);
        _vm.PraiseComments.Should().HaveCount(1);
        _vm.OtherComments.Should().HaveCount(1);
        _vm.HasComments.Should().BeTrue();
    }

    [Fact]
    public void LoadComments_BuildsSummaryText()
    {
        var comments = new List<ClaudeReviewComment>
        {
            new() { Id = "1", Severity = CommentSeverity.Critical },
            new() { Id = "2", Severity = CommentSeverity.Critical },
            new() { Id = "3", Severity = CommentSeverity.Suggestion },
            new() { Id = "4", Severity = CommentSeverity.Suggestion },
            new() { Id = "5", Severity = CommentSeverity.Suggestion },
        };

        _vm.LoadComments(comments);

        _vm.SummaryText.Should().Contain("2 critical");
        _vm.SummaryText.Should().Contain("3 suggestions");
    }

    [Fact]
    public void LoadComments_SingleSuggestion_NoPlural()
    {
        var comments = new List<ClaudeReviewComment>
        {
            new() { Id = "1", Severity = CommentSeverity.Suggestion },
        };

        _vm.LoadComments(comments);

        _vm.SummaryText.Should().Contain("1 suggestion");
        _vm.SummaryText.Should().NotContain("suggestions");
    }

    [Fact]
    public void LoadComments_ClearsOldComments()
    {
        _vm.LoadComments([new ClaudeReviewComment { Id = "1", Severity = CommentSeverity.Critical }]);
        _vm.CriticalComments.Should().HaveCount(1);

        _vm.LoadComments([]);
        _vm.CriticalComments.Should().BeEmpty();
        _vm.ReviewComments.Should().BeEmpty();
        _vm.HasComments.Should().BeFalse();
    }

    [Fact]
    public void LoadComments_PraiseOnly_ShowsPraiseInSummary()
    {
        var comments = new List<ClaudeReviewComment>
        {
            new() { Id = "1", Severity = CommentSeverity.Praise },
            new() { Id = "2", Severity = CommentSeverity.Praise },
        };

        _vm.LoadComments(comments);

        _vm.SummaryText.Should().Contain("2 praise");
        _vm.SummaryText.Should().NotContain("critical");
        _vm.SummaryText.Should().NotContain("suggestion");
    }

    [Fact]
    public void LoadComments_UnknownSeverity_ShowsOtherInSummary()
    {
        var comments = new List<ClaudeReviewComment>
        {
            new() { Id = "1", Severity = CommentSeverity.Unknown },
        };

        _vm.LoadComments(comments);

        _vm.SummaryText.Should().Contain("1 other");
    }

    [Fact]
    public void OpenFileCommand_Exists()
    {
        _vm.OpenFileCommand.Should().NotBeNull();
    }

    [Fact]
    public void OpenInBrowserCommand_Exists()
    {
        _vm.OpenInBrowserCommand.Should().NotBeNull();
    }

    [Fact]
    public void OpenFileCommand_NullComment_DoesNotThrow()
    {
        var act = () => _vm.OpenFileCommand.Execute(null);
        act.Should().NotThrow();
    }

    [Fact]
    public void OpenInBrowserCommand_NullComment_DoesNotThrow()
    {
        var act = () => _vm.OpenInBrowserCommand.Execute(null);
        act.Should().NotThrow();
    }

    [Fact]
    public void OpenFileCommand_CommentWithoutFilePath_DoesNotThrow()
    {
        var comment = new ClaudeReviewComment { Id = "1", FilePath = null };
        var act = () => _vm.OpenFileCommand.Execute(comment);
        act.Should().NotThrow();
    }

    [Fact]
    public void SummaryText_IncludesRobotEmoji()
    {
        var comments = new List<ClaudeReviewComment>
        {
            new() { Id = "1", Severity = CommentSeverity.Critical },
        };

        _vm.LoadComments(comments);

        // Robot emoji U+1F916
        _vm.SummaryText.Should().StartWith("\U0001F916");
    }
}
