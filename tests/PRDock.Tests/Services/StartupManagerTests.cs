using System.IO;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class StartupManagerTests : IDisposable
{
    private readonly string _tempDir;
    private readonly StartupManager _sut;

    public StartupManagerTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "PRDock_StartupTests_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);
        _sut = new StartupManager(_tempDir, Substitute.For<ILogger<StartupManager>>());
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, true);
    }

    [Fact]
    public void IsEnabled_NoShortcut_ReturnsFalse()
    {
        _sut.IsEnabled.Should().BeFalse();
    }

    [Fact]
    public void IsEnabled_ShortcutExists_ReturnsTrue()
    {
        // Create a dummy file to simulate the shortcut
        File.WriteAllText(Path.Combine(_tempDir, "PRDock.lnk"), "dummy");

        _sut.IsEnabled.Should().BeTrue();
    }

    [Fact]
    public void Enable_CreatesShortcutFile()
    {
        _sut.Enable();

        File.Exists(Path.Combine(_tempDir, "PRDock.lnk")).Should().BeTrue();
    }

    [Fact]
    public void Enable_CalledTwice_DoesNotThrow()
    {
        _sut.Enable();
        var act = () => _sut.Enable();

        act.Should().NotThrow();
    }

    [Fact]
    public void Disable_RemovesShortcut()
    {
        // Create a shortcut first
        _sut.Enable();
        _sut.IsEnabled.Should().BeTrue();

        _sut.Disable();

        _sut.IsEnabled.Should().BeFalse();
    }

    [Fact]
    public void Disable_NoShortcut_DoesNotThrow()
    {
        var act = () => _sut.Disable();

        act.Should().NotThrow();
    }

    [Fact]
    public void SyncWithSettings_True_EnablesShortcut()
    {
        _sut.SyncWithSettings(true);

        _sut.IsEnabled.Should().BeTrue();
    }

    [Fact]
    public void SyncWithSettings_False_DisablesShortcut()
    {
        _sut.Enable();

        _sut.SyncWithSettings(false);

        _sut.IsEnabled.Should().BeFalse();
    }

    [Fact]
    public void SyncWithSettings_FalseWhenNotEnabled_DoesNotThrow()
    {
        var act = () => _sut.SyncWithSettings(false);

        act.Should().NotThrow();
        _sut.IsEnabled.Should().BeFalse();
    }
}
