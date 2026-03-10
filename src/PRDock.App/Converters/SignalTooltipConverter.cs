using System.Globalization;
using System.Windows.Data;

namespace PRDock.App.Converters;

/// <summary>
/// Converts a signal color string to a human-readable tooltip.
/// ConverterParameter is the signal label (e.g. "CI Checks").
/// </summary>
public sealed class SignalTooltipConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var color = value as string ?? "gray";
        var label = parameter as string ?? "Signal";

        var status = color switch
        {
            "green" => "OK",
            "red" => "Blocked",
            "yellow" => "Pending",
            _ => "None"
        };

        return $"{label}: {status}";
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
