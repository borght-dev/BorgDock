using FluentAssertions;
using PRDock.App.Infrastructure;
using System.Windows.Documents;

namespace PRDock.Tests.Infrastructure;

public class MarkdownRendererTests
{
    private readonly MarkdownRenderer _renderer = new();

    [Fact]
    public void RenderInlines_PlainText_ReturnsRunWithText()
    {
        var inlines = _renderer.RenderInlines("Hello world").ToList();

        inlines.Should().HaveCount(1);
        inlines[0].Should().BeOfType<Run>();
        ((Run)inlines[0]).Text.Should().Contain("Hello world");
    }

    [Fact]
    public void RenderInlines_MarkdownBold_StripsHtmlTags()
    {
        var inlines = _renderer.RenderInlines("**bold text**").ToList();

        inlines.Should().HaveCount(1);
        inlines[0].Should().BeOfType<Run>();
        ((Run)inlines[0]).Text.Should().Contain("bold text");
    }

    [Fact]
    public void RenderInlines_EmptyString_ReturnsEmptyRun()
    {
        var inlines = _renderer.RenderInlines("").ToList();

        inlines.Should().HaveCount(1);
        inlines[0].Should().BeOfType<Run>();
    }

    [Fact]
    public void RenderInlines_Null_ReturnsEmptyRun()
    {
        var inlines = _renderer.RenderInlines(null!).ToList();

        inlines.Should().HaveCount(1);
        inlines[0].Should().BeOfType<Run>();
    }

    [Fact]
    public void RenderInlines_CodeBlock_StripsHtmlTags()
    {
        var inlines = _renderer.RenderInlines("`inline code`").ToList();

        inlines.Should().HaveCount(1);
        ((Run)inlines[0]).Text.Should().Contain("inline code");
    }

    [Fact]
    public void RenderInlines_HtmlEntities_AreDecoded()
    {
        var inlines = _renderer.RenderInlines("a &amp; b").ToList();

        inlines.Should().HaveCount(1);
        ((Run)inlines[0]).Text.Should().Contain("a & b");
    }

    [Fact]
    public void ImplementsIMarkdownRenderer()
    {
        var renderer = new MarkdownRenderer();
        renderer.Should().BeAssignableTo<IMarkdownRenderer>();
    }
}
