using FluentAssertions;
using PRDock.App.Models;

namespace PRDock.Tests.Models;

public class PullRequestTests
{
    [Fact]
    public void DefaultValues_AreCorrect()
    {
        var pr = new PullRequest();

        pr.Number.Should().Be(0);
        pr.Title.Should().BeEmpty();
        pr.HeadRef.Should().BeEmpty();
        pr.BaseRef.Should().BeEmpty();
        pr.AuthorLogin.Should().BeEmpty();
        pr.AuthorAvatarUrl.Should().BeEmpty();
        pr.State.Should().Be("open");
        pr.CreatedAt.Should().Be(default);
        pr.UpdatedAt.Should().Be(default);
        pr.IsDraft.Should().BeFalse();
        pr.Mergeable.Should().BeNull();
        pr.HtmlUrl.Should().BeEmpty();
        pr.RepoOwner.Should().BeEmpty();
        pr.RepoName.Should().BeEmpty();
        pr.ReviewStatus.Should().Be(ReviewStatus.None);
        pr.CommentCount.Should().Be(0);
        pr.Labels.Should().NotBeNull().And.BeEmpty();
    }

    [Fact]
    public void Properties_CanBeSetAndRetrieved()
    {
        var now = DateTime.UtcNow;
        var pr = new PullRequest
        {
            Number = 42,
            Title = "Fix the widget",
            HeadRef = "fix/widget",
            BaseRef = "main",
            AuthorLogin = "octocat",
            AuthorAvatarUrl = "https://avatars.githubusercontent.com/u/1?v=4",
            State = "open",
            CreatedAt = now,
            UpdatedAt = now,
            IsDraft = true,
            Mergeable = false,
            HtmlUrl = "https://github.com/acme/repo/pull/42",
            RepoOwner = "acme",
            RepoName = "repo",
            ReviewStatus = ReviewStatus.Approved,
            CommentCount = 5,
            Labels = ["bug", "urgent"]
        };

        pr.Number.Should().Be(42);
        pr.Title.Should().Be("Fix the widget");
        pr.HeadRef.Should().Be("fix/widget");
        pr.BaseRef.Should().Be("main");
        pr.AuthorLogin.Should().Be("octocat");
        pr.AuthorAvatarUrl.Should().Be("https://avatars.githubusercontent.com/u/1?v=4");
        pr.State.Should().Be("open");
        pr.CreatedAt.Should().Be(now);
        pr.UpdatedAt.Should().Be(now);
        pr.IsDraft.Should().BeTrue();
        pr.Mergeable.Should().BeFalse();
        pr.HtmlUrl.Should().Be("https://github.com/acme/repo/pull/42");
        pr.RepoOwner.Should().Be("acme");
        pr.RepoName.Should().Be("repo");
        pr.ReviewStatus.Should().Be(ReviewStatus.Approved);
        pr.CommentCount.Should().Be(5);
        pr.Labels.Should().BeEquivalentTo(["bug", "urgent"]);
    }
}
