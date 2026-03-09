namespace PRDock.App.Services;

public interface IStartupManager
{
    bool IsEnabled { get; }
    void Enable();
    void Disable();
    void SyncWithSettings(bool runAtStartup);
}
