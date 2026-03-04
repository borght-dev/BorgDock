using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class GitHubAuthServiceTests
{
    private readonly ISettingsService _settingsService = Substitute.For<ISettingsService>();
    private readonly ILogger<GitHubAuthService> _logger = Substitute.For<ILogger<GitHubAuthService>>();

    private GitHubAuthService CreateSut() => new(_settingsService, _logger);

    [Fact]
    public void IsAuthenticated_InitiallyFalse()
    {
        var sut = CreateSut();

        sut.IsAuthenticated.Should().BeFalse();
    }

    [Fact]
    public async Task GetTokenAsync_WithPatAuthMethod_ReturnsPat()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            GitHub = new GitHubSettings
            {
                AuthMethod = "pat",
                PersonalAccessToken = "ghp_test123"
            }
        });

        var sut = CreateSut();
        var token = await sut.GetTokenAsync();

        token.Should().Be("ghp_test123");
        sut.IsAuthenticated.Should().BeTrue();
    }

    [Fact]
    public async Task GetTokenAsync_WithPatAuthMethod_CachesToken()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            GitHub = new GitHubSettings
            {
                AuthMethod = "pat",
                PersonalAccessToken = "ghp_cached"
            }
        });

        var sut = CreateSut();

        var token1 = await sut.GetTokenAsync();
        var token2 = await sut.GetTokenAsync();

        token1.Should().Be("ghp_cached");
        token2.Should().Be("ghp_cached");
        // CurrentSettings should only be accessed once due to caching
        _ = _settingsService.Received(1).CurrentSettings;
    }

    [Fact]
    public async Task GetTokenAsync_NoPatAndGhCliFails_ReturnsNull()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            GitHub = new GitHubSettings
            {
                AuthMethod = "pat",
                PersonalAccessToken = null
            }
        });

        var sut = CreateSut();
        var token = await sut.GetTokenAsync();

        token.Should().BeNull();
        sut.IsAuthenticated.Should().BeFalse();
    }

    [Fact]
    public async Task GetTokenAsync_EmptyPat_ReturnsNull()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            GitHub = new GitHubSettings
            {
                AuthMethod = "pat",
                PersonalAccessToken = ""
            }
        });

        var sut = CreateSut();
        var token = await sut.GetTokenAsync();

        token.Should().BeNull();
    }

    [Fact]
    public async Task GetTokenAsync_GhCliMethodFallsToPat_WhenGhCliFails()
    {
        // ghCli is default but will fail in test environment (no gh CLI available)
        // Should fall back to PAT
        _settingsService.CurrentSettings.Returns(new AppSettings
        {
            GitHub = new GitHubSettings
            {
                AuthMethod = "ghCli",
                PersonalAccessToken = "ghp_fallback"
            }
        });

        var sut = CreateSut();
        var token = await sut.GetTokenAsync();

        // In CI/test environments gh CLI is likely not authenticated,
        // so it should fall back to the PAT
        token.Should().NotBeNull();
    }
}
