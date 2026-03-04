using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace PRDock.App.Converters;

public class StatusToColorConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var color = value as string;
        return color switch
        {
            "green" => new SolidColorBrush(ColorFromHex("#22C55E")),
            "red" => new SolidColorBrush(ColorFromHex("#EF4444")),
            "yellow" => new SolidColorBrush(ColorFromHex("#F59E0B")),
            _ => new SolidColorBrush(ColorFromHex("#9CA3AF")),
        };
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
    {
        throw new NotSupportedException();
    }

    private static System.Windows.Media.Color ColorFromHex(string hex)
    {
        return (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(hex);
    }
}
