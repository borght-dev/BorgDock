using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class NotificationServiceTests
{
    private readonly ISettingsService _settingsService = Substitute.For<ISettingsService>();
    private readonly ILogger<NotificationService> _logger = Substitute.For<ILogger<NotificationService>>();
    private readonly NotificationService _sut;

    public NotificationServiceTests()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            Notifications = new NotificationSettings
            {
                ToastOnCheckStatusChange = true,
                ToastOnReviewUpdate = true,
                ToastOnNewPR = false
            }
        });

        _sut = new NotificationService(_settingsService, _logger);
    }

    #region PrKey

    [Fact]
    public void PrKey_FormatsCorrectly()
    {
        var pr = new PullRequest { RepoOwner = "octocat", RepoName = "hello", Number = 42 };
        NotificationService.PrKey(pr).Should().Be("octocat/hello#42");
    }

    #endregion

    #region ProcessStateTransitions — Check status transitions

    [Fact]
    public void ProcessStateTransitions_WhenCheckTransitionsFromYellowToRed_DetectsFailure()
    {
        var pr = CreatePr(1);

        var previous = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [
                CreateCheck("build", "completed", "success"),
                CreateCheck("lint", "in_progress", null)
            ])
        };

        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [
                CreateCheck("build", "completed", "success"),
                CreateCheck("lint", "completed", "failure")
            ])
        };

        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    [Fact]
    public void ProcessStateTransitions_WhenCheckTransitionsFromRedToGreen_DetectsAllPassed()
    {
        var pr = CreatePr(1);

        var previous = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [
                CreateCheck("build", "completed", "failure")
            ])
        };

        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [
                CreateCheck("build", "completed", "success")
            ])
        };

        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    [Fact]
    public void ProcessStateTransitions_WhenStatusUnchanged_NoNotifications()
    {
        var pr = CreatePr(1);

        var checks = new List<CheckRun> { CreateCheck("build", "completed", "success") };
        var previous = new List<PullRequestWithChecks> { CreatePrWithChecks(pr, checks) };
        var current = new List<PullRequestWithChecks> { CreatePrWithChecks(pr, checks) };

        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    [Fact]
    public void ProcessStateTransitions_NewPrNotInPrevious_Skipped()
    {
        var previous = new List<PullRequestWithChecks>();
        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(CreatePr(99), [CreateCheck("build", "completed", "failure")])
        };

        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    [Fact]
    public void ProcessStateTransitions_MultipleNewFailedChecks_DetectsAll()
    {
        var pr = CreatePr(1);

        var previous = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [
                CreateCheck("build", "in_progress", null),
                CreateCheck("lint", "in_progress", null)
            ])
        };

        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [
                CreateCheck("build", "completed", "failure"),
                CreateCheck("lint", "completed", "failure")
            ])
        };

        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    #endregion

    #region ProcessStateTransitions — Review transitions

    [Fact]
    public void ProcessStateTransitions_ReviewChangedToChangesRequested_DetectsTransition()
    {
        var prPrev = CreatePr(1);
        prPrev.ReviewStatus = ReviewStatus.Pending;

        var prCur = CreatePr(1);
        prCur.ReviewStatus = ReviewStatus.ChangesRequested;

        var previous = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(prPrev, [CreateCheck("build", "completed", "success")])
        };

        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(prCur, [CreateCheck("build", "completed", "success")])
        };

        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    [Fact]
    public void ProcessStateTransitions_ReviewChangedToApproved_NoReviewNotification()
    {
        var prPrev = CreatePr(1);
        prPrev.ReviewStatus = ReviewStatus.Pending;

        var prCur = CreatePr(1);
        prCur.ReviewStatus = ReviewStatus.Approved;

        var previous = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(prPrev, [CreateCheck("build", "completed", "success")])
        };

        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(prCur, [CreateCheck("build", "completed", "success")])
        };

        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    #endregion

    #region Settings toggles

    [Fact]
    public void NotifyCheckFailed_WhenToastOnCheckStatusChangeDisabled_DoesNotThrow()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            Notifications = new NotificationSettings { ToastOnCheckStatusChange = false }
        });

        var sut = new NotificationService(_settingsService, _logger);
        var pr = CreatePr(1);

        var act = () => sut.NotifyCheckFailed(pr, "build");
        act.Should().NotThrow();
    }

    [Fact]
    public void NotifyAllChecksPassed_WhenToastOnCheckStatusChangeDisabled_DoesNotThrow()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            Notifications = new NotificationSettings { ToastOnCheckStatusChange = false }
        });

        var sut = new NotificationService(_settingsService, _logger);
        var pr = CreatePr(1);

        var act = () => sut.NotifyAllChecksPassed(pr);
        act.Should().NotThrow();
    }

    [Fact]
    public void NotifyReviewRequested_WhenToastOnReviewUpdateDisabled_DoesNotThrow()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            Notifications = new NotificationSettings { ToastOnReviewUpdate = false }
        });

        var sut = new NotificationService(_settingsService, _logger);
        var pr = CreatePr(1);

        var act = () => sut.NotifyReviewRequested(pr, "reviewer1");
        act.Should().NotThrow();
    }

    #endregion

    #region State transition detection — additional scenarios

    [Fact]
    public void ProcessStateTransitions_GrayToGreen_NotifiesAllPassed()
    {
        var pr = CreatePr(1);

        var previous = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, []) // gray — no checks
        };

        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [CreateCheck("build", "completed", "success")])
        };

        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    [Fact]
    public void ProcessStateTransitions_GreenToRed_NotifiesFailure()
    {
        var pr = CreatePr(1);

        var previous = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [CreateCheck("build", "completed", "success")])
        };

        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [CreateCheck("build", "completed", "failure")])
        };

        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    [Fact]
    public void ProcessStateTransitions_MultiplePRs_ProcessesEach()
    {
        var pr1Prev = CreatePr(1);
        var pr2Prev = CreatePr(2);

        var pr1Cur = CreatePr(1);
        var pr2Cur = CreatePr(2);

        var previous = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr1Prev, [CreateCheck("build", "completed", "success")]),
            CreatePrWithChecks(pr2Prev, [CreateCheck("build", "in_progress", null)])
        };

        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr1Cur, [CreateCheck("build", "completed", "failure")]),
            CreatePrWithChecks(pr2Cur, [CreateCheck("build", "completed", "success")])
        };

        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    [Fact]
    public void ProcessStateTransitions_RedToRed_NoNotification()
    {
        var pr = CreatePr(1);

        var previous = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [CreateCheck("build", "completed", "failure")])
        };

        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [CreateCheck("build", "completed", "failure")])
        };

        // Red → Red with same failed checks — no transition
        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    [Fact]
    public void ProcessStateTransitions_YellowToGreen_NotifiesAllPassed()
    {
        var pr = CreatePr(1);

        var previous = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [CreateCheck("build", "in_progress", null)])
        };

        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [CreateCheck("build", "completed", "success")])
        };

        var act = () => _sut.ProcessStateTransitions(previous, current);
        act.Should().NotThrow();
    }

    #endregion

    #region NotificationRaised event

    [Fact]
    public void NotifyCheckFailed_RaisesNotificationRaisedEvent()
    {
        InAppNotification? raised = null;
        _sut.NotificationRaised += n => raised = n;

        _sut.NotifyCheckFailed(CreatePr(1), "build");

        raised.Should().NotBeNull();
        raised!.Title.Should().Be("Check failed: build");
        raised.Severity.Should().Be("error");
        raised.Actions.Should().HaveCount(2);
    }

    [Fact]
    public void NotifyAllChecksPassed_RaisesNotificationRaisedEvent()
    {
        InAppNotification? raised = null;
        _sut.NotificationRaised += n => raised = n;

        _sut.NotifyAllChecksPassed(CreatePr(1));

        raised.Should().NotBeNull();
        raised!.Title.Should().Be("All checks passed");
        raised.Severity.Should().Be("success");
    }

    [Fact]
    public void NotifyCheckFailed_WhenDisabled_DoesNotRaiseEvent()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            Notifications = new NotificationSettings { ToastOnCheckStatusChange = false }
        });
        var sut = new NotificationService(_settingsService, _logger);

        InAppNotification? raised = null;
        sut.NotificationRaised += n => raised = n;

        sut.NotifyCheckFailed(CreatePr(1), "build");

        raised.Should().BeNull();
    }

    [Fact]
    public void NotifyReviewRequested_RaisesWithWarningSeverity()
    {
        InAppNotification? raised = null;
        _sut.NotificationRaised += n => raised = n;

        _sut.NotifyReviewRequested(CreatePr(1), "alice");

        raised.Should().NotBeNull();
        raised!.Severity.Should().Be("warning");
        raised.Title.Should().Contain("alice");
    }

    [Fact]
    public void NotifyFixCommitted_RaisesWithSuccessSeverity()
    {
        InAppNotification? raised = null;
        _sut.NotificationRaised += n => raised = n;

        _sut.NotifyFixCommitted(CreatePr(1));

        raised.Should().NotBeNull();
        raised!.Title.Should().Be("Fix committed");
        raised.Severity.Should().Be("success");
    }

    [Fact]
    public void ProcessStateTransitions_YellowToRed_RaisesNotification()
    {
        var pr = CreatePr(1);
        var raised = new List<InAppNotification>();
        _sut.NotificationRaised += n => raised.Add(n);

        var previous = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [CreateCheck("build", "in_progress", null)])
        };
        var current = new List<PullRequestWithChecks>
        {
            CreatePrWithChecks(pr, [CreateCheck("build", "completed", "failure")])
        };

        _sut.ProcessStateTransitions(previous, current);

        raised.Should().ContainSingle();
        raised[0].Severity.Should().Be("error");
        raised[0].Title.Should().Contain("build");
    }

    #endregion

    #region Helpers

    private static PullRequest CreatePr(int number) => new()
    {
        Number = number,
        Title = $"Test PR #{number}",
        RepoOwner = "octocat",
        RepoName = "hello-world",
        HtmlUrl = $"https://github.com/octocat/hello-world/pull/{number}"
    };

    private static CheckRun CreateCheck(string name, string status, string? conclusion) => new()
    {
        Id = Random.Shared.Next(),
        Name = name,
        Status = status,
        Conclusion = conclusion
    };

    private static PullRequestWithChecks CreatePrWithChecks(PullRequest pr, List<CheckRun> checks) => new()
    {
        PullRequest = pr,
        Checks = checks
    };

    #endregion
}
