using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;
using WpfApplication = System.Windows.Application;

namespace PRDock.App.Converters;

/// <summary>
/// Converts author initials (e.g. "KB", "SC") to an avatar background color brush.
/// Uses theme-aware colors (different for dark/light themes).
/// </summary>
public sealed class InitialsToColorConverter : IValueConverter
{
    // Dark theme colors
    private static readonly Dictionary<string, string> DarkColors = new()
    {
        ["KB"] = "#63B3ED",
        ["SC"] = "#F6AD55",
        ["CD"] = "#A78BFA",
        ["TB"] = "#68D391",
    };

    // Light theme colors
    private static readonly Dictionary<string, string> LightColors = new()
    {
        ["KB"] = "#2563EB",
        ["SC"] = "#D97706",
        ["CD"] = "#7C3AED",
        ["TB"] = "#16A34A",
    };

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var initials = value as string ?? "";

        // Detect theme by checking background color
        bool isDark = true;
        if (WpfApplication.Current?.TryFindResource("BackgroundBrush") is SolidColorBrush bgBrush)
        {
            // If background is light (luminance > 0.5), use light colors
            var c = bgBrush.Color;
            var luminance = (0.299 * c.R + 0.587 * c.G + 0.114 * c.B) / 255.0;
            isDark = luminance < 0.5;
        }

        var colorMap = isDark ? DarkColors : LightColors;
        var fallback = isDark ? "#8B8FA3" : "#5A5F72";

        var hex = colorMap.GetValueOrDefault(initials, fallback);
        return new SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(hex));
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
