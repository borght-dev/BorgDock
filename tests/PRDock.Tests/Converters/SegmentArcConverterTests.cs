using System.Globalization;
using System.Windows.Media;
using FluentAssertions;
using PRDock.App.Converters;

namespace PRDock.Tests.Converters;

public class SegmentArcConverterTests
{
    private readonly SegmentArcConverter _sut = new();

    [Theory]
    [InlineData("0")]
    [InlineData("1")]
    [InlineData("2")]
    [InlineData("3")]
    public void Convert_ValidIndex_ReturnsPathGeometry(string index)
    {
        var result = _sut.Convert("green", typeof(object), index, CultureInfo.InvariantCulture);

        result.Should().BeOfType<PathGeometry>();
        var geo = (PathGeometry)result;
        geo.Figures.Should().HaveCount(1);
    }

    [Fact]
    public void Convert_InvalidIndex_ReturnsEmpty()
    {
        var result = _sut.Convert("green", typeof(object), "5", CultureInfo.InvariantCulture);

        result.Should().Be(Geometry.Empty);
    }

    [Fact]
    public void Convert_NegativeIndex_ReturnsEmpty()
    {
        var result = _sut.Convert("green", typeof(object), "-1", CultureInfo.InvariantCulture);

        result.Should().Be(Geometry.Empty);
    }

    [Fact]
    public void Convert_NullParameter_ReturnsEmpty()
    {
        var result = _sut.Convert("green", typeof(object), null, CultureInfo.InvariantCulture);

        result.Should().Be(Geometry.Empty);
    }

    [Fact]
    public void Convert_NonNumericParameter_ReturnsEmpty()
    {
        var result = _sut.Convert("green", typeof(object), "abc", CultureInfo.InvariantCulture);

        result.Should().Be(Geometry.Empty);
    }

    [Fact]
    public void Convert_SameIndex_ReturnsCachedGeometry()
    {
        var result1 = _sut.Convert("green", typeof(object), "0", CultureInfo.InvariantCulture);
        var result2 = _sut.Convert("red", typeof(object), "0", CultureInfo.InvariantCulture);

        result1.Should().BeSameAs(result2);
    }

    [Fact]
    public void Convert_DifferentIndices_ReturnDifferentGeometries()
    {
        var result0 = _sut.Convert("green", typeof(object), "0", CultureInfo.InvariantCulture);
        var result1 = _sut.Convert("green", typeof(object), "1", CultureInfo.InvariantCulture);

        result0.Should().NotBeSameAs(result1);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("1")]
    [InlineData("2")]
    [InlineData("3")]
    public void Convert_AllSegments_ReturnFrozenGeometry(string index)
    {
        var result = _sut.Convert("green", typeof(object), index, CultureInfo.InvariantCulture);

        var geo = result.Should().BeOfType<PathGeometry>().Subject;
        geo.IsFrozen.Should().BeTrue();
    }
}
