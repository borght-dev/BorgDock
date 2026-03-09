using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace PRDock.App.Converters;

public sealed class ScoreToArcGeometryConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var score = value is int s ? s : 0;
        if (score <= 0) return Geometry.Empty;

        // Ring dimensions: 38px total, radius = 38 * 0.368 ≈ 14
        double size = 38;
        double radius = 14;
        double cx = size / 2;
        double cy = size / 2;

        if (score >= 100)
        {
            // Full circle — use EllipseGeometry
            return new EllipseGeometry(new System.Windows.Point(cx, cy), radius, radius);
        }

        double angle = (score / 100.0) * 360.0;
        double startAngleRad = -90.0 * Math.PI / 180.0; // top
        double endAngleRad = (-90.0 + angle) * Math.PI / 180.0;

        var start = new System.Windows.Point(
            cx + radius * Math.Cos(startAngleRad),
            cy + radius * Math.Sin(startAngleRad));
        var end = new System.Windows.Point(
            cx + radius * Math.Cos(endAngleRad),
            cy + radius * Math.Sin(endAngleRad));

        bool isLargeArc = angle > 180;

        var figure = new PathFigure { StartPoint = start, IsClosed = false, IsFilled = false };
        figure.Segments.Add(new ArcSegment(
            end, new System.Windows.Size(radius, radius), 0, isLargeArc, SweepDirection.Clockwise, true));

        var geometry = new PathGeometry();
        geometry.Figures.Add(figure);
        return geometry;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
