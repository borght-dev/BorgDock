using System.Globalization;
using System.Windows.Data;

namespace PRDock.App.Converters;

public class ExpanderArrowConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        return value is true ? "\u25BC" : "\u25B6";
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotSupportedException();
    }
}
