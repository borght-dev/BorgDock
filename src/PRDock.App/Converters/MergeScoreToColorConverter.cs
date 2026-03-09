using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;
using WpfApplication = System.Windows.Application;

namespace PRDock.App.Converters;

public sealed class MergeScoreToColorConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var score = value is int s ? s : 0;

        string resourceKey;
        string fallbackHex;

        if (score >= 80)
        {
            resourceKey = "StatusGreenBrush";
            fallbackHex = "#34D399";
        }
        else if (score >= 50)
        {
            resourceKey = "StatusYellowBrush";
            fallbackHex = "#FBBF24";
        }
        else
        {
            resourceKey = "StatusRedBrush";
            fallbackHex = "#F87171";
        }

        if (WpfApplication.Current?.TryFindResource(resourceKey) is SolidColorBrush brush)
            return brush;

        return new SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(fallbackHex));
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
