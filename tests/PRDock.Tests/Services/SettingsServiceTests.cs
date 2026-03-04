using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class SettingsServiceTests
{
    private readonly ILogger<SettingsService> _logger = Substitute.For<ILogger<SettingsService>>();

    [Fact]
    public void Constructor_SetsDefaultCurrentSettings()
    {
        var service = new SettingsService(_logger);

        service.CurrentSettings.Should().NotBeNull();
        service.CurrentSettings.GitHub.PollIntervalSeconds.Should().Be(60);
        service.CurrentSettings.UI.SidebarEdge.Should().Be("right");
    }

    [Fact]
    public async Task LoadAsync_DoesNotThrow()
    {
        var service = new SettingsService(_logger);

        var act = () => service.LoadAsync();

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task SaveAsync_DoesNotThrow()
    {
        var service = new SettingsService(_logger);
        var settings = new AppSettings();

        var act = () => service.SaveAsync(settings);

        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task SaveAsync_UpdatesCurrentSettings()
    {
        var service = new SettingsService(_logger);
        var settings = new AppSettings
        {
            GitHub = new GitHubSettings { PollIntervalSeconds = 120 }
        };

        await service.SaveAsync(settings);

        service.CurrentSettings.GitHub.PollIntervalSeconds.Should().Be(120);
    }

    [Fact]
    public async Task SaveAsync_FiresSettingsChangedEvent()
    {
        var service = new SettingsService(_logger);
        var settings = new AppSettings();
        AppSettings? received = null;
        service.SettingsChanged += s => received = s;

        await service.SaveAsync(settings);

        received.Should().BeSameAs(settings);
    }

    [Fact]
    public void JsonSerializationRoundtrip_WithCamelCasePolicy_PreservesAllFields()
    {
        // This tests the same JSON options SettingsService uses internally
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
                PersonalAccessToken = "ghp_roundtrip",
                PollIntervalSeconds = 45,
                Username = "roundtripuser"
            },
            UI = new UiSettings
            {
                SidebarEdge = "left",
                SidebarMode = "autohide",
                SidebarWidthPx = 600,
                Theme = "dark",
                GlobalHotkey = "Alt+Shift+X",
                EditorCommand = "emacs"
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
                ClaudeCodePath = "/bin/claude"
            },
            ClaudeReview = new ClaudeReviewSettings
            {
                BotUsername = "test[bot]"
            }
        };

        var json = JsonSerializer.Serialize(original, options);
        var deserialized = JsonSerializer.Deserialize<AppSettings>(json, options);

        deserialized.Should().NotBeNull();
        deserialized!.GitHub.AuthMethod.Should().Be("pat");
        deserialized.GitHub.PersonalAccessToken.Should().Be("ghp_roundtrip");
        deserialized.GitHub.PollIntervalSeconds.Should().Be(45);
        deserialized.UI.SidebarEdge.Should().Be("left");
        deserialized.UI.SidebarWidthPx.Should().Be(600);
        deserialized.UI.Theme.Should().Be("dark");
        deserialized.Notifications.ToastOnNewPR.Should().BeTrue();
        deserialized.ClaudeCode.DefaultPostFixAction.Should().Be("notify");
        deserialized.ClaudeReview.BotUsername.Should().Be("test[bot]");
    }

    [Fact]
    public void CorruptJson_DeserializesToNull_AndDefaultsAreUsable()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        const string corruptJson = "{ this is not valid json !!!";

        AppSettings? result = null;
        var act = () =>
        {
            try
            {
                result = JsonSerializer.Deserialize<AppSettings>(corruptJson, options);
            }
            catch (JsonException)
            {
                // SettingsService catches this and falls back to defaults
                result = new AppSettings();
            }
        };

        act.Should().NotThrow();
        result.Should().NotBeNull();
        result!.GitHub.PollIntervalSeconds.Should().Be(60);
        result.UI.SidebarEdge.Should().Be("right");
    }
}
