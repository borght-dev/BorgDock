using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace PRDock.App.Converters;

public class StatusToColorConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var color = value as string;
        var app = System.Windows.Application.Current;

        return color switch
        {
            "green" => app?.TryFindResource("StatusGreenBrush") as SolidColorBrush
                       ?? new SolidColorBrush(ColorFromHex("#34D399")),
            "red" => app?.TryFindResource("StatusRedBrush") as SolidColorBrush
                     ?? new SolidColorBrush(ColorFromHex("#F87171")),
            "yellow" => app?.TryFindResource("StatusYellowBrush") as SolidColorBrush
                        ?? new SolidColorBrush(ColorFromHex("#F59E0B")),
            _ => app?.TryFindResource("StatusGrayBrush") as SolidColorBrush
                 ?? new SolidColorBrush(ColorFromHex("#5A5E6A")),
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
