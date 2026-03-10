using System.Globalization;
using FluentAssertions;
using PRDock.App.Converters;

namespace PRDock.Tests.Converters;

public class RingLegendTooltipConverterTests
{
    private readonly RingLegendTooltipConverter _sut = new();

    [Fact]
    public void Convert_AllGreen_ShowsCheckMarksForAll()
    {
        var result = _sut.Convert(
            ["green", "green", "green", "green"],
            typeof(string), null!, CultureInfo.InvariantCulture) as string;

        result.Should().Contain("\u2705");
        result.Should().Contain("CI Checks");
        result.Should().Contain("Reviews");
        result.Should().Contain("Conflicts");
        result.Should().Contain("Ready for Review");
    }

    [Fact]
    public void Convert_MixedColors_ShowsCorrectIcons()
    {
        var result = _sut.Convert(
            ["red", "yellow", "green", "gray"],
            typeof(string), null!, CultureInfo.InvariantCulture) as string;

        var lines = result!.Split('\n');
        lines.Should().HaveCount(4);
        lines[0].Should().Contain("\u274C").And.Contain("CI Checks");      // red = cross
        lines[1].Should().Contain("\u23F3").And.Contain("Reviews");        // yellow = hourglass
        lines[2].Should().Contain("\u2705").And.Contain("Conflicts");      // green = check
        lines[3].Should().Contain("\u2B1C").And.Contain("Ready for Review"); // gray = white square
    }

    [Fact]
    public void Convert_TooFewValues_ReturnsFallback()
    {
        var result = _sut.Convert(
            ["green", "red"],
            typeof(string), null!, CultureInfo.InvariantCulture) as string;

        result.Should().Be("Merge readiness");
    }
}
