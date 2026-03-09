using System.Globalization;
using System.Windows.Data;

namespace PRDock.App.Converters;

/// <summary>
/// Converts true → 180 (expanded, arrow points up) and false → 0 (collapsed, arrow points down).
/// </summary>
public sealed class BoolToAngleConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is true ? 180.0 : 0.0;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
