using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;

namespace PRDock.App.Converters;

/// <summary>
/// Returns a fixed PathGeometry arc for one of 4 ring segments.
/// ConverterParameter: 0=CI (top-right), 1=Reviews (bottom-right), 2=Conflicts (bottom-left), 3=Draft (top-left).
/// Uses the same ring geometry as ScoreToArcGeometryConverter: 38px canvas, radius 14, center (19,19).
/// 4 equal 82-degree segments with 8-degree gaps, starting at top (-90deg), clockwise.
/// </summary>
public sealed class SegmentArcConverter : IValueConverter
{
    private static readonly PathGeometry?[] _cache = new PathGeometry?[4];

    // Ring dimensions matching ScoreToArcGeometryConverter
    private const double Size = 38;
    private const double Radius = 14;
    private const double Cx = Size / 2;
    private const double Cy = Size / 2;
    private const double SegmentDegrees = 82;
    private const double GapDegrees = 8;

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (parameter is not string indexStr || !int.TryParse(indexStr, out int index))
            return Geometry.Empty;

        if (index < 0 || index > 3)
            return Geometry.Empty;

        return GetOrCreateGeometry(index);
    }

    private static PathGeometry GetOrCreateGeometry(int index)
    {
        if (_cache[index] is { } cached)
            return cached;

        // Starting angle for each segment (degrees from top, clockwise)
        // Gap/2 offset at the start of each segment
        double startDeg = -90.0 + index * (SegmentDegrees + GapDegrees) + GapDegrees / 2.0;
        double endDeg = startDeg + SegmentDegrees;

        double startRad = startDeg * Math.PI / 180.0;
        double endRad = endDeg * Math.PI / 180.0;

        var start = new System.Windows.Point(
            Cx + Radius * Math.Cos(startRad),
            Cy + Radius * Math.Sin(startRad));
        var end = new System.Windows.Point(
            Cx + Radius * Math.Cos(endRad),
            Cy + Radius * Math.Sin(endRad));

        bool isLargeArc = SegmentDegrees > 180;

        var figure = new PathFigure { StartPoint = start, IsClosed = false, IsFilled = false };
        figure.Segments.Add(new ArcSegment(
            end, new System.Windows.Size(Radius, Radius), 0, isLargeArc, SweepDirection.Clockwise, true));

        var geometry = new PathGeometry();
        geometry.Figures.Add(figure);
        geometry.Freeze();

        _cache[index] = geometry;
        return geometry;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
