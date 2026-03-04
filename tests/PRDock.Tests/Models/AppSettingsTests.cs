using System.Text.Json;
using FluentAssertions;
using PRDock.App.Models;

namespace PRDock.Tests.Models;

public class AppSettingsTests
{
    [Fact]
    public void DefaultValues_GitHub_AreCorrect()
    {
        var settings = new AppSettings();

        settings.GitHub.AuthMethod.Should().Be("ghCli");
        settings.GitHub.PersonalAccessToken.Should().BeNull();
        settings.GitHub.PollIntervalSeconds.Should().Be(60);
        settings.GitHub.Username.Should().BeEmpty();
    }

    [Fact]
    public void DefaultValues_UI_AreCorrect()
    {
        var settings = new AppSettings();

        settings.UI.SidebarEdge.Should().Be("right");
        settings.UI.SidebarMode.Should().Be("pinned");
        settings.UI.SidebarWidthPx.Should().Be(420);
        settings.UI.Theme.Should().Be("system");
        settings.UI.GlobalHotkey.Should().Be("Ctrl+Win+Shift+G");
        settings.UI.EditorCommand.Should().Be("code");
    }

    [Fact]
    public void DefaultValues_Notifications_AreCorrect()
    {
        var settings = new AppSettings();

        settings.Notifications.ToastOnCheckStatusChange.Should().BeTrue();
        settings.Notifications.ToastOnNewPR.Should().BeFalse();
        settings.Notifications.ToastOnReviewUpdate.Should().BeTrue();
    }

    [Fact]
    public void DefaultValues_ClaudeCode_AreCorrect()
    {
        var settings = new AppSettings();

        settings.ClaudeCode.DefaultPostFixAction.Should().Be("commitAndNotify");
        settings.ClaudeCode.ClaudeCodePath.Should().BeNull();
    }

    [Fact]
    public void DefaultValues_ClaudeReview_AreCorrect()
    {
        var settings = new AppSettings();

        settings.ClaudeReview.BotUsername.Should().Be("claude[bot]");
    }

    [Fact]
    public void DefaultValues_Repos_IsEmptyList()
    {
        var settings = new AppSettings();

        settings.Repos.Should().NotBeNull();
        settings.Repos.Should().BeEmpty();
    }

