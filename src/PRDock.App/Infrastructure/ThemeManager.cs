using System.Windows;
using Microsoft.Win32;
using WpfApplication = System.Windows.Application;

namespace PRDock.App.Infrastructure;

public sealed class ThemeManager : IDisposable
{
    private const string ThemeRegistryKeyPath =
        @"SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize";
    private const string ThemeRegistryValueName = "AppsUseLightTheme";

    private static readonly Uri LightThemeUri =
        new("pack://application:,,,/Resources/Themes/LightTheme.xaml", UriKind.Absolute);
    private static readonly Uri DarkThemeUri =
        new("pack://application:,,,/Resources/Themes/DarkTheme.xaml", UriKind.Absolute);

    private readonly WpfApplication _application;
    private ResourceDictionary? _currentThemeDictionary;
    private string _mode = "system";
    private bool _disposed;

    public static ThemeManager? Instance { get; private set; }

    public string CurrentTheme { get; private set; } = "light";

    public event Action<string>? ThemeChanged;

    public ThemeManager(WpfApplication application)
    {
        _application = application ?? throw new ArgumentNullException(nameof(application));
        Instance = this;
    }

    public void ApplyTheme(string mode)
    {
        _mode = mode.ToLowerInvariant() switch
        {
            "dark" or "light" or "system" => mode.ToLowerInvariant(),
            _ => throw new ArgumentException($"Invalid theme mode: '{mode}'. Expected 'system', 'dark', or 'light'.", nameof(mode))
        };

        if (_mode == "system")
        {
            SystemEvents.UserPreferenceChanged += OnUserPreferenceChanged;
            ApplyResolvedTheme(DetectSystemTheme());
        }
        else
        {
            SystemEvents.UserPreferenceChanged -= OnUserPreferenceChanged;
            ApplyResolvedTheme(_mode);
        }
    }

    private void ApplyResolvedTheme(string theme)
    {
        if (theme == CurrentTheme && _currentThemeDictionary is not null)
        {
            return;
        }

        var uri = theme == "dark" ? DarkThemeUri : LightThemeUri;
        var newDictionary = new ResourceDictionary { Source = uri };

        var mergedDictionaries = _application.Resources.MergedDictionaries;

        if (_currentThemeDictionary is not null)
        {
            mergedDictionaries.Remove(_currentThemeDictionary);
        }

        mergedDictionaries.Add(newDictionary);
        _currentThemeDictionary = newDictionary;
        CurrentTheme = theme;

        ThemeChanged?.Invoke(theme);
    }

    private static string DetectSystemTheme()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(ThemeRegistryKeyPath);
            var value = key?.GetValue(ThemeRegistryValueName);

            if (value is int intValue)
            {
                return intValue == 0 ? "dark" : "light";
            }
        }
        catch
        {
            // Fall back to light if registry read fails.
        }

        return "light";
    }

    private void OnUserPreferenceChanged(object sender, UserPreferenceChangedEventArgs e)
    {
        if (e.Category != UserPreferenceCategory.General)
        {
            return;
        }

        if (_mode != "system")
        {
            return;
        }

        var resolved = DetectSystemTheme();

        if (_application.Dispatcher.CheckAccess())
        {
            ApplyResolvedTheme(resolved);
        }
        else
        {
            _application.Dispatcher.Invoke(() => ApplyResolvedTheme(resolved));
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        SystemEvents.UserPreferenceChanged -= OnUserPreferenceChanged;
        _disposed = true;
    }
}
