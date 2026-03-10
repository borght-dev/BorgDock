using System.Globalization;
using System.Windows.Data;

namespace PRDock.App.Converters;

/// <summary>
/// MultiValueConverter that builds a 4-line legend tooltip from signal color strings.
/// Binding order: CiSignalColor, ReviewSignalColor, ConflictSignalColor, DraftSignalColor.
/// </summary>
public sealed class RingLegendTooltipConverter : IMultiValueConverter
{
    private static readonly string[] Labels = ["CI Checks", "Reviews", "Conflicts", "Ready for Review"];

    public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
    {
        if (values.Length < 4)
            return "Merge readiness";

        var lines = new string[4];
        for (int i = 0; i < 4; i++)
        {
            var color = values[i] as string ?? "gray";
            var icon = color switch
            {
                "green" => "\u2705",           // white heavy check mark
                "red" => "\u274C",             // cross mark
                "yellow" => "\u23F3",          // hourglass
                _ => "\u2B1C"                  // white square
            };
            lines[i] = $"{icon}  {Labels[i]}";
        }

        return string.Join("\n", lines);
    }

    public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
