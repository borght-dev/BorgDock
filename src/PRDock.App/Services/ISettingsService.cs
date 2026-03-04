using PRDock.App.Models;

namespace PRDock.App.Services;

public interface ISettingsService
{
    AppSettings CurrentSettings { get; }
    Task LoadAsync();
    Task SaveAsync(AppSettings settings);
    event Action<AppSettings>? SettingsChanged;
}
