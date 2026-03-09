using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace PRDock.App.Converters;

/// <summary>
/// Converts (Width, Height) to a Rect for clipping borders with rounded corners.
/// </summary>
public sealed class SizeToRectConverter : IMultiValueConverter
{
    public static readonly SizeToRectConverter Instance = new();

    public object Convert(object[] values, Type targetType, object parameter, CultureInfo culture)
    {
        if (values.Length == 2
            && values[0] is double width
            && values[1] is double height
            && !double.IsNaN(width)
            && !double.IsNaN(height))
        {
            return new Rect(0, 0, width, height);
        }

        return new Rect();
    }

    public object[] ConvertBack(object value, Type[] targetTypes, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
