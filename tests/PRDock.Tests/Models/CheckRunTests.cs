using FluentAssertions;
using PRDock.App.Models;

namespace PRDock.Tests.Models;

public class CheckRunTests
{
    [Fact]
    public void IsCompleted_WhenStatusCompleted_ReturnsTrue()
    {
        var run = new CheckRun { Status = "completed", Conclusion = "success" };
        run.IsCompleted.Should().BeTrue();
    }

    [Theory]
    [InlineData("queued")]
    [InlineData("in_progress")]
    public void IsCompleted_WhenStatusNotCompleted_ReturnsFalse(string status)
    {
        var run = new CheckRun { Status = status };
        run.IsCompleted.Should().BeFalse();
    }

    [Fact]
    public void IsSuccess_WhenCompletedWithSuccess_ReturnsTrue()
    {
        var run = new CheckRun { Status = "completed", Conclusion = "success" };
        run.IsSuccess.Should().BeTrue();
    }

    [Theory]
    [InlineData("completed", "failure")]
    [InlineData("completed", "cancelled")]
    [InlineData("in_progress", "success")]
    [InlineData("queued", null)]
    public void IsSuccess_WhenNotCompletedOrNotSuccess_ReturnsFalse(string status, string? conclusion)
    {
        var run = new CheckRun { Status = status, Conclusion = conclusion };
        run.IsSuccess.Should().BeFalse();
    }

    [Theory]
    [InlineData("failure")]
    [InlineData("timed_out")]
    public void IsFailed_WhenCompletedWithFailureOrTimedOut_ReturnsTrue(string conclusion)
    {
        var run = new CheckRun { Status = "completed", Conclusion = conclusion };
        run.IsFailed.Should().BeTrue();
    }

    [Theory]
    [InlineData("completed", "success")]
    [InlineData("completed", "neutral")]
    [InlineData("completed", "cancelled")]
    [InlineData("completed", "skipped")]
    [InlineData("in_progress", "failure")]
    public void IsFailed_WhenNotApplicable_ReturnsFalse(string status, string? conclusion)
    {
        var run = new CheckRun { Status = status, Conclusion = conclusion };
        run.IsFailed.Should().BeFalse();
    }

    [Theory]
    [InlineData("queued")]
    [InlineData("in_progress")]
    public void IsPending_WhenNotCompleted_ReturnsTrue(string status)
    {
        var run = new CheckRun { Status = status };
        run.IsPending.Should().BeTrue();
    }

    [Fact]
    public void IsPending_WhenCompleted_ReturnsFalse()
    {
        var run = new CheckRun { Status = "completed", Conclusion = "success" };
        run.IsPending.Should().BeFalse();
    }

    [Fact]
    public void DefaultValues_AreCorrect()
    {
        var run = new CheckRun();
        run.Id.Should().Be(0);
        run.Name.Should().BeEmpty();
        run.Status.Should().BeEmpty();
        run.Conclusion.Should().BeNull();
        run.StartedAt.Should().BeNull();
        run.CompletedAt.Should().BeNull();
        run.HtmlUrl.Should().BeEmpty();
        run.CheckSuiteId.Should().Be(0);
    }
}
