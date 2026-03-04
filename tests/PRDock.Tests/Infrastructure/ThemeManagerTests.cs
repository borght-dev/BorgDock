using FluentAssertions;
using PRDock.App.Infrastructure;

namespace PRDock.Tests.Infrastructure;

public class ThemeManagerTests
{
    [Fact]
    public void Constructor_WithNullApplication_ThrowsArgumentNullException()
    {
        var act = () => new ThemeManager(null!);

        act.Should().Throw<ArgumentNullException>()
            .Which.ParamName.Should().Be("application");
    }

    [Fact]
    public void Constructor_WithNullApplication_ExceptionMessageContainsParameterName()
    {
        var act = () => new ThemeManager(null!);

        act.Should().Throw<ArgumentNullException>()
            .And.Message.Should().Contain("application");
    }
}
