using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class UpdateServiceTests
{
    private readonly IGitHubAuthService _authService = Substitute.For<IGitHubAuthService>();
    private readonly ISettingsService _settingsService = Substitute.For<ISettingsService>();
    private readonly ILogger<UpdateService> _logger = Substitute.For<ILogger<UpdateService>>();

    public UpdateServiceTests()
    {
        _settingsService.CurrentSettings.Returns(new AppSettings());
    }

    /// <summary>
    /// Creates an UpdateService with no UpdateManager (simulates dev/non-installed mode).
    /// The null UpdateManager means IsInstalled is always false.
    /// </summary>
    private UpdateService CreateSut()
    {
        // Pass no UpdateManager — the lazy factory will try to create one but
        // will fail gracefully (no VelopackApp.Build() in tests), returning null.
        // All operations will be no-ops since IsInstalled == false.
        return new UpdateService(_authService, _settingsService, _logger);
    }

    [Fact]
    public void CurrentVersion_WhenNotInstalled_ReturnsAssemblyVersion()
    {
        var sut = CreateSut();

        sut.CurrentVersion.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task CheckForUpdateAsync_WhenNotInstalled_ReturnsNull()
    {
        var sut = CreateSut();

        var result = await sut.CheckForUpdateAsync();

        result.Should().BeNull();
    }

    [Fact]
    public async Task CheckForUpdateAsync_WhenNotInstalled_DoesNotFireEvent()
    {
        var sut = CreateSut();
        bool eventFired = false;
        sut.UpdateAvailable += _ => eventFired = true;

        await sut.CheckForUpdateAsync();

        eventFired.Should().BeFalse();
    }

    [Fact]
    public async Task DownloadUpdateAsync_WhenNotInstalled_ReturnsImmediately()
    {
        var sut = CreateSut();

        await sut.DownloadUpdateAsync();

        sut.IsUpdateReady.Should().BeFalse();
    }

    [Fact]
    public async Task DownloadUpdateAsync_WhenNoPendingUpdate_DoesNotSetReady()
    {
        var sut = CreateSut();

        await sut.DownloadUpdateAsync();

        sut.IsUpdateReady.Should().BeFalse();
    }

    [Fact]
    public void ApplyUpdateAndRestart_WhenNotReady_DoesNothing()
    {
        var sut = CreateSut();

        // Should not throw
        sut.ApplyUpdateAndRestart();

        sut.IsUpdateReady.Should().BeFalse();
    }

    [Fact]
    public void StartPeriodicChecks_CanBeCalledMultipleTimes()
    {
        var sut = CreateSut();

        sut.StartPeriodicChecks();
        sut.StartPeriodicChecks(); // Should not throw (idempotent)

        sut.StopPeriodicChecks();
    }

    [Fact]
    public void StopPeriodicChecks_WhenNotStarted_DoesNotThrow()
    {
        var sut = CreateSut();

        sut.StopPeriodicChecks(); // Should not throw
    }

    [Fact]
    public void Dispose_StopsPeriodicChecks()
    {
        var sut = CreateSut();
        sut.StartPeriodicChecks();

        sut.Dispose();

        // Should not throw on double dispose
        sut.Dispose();
    }

    [Fact]
    public void IsUpdateReady_DefaultsFalse()
    {
        var sut = CreateSut();

        sut.IsUpdateReady.Should().BeFalse();
    }

    [Fact]
    public async Task DownloadUpdateAsync_WhenNotInstalled_DoesNotFireUpdateReadyEvent()
    {
        var sut = CreateSut();
        bool eventFired = false;
        sut.UpdateReady += () => eventFired = true;

        await sut.DownloadUpdateAsync();

        eventFired.Should().BeFalse();
    }

    [Fact]
    public async Task DownloadUpdateAsync_WhenNotInstalled_DoesNotFireProgressEvent()
    {
        var sut = CreateSut();
        bool eventFired = false;
        sut.DownloadProgress += _ => eventFired = true;

        await sut.DownloadUpdateAsync();

        eventFired.Should().BeFalse();
    }
}
