using System.IO;
using System.Text.Json;
using FluentAssertions;
using PRDock.App.Models;

namespace PRDock.IntegrationTests;

public sealed class SettingsFileTests : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly string _tempDir;

    public SettingsFileTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "PRDock_Tests_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    [Fact]
    public async Task DefaultSettings_RoundTrip_PreservesAllFields()
    {
        // Arrange
        var original = new AppSettings();
        var filePath = Path.Combine(_tempDir, "settings-default.json");

        // Act
        var json = JsonSerializer.Serialize(original, JsonOptions);
        await File.WriteAllTextAsync(filePath, json);
        var readBack = await File.ReadAllTextAsync(filePath);
        var deserialized = JsonSerializer.Deserialize<AppSettings>(readBack, JsonOptions);

        // Assert
        deserialized.Should().NotBeNull();

        deserialized!.GitHub.AuthMethod.Should().Be("ghCli");
        deserialized.GitHub.PersonalAccessToken.Should().BeNull();
        deserialized.GitHub.PollIntervalSeconds.Should().Be(60);
        deserialized.GitHub.Username.Should().BeEmpty();

        deserialized.Repos.Should().BeEmpty();

        deserialized.UI.SidebarEdge.Should().Be("right");
        deserialized.UI.SidebarMode.Should().Be("pinned");
        deserialized.UI.SidebarWidthPx.Should().Be(420);
        deserialized.UI.Theme.Should().Be("system");
        deserialized.UI.GlobalHotkey.Should().Be("Ctrl+Win+Shift+G");
        deserialized.UI.EditorCommand.Should().Be("code");

        deserialized.Notifications.ToastOnCheckStatusChange.Should().BeTrue();
        deserialized.Notifications.ToastOnNewPR.Should().BeFalse();
        deserialized.Notifications.ToastOnReviewUpdate.Should().BeTrue();

        deserialized.ClaudeCode.DefaultPostFixAction.Should().Be("commitAndNotify");
        deserialized.ClaudeCode.ClaudeCodePath.Should().BeNull();

        deserialized.ClaudeReview.BotUsername.Should().Be("claude[bot]");
    }

    [Fact]
    public async Task ModifiedSettings_RoundTrip_PreservesCustomValues()
    {
        // Arrange
        var original = new AppSettings
        {
            GitHub = new GitHubSettings
            {
                AuthMethod = "pat",
                PersonalAccessToken = "ghp_test123",
                PollIntervalSeconds = 120,
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
                    FixPromptTemplate = "Fix the failing CI check: {check_name}"
                }
            ],
            UI = new UiSettings
            {
                SidebarEdge = "left",
                SidebarMode = "autohide",
                SidebarWidthPx = 600,
                Theme = "dark",
                GlobalHotkey = "Ctrl+Shift+P",
                EditorCommand = "rider"
            },
            Notifications = new NotificationSettings
            {
                ToastOnCheckStatusChange = false,
                ToastOnNewPR = true,
                ToastOnReviewUpdate = false
            },
            ClaudeCode = new ClaudeCodeSettings
            {
                DefaultPostFixAction = "pushAndNotify",
                ClaudeCodePath = "/usr/local/bin/claude"
            },
            ClaudeReview = new ClaudeReviewSettings
            {
                BotUsername = "my-custom-bot"
            }
        };

        var filePath = Path.Combine(_tempDir, "settings-modified.json");

        // Act
        var json = JsonSerializer.Serialize(original, JsonOptions);
        await File.WriteAllTextAsync(filePath, json);
        var readBack = await File.ReadAllTextAsync(filePath);
        var deserialized = JsonSerializer.Deserialize<AppSettings>(readBack, JsonOptions);

        // Assert
        deserialized.Should().NotBeNull();

        deserialized!.GitHub.AuthMethod.Should().Be("pat");
        deserialized.GitHub.PersonalAccessToken.Should().Be("ghp_test123");
        deserialized.GitHub.PollIntervalSeconds.Should().Be(120);
        deserialized.GitHub.Username.Should().Be("testuser");

        deserialized.Repos.Should().HaveCount(1);
        var repo = deserialized.Repos[0];
        repo.Owner.Should().Be("myorg");
        repo.Name.Should().Be("myrepo");
        repo.Enabled.Should().BeFalse();
        repo.WorktreeBasePath.Should().Be("C:\\repos");
        repo.WorktreeSubfolder.Should().Be(".wt");
        repo.FixPromptTemplate.Should().Be("Fix the failing CI check: {check_name}");

        deserialized.UI.SidebarEdge.Should().Be("left");
        deserialized.UI.SidebarMode.Should().Be("autohide");
        deserialized.UI.SidebarWidthPx.Should().Be(600);
        deserialized.UI.Theme.Should().Be("dark");
        deserialized.UI.GlobalHotkey.Should().Be("Ctrl+Shift+P");
        deserialized.UI.EditorCommand.Should().Be("rider");

        deserialized.Notifications.ToastOnCheckStatusChange.Should().BeFalse();
        deserialized.Notifications.ToastOnNewPR.Should().BeTrue();
        deserialized.Notifications.ToastOnReviewUpdate.Should().BeFalse();

        deserialized.ClaudeCode.DefaultPostFixAction.Should().Be("pushAndNotify");
        deserialized.ClaudeCode.ClaudeCodePath.Should().Be("/usr/local/bin/claude");

        deserialized.ClaudeReview.BotUsername.Should().Be("my-custom-bot");
    }

    [Fact]
    public async Task CorruptJson_Deserialize_ReturnsNull()
    {
        // Arrange
        var filePath = Path.Combine(_tempDir, "settings-corrupt.json");
        await File.WriteAllTextAsync(filePath, "not json at all");

        // Act
        var readBack = await File.ReadAllTextAsync(filePath);
        var act = () => JsonSerializer.Deserialize<AppSettings>(readBack, JsonOptions);

        // Assert — SettingsService catches this and falls back to defaults
        act.Should().Throw<JsonException>();
    }

    [Fact]
    public async Task EmptyJsonObject_Deserialize_ReturnsDefaultValues()
    {
        // Arrange
        var filePath = Path.Combine(_tempDir, "settings-empty.json");
        await File.WriteAllTextAsync(filePath, "{}");

        // Act
        var readBack = await File.ReadAllTextAsync(filePath);
        var deserialized = JsonSerializer.Deserialize<AppSettings>(readBack, JsonOptions);

        // Assert — empty JSON creates sub-objects via parameterless constructors,
        // so property initializers (e.g., PollIntervalSeconds = 60) still apply.
        deserialized.Should().NotBeNull();
        deserialized!.GitHub.Should().NotBeNull();
        deserialized.GitHub.PollIntervalSeconds.Should().Be(60);
        deserialized.GitHub.AuthMethod.Should().Be("ghCli");
        deserialized.Repos.Should().NotBeNull().And.BeEmpty();
        deserialized.UI.Should().NotBeNull();
        deserialized.UI.SidebarWidthPx.Should().Be(420);
    }

    [Fact]
    public async Task SerializedJson_UsesCamelCasePropertyNames()
    {
        // Arrange
        var settings = new AppSettings();

        // Act
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        var filePath = Path.Combine(_tempDir, "settings-camel.json");
        await File.WriteAllTextAsync(filePath, json);

        // Assert — verify camelCase keys appear in the JSON
        json.Should().Contain("\"gitHub\":");
        json.Should().Contain("\"pollIntervalSeconds\":");
        json.Should().Contain("\"sidebarEdge\":");
        json.Should().Contain("\"toastOnCheckStatusChange\":");
        json.Should().Contain("\"defaultPostFixAction\":");
        json.Should().Contain("\"botUsername\":");

        // Should NOT contain PascalCase
        json.Should().NotContain("\"GitHub\":");
        json.Should().NotContain("\"PollIntervalSeconds\":");
    }

    [Fact]
    public async Task MultipleRepos_RoundTrip_PreservesOrder()
    {
        // Arrange
        var original = new AppSettings
        {
            Repos =
            [
                new RepoSettings { Owner = "org1", Name = "repo-a" },
                new RepoSettings { Owner = "org2", Name = "repo-b" },
                new RepoSettings { Owner = "org3", Name = "repo-c" }
            ]
        };

        var filePath = Path.Combine(_tempDir, "settings-multi-repo.json");

        // Act
        var json = JsonSerializer.Serialize(original, JsonOptions);
        await File.WriteAllTextAsync(filePath, json);
        var readBack = await File.ReadAllTextAsync(filePath);
        var deserialized = JsonSerializer.Deserialize<AppSettings>(readBack, JsonOptions);

        // Assert
        deserialized.Should().NotBeNull();
        deserialized!.Repos.Should().HaveCount(3);
        deserialized.Repos[0].Owner.Should().Be("org1");
        deserialized.Repos[0].Name.Should().Be("repo-a");
        deserialized.Repos[1].Owner.Should().Be("org2");
        deserialized.Repos[1].Name.Should().Be("repo-b");
        deserialized.Repos[2].Owner.Should().Be("org3");
        deserialized.Repos[2].Name.Should().Be("repo-c");
    }
}
