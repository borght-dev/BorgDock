using System.Globalization;
using System.Windows.Data;
using FluentAssertions;
using PRDock.App.Converters;

namespace PRDock.Tests.Converters;

public class StringEqualityConverterTests
{
    private readonly StringEqualityConverter _sut = new();

    [Fact]
    public void Convert_MatchingStrings_ReturnsTrue()
    {
        var result = _sut.Convert("right", typeof(bool), "right", CultureInfo.InvariantCulture);
        result.Should().Be(true);
    }

    [Fact]
    public void Convert_DifferentStrings_ReturnsFalse()
    {
        var result = _sut.Convert("right", typeof(bool), "left", CultureInfo.InvariantCulture);
        result.Should().Be(false);
    }

    [Fact]
    public void Convert_CaseInsensitive_ReturnsTrue()
    {
        var result = _sut.Convert("Right", typeof(bool), "right", CultureInfo.InvariantCulture);
        result.Should().Be(true);
    }

    [Fact]
    public void Convert_NullValue_ReturnsFalse()
    {
        var result = _sut.Convert(null, typeof(bool), "right", CultureInfo.InvariantCulture);
        result.Should().Be(false);
    }

    [Fact]
    public void ConvertBack_True_ReturnsParameter()
    {
        var result = _sut.ConvertBack(true, typeof(string), "left", CultureInfo.InvariantCulture);
        result.Should().Be("left");
    }

    [Fact]
    public void ConvertBack_False_ReturnsDoNothing()
    {
        var result = _sut.ConvertBack(false, typeof(string), "left", CultureInfo.InvariantCulture);
        result.Should().Be(System.Windows.Data.Binding.DoNothing);
    }
}
