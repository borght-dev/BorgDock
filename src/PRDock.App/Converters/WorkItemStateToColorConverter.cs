using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace PRDock.App.Converters;

public class WorkItemStateToColorConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var state = (value as string)?.ToLowerInvariant();

        return state switch
        {
            "new" => ColorFromHex("#4FC3F7"),          // light blue
            "active" or "committed" or "in progress"
                => ColorFromHex("#42A5F5"),            // blue
            "resolved" or "done" or "closed"
                => ColorFromHex("#66BB6A"),            // green
            "removed" => ColorFromHex("#9E9E9E"),      // gray
            _ => ColorFromHex("#FFA726"),              // orange for unknown
        };
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotSupportedException();
    }

    private static SolidColorBrush ColorFromHex(string hex)
    {
        var color = (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(hex);
        return new SolidColorBrush(color);
    }
}