    [Fact]
    public void JsonSerializationRoundtrip_PreservesAllFields()
    {
        var options = new JsonSerializerOptions
        {
            WriteIndented = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        var original = new AppSettings
        {
            GitHub = new GitHubSettings
            {
                AuthMethod = "pat",
                PersonalAccessToken = "ghp_test123",
                PollIntervalSeconds = 30,
                Username = "testuser"
            },
            Repos =
            [
                new RepoSettings
                {
                    Owner = "myorg",
                    Name = "myrepo",
                    Enabled = false,
                    WorktreeBasePath = "C:\\repos",
                    WorktreeSubfolder = ".wt",
                    FixPromptTemplate = "Fix: {0}"
                }
            ],
            UI = new UiSettings
            {
                SidebarEdge = "left",
                SidebarMode = "autohide",
                SidebarWidthPx = 500,
                Theme = "dark",
                GlobalHotkey = "Alt+F1",
                EditorCommand = "vim"
            },
            Notifications = new NotificationSettings
            {
                ToastOnCheckStatusChange = false,
                ToastOnNewPR = true,
                ToastOnReviewUpdate = false
            },
            ClaudeCode = new ClaudeCodeSettings
            {
                DefaultPostFixAction = "notify",
                ClaudeCodePath = "/usr/bin/claude"
            },
            ClaudeReview = new ClaudeReviewSettings
            {
                BotUsername = "my-bot[bot]"
            }
        };

        var json = JsonSerializer.Serialize(original, options);
        var deserialized = JsonSerializer.Deserialize<AppSettings>(json, options);

        deserialized.Should().NotBeNull();
        deserialized!.GitHub.AuthMethod.Should().Be("pat");
        deserialized.GitHub.PersonalAccessToken.Should().Be("ghp_test123");
        deserialized.GitHub.PollIntervalSeconds.Should().Be(30);
        deserialized.GitHub.Username.Should().Be("testuser");

        deserialized.Repos.Should().HaveCount(1);
        deserialized.Repos[0].Owner.Should().Be("myorg");
        deserialized.Repos[0].Name.Should().Be("myrepo");
        deserialized.Repos[0].Enabled.Should().BeFalse();
        deserialized.Repos[0].WorktreeBasePath.Should().Be("C:\\repos");
        deserialized.Repos[0].WorktreeSubfolder.Should().Be(".wt");
        deserialized.Repos[0].FixPromptTemplate.Should().Be("Fix: {0}");

        deserialized.UI.SidebarEdge.Should().Be("left");
        deserialized.UI.SidebarMode.Should().Be("autohide");
        deserialized.UI.SidebarWidthPx.Should().Be(500);
        deserialized.UI.Theme.Should().Be("dark");
        deserialized.UI.GlobalHotkey.Should().Be("Alt+F1");
        deserialized.UI.EditorCommand.Should().Be("vim");

        deserialized.Notifications.ToastOnCheckStatusChange.Should().BeFalse();
        deserialized.Notifications.ToastOnNewPR.Should().BeTrue();
        deserialized.Notifications.ToastOnReviewUpdate.Should().BeFalse();

        deserialized.ClaudeCode.DefaultPostFixAction.Should().Be("notify");
        deserialized.ClaudeCode.ClaudeCodePath.Should().Be("/usr/bin/claude");

        deserialized.ClaudeReview.BotUsername.Should().Be("my-bot[bot]");
    }

    [Fact]
    public void DeserializationFromKnownJson_ProducesCorrectValues()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        const string json = """
        {
            "gitHub": {
                "authMethod": "pat",
                "personalAccessToken": "ghp_abc",
                "pollIntervalSeconds": 120,
                "username": "jdoe"
            },
            "repos": [
                {
                    "owner": "acme",
                    "name": "widgets",
                    "enabled": true,
                    "worktreeBasePath": "/home/jdoe/repos",
                    "worktreeSubfolder": ".trees",
                    "fixPromptTemplate": null
                }
            ],
            "ui": {
                "sidebarEdge": "left",
                "sidebarMode": "autohide",
                "sidebarWidthPx": 300,
                "theme": "light",
                "globalHotkey": "Ctrl+Shift+P",
                "editorCommand": "nano"
            },
            "notifications": {
                "toastOnCheckStatusChange": false,
                "toastOnNewPR": true,
                "toastOnReviewUpdate": false
            },
            "claudeCode": {
                "defaultPostFixAction": "commit",
                "claudeCodePath": "/opt/claude"
            },
            "claudeReview": {
                "botUsername": "helper[bot]"
            }
        }
        """;

        var settings = JsonSerializer.Deserialize<AppSettings>(json, options);

        settings.Should().NotBeNull();
        settings!.GitHub.AuthMethod.Should().Be("pat");
        settings.GitHub.PersonalAccessToken.Should().Be("ghp_abc");
        settings.GitHub.PollIntervalSeconds.Should().Be(120);
        settings.GitHub.Username.Should().Be("jdoe");

        settings.Repos.Should().HaveCount(1);
        settings.Repos[0].Owner.Should().Be("acme");
        settings.Repos[0].Name.Should().Be("widgets");
        settings.Repos[0].WorktreeSubfolder.Should().Be(".trees");

        settings.UI.SidebarEdge.Should().Be("left");
        settings.UI.SidebarWidthPx.Should().Be(300);
        settings.UI.Theme.Should().Be("light");
        settings.UI.EditorCommand.Should().Be("nano");

        settings.Notifications.ToastOnCheckStatusChange.Should().BeFalse();
        settings.Notifications.ToastOnNewPR.Should().BeTrue();

        settings.ClaudeCode.DefaultPostFixAction.Should().Be("commit");
        settings.ClaudeCode.ClaudeCodePath.Should().Be("/opt/claude");

        settings.ClaudeReview.BotUsername.Should().Be("helper[bot]");
    }
}
