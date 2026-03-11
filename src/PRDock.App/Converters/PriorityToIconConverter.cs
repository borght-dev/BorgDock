using System.Globalization;
using System.Windows.Data;

namespace PRDock.App.Converters;

public class PriorityToIconConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        if (value is not int priority)
            return "";

        return priority switch
        {
            1 => "\uE783",  // Critical - Segoe MDL2 "ImportantBadge12"
            2 => "\uE171",  // High - up arrow
            3 => "\uE10C",  // Medium - minus/dash
            4 => "\uE1FD",  // Low - down arrow
            _ => ""
        };
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotSupportedException();
    }
}
