using System.Globalization;
using FluentAssertions;
using PRDock.App.Converters;

namespace PRDock.Tests.Converters;

public class SignalTooltipConverterTests
{
    private readonly SignalTooltipConverter _sut = new();

    [Theory]
    [InlineData("green", "CI Checks", "CI Checks: OK")]
    [InlineData("red", "CI Checks", "CI Checks: Blocked")]
    [InlineData("yellow", "Reviews", "Reviews: Pending")]
    [InlineData("gray", "Conflicts", "Conflicts: None")]
    public void Convert_ReturnsLabelWithStatus(string color, string label, string expected)
    {
        var result = _sut.Convert(color, typeof(string), label, CultureInfo.InvariantCulture);

        result.Should().Be(expected);
    }

    [Fact]
    public void Convert_NullColor_TreatsAsGray()
    {
        var result = _sut.Convert(null, typeof(string), "Draft", CultureInfo.InvariantCulture);

        result.Should().Be("Draft: None");
    }

    [Fact]
    public void Convert_NullParameter_UsesSignalLabel()
    {
        var result = _sut.Convert("green", typeof(string), null, CultureInfo.InvariantCulture);

        result.Should().Be("Signal: OK");
    }
}
