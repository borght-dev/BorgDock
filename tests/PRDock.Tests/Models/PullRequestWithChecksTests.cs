using FluentAssertions;
using PRDock.App.Models;

namespace PRDock.Tests.Models;

public class PullRequestWithChecksTests
{
    [Fact]
    public void OverallStatus_NoChecks_ReturnsGray()
    {
        var prWithChecks = new PullRequestWithChecks { Checks = [] };

        prWithChecks.OverallStatus.Should().Be("gray");
    }

    [Fact]
    public void OverallStatus_AllSuccess_ReturnsGreen()
    {
        var prWithChecks = new PullRequestWithChecks
        {
            Checks = [new CheckRun { Status = "completed", Conclusion = "success" }]
        };

        prWithChecks.OverallStatus.Should().Be("green");
    }

    [Fact]
    public void OverallStatus_AnyFailed_ReturnsRed()
    {
        var prWithChecks = new PullRequestWithChecks
        {
            Checks =
            [
                new CheckRun { Status = "completed", Conclusion = "success" },
                new CheckRun { Status = "completed", Conclusion = "failure" }
            ]
        };

        prWithChecks.OverallStatus.Should().Be("red");
    }

    [Fact]
    public void OverallStatus_AnyPending_ReturnsYellow()
    {
        var prWithChecks = new PullRequestWithChecks
        {
            Checks =
            [
                new CheckRun { Status = "completed", Conclusion = "success" },
                new CheckRun { Status = "in_progress" }
            ]
        };

        prWithChecks.OverallStatus.Should().Be("yellow");
    }

    [Fact]
    public void OverallStatus_FailedTakesPriorityOverPending()
    {
        var prWithChecks = new PullRequestWithChecks
        {
            Checks =
            [
                new CheckRun { Status = "completed", Conclusion = "failure" },
                new CheckRun { Status = "in_progress" }
            ]
        };

        prWithChecks.OverallStatus.Should().Be("red");
    }

    [Fact]
    public void FailedCheckNames_ReturnsCorrectNames()
    {
        var prWithChecks = new PullRequestWithChecks
        {
            Checks =
            [
                new CheckRun { Name = "build", Status = "completed", Conclusion = "failure" },
                new CheckRun { Name = "test", Status = "completed", Conclusion = "success" }
            ]
        };

        prWithChecks.FailedCheckNames.Should().BeEquivalentTo("build");
    }

    [Fact]
    public void PendingCheckNames_ReturnsCorrectNames()
    {
        var prWithChecks = new PullRequestWithChecks
        {
            Checks =
            [
                new CheckRun { Name = "deploy", Status = "queued" },
                new CheckRun { Name = "test", Status = "completed", Conclusion = "success" }
            ]
        };

        prWithChecks.PendingCheckNames.Should().BeEquivalentTo("deploy");
    }

    [Fact]
    public void PassedCount_ReturnsCorrectCount()
    {
        var prWithChecks = new PullRequestWithChecks
        {
            Checks =
            [
                new CheckRun { Status = "completed", Conclusion = "success" },
                new CheckRun { Status = "completed", Conclusion = "success" },
                new CheckRun { Status = "completed", Conclusion = "failure" }
            ]
        };

        prWithChecks.PassedCount.Should().Be(2);
    }

    [Fact]
    public void TimedOut_CountsAsFailed()
    {
        var prWithChecks = new PullRequestWithChecks
        {
            Checks = [new CheckRun { Status = "completed", Conclusion = "timed_out" }]
        };

        prWithChecks.OverallStatus.Should().Be("red");
        prWithChecks.FailedCheckNames.Should().HaveCount(1);
    }
}
