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
    public void RenderInlines_MarkdownBold_ReturnsBoldSpan()
    {
        var inlines = _renderer.RenderInlines("**bold text**").ToList();

        inlines.Should().HaveCount(1);
        inlines[0].Should().BeOfType<Span>();
        var span = (Span)inlines[0];
        span.FontWeight.Should().Be(System.Windows.FontWeights.Bold);
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

        // Markdig parses "a &amp; b" as multiple literal inlines
        var allText = string.Concat(inlines.OfType<Run>().Select(r => r.Text));
        allText.Should().Contain("a & b");
    }

    [Fact]
    public void ImplementsIMarkdownRenderer()
    {
        var renderer = new MarkdownRenderer();
        renderer.Should().BeAssignableTo<IMarkdownRenderer>();
    }

    [Fact]
    public void RenderBlocks_SimpleTable_ReturnsTableBlock()
    {
        var md = "| A | B |\n|---|---|\n| 1 | 2 |";
        var blocks = _renderer.RenderBlocks(md).ToList();

        blocks.Should().ContainSingle()
            .Which.Should().BeOfType<Table>();
    }

    [Fact]
    public void RenderBlocks_TableAfterParagraphNoBlankLine_ReturnsTableBlock()
    {
        var md = "**Related file changes:**\n| File | Change Type |\n|------|-------------|\n| foo.cs | Modified |";
        var blocks = _renderer.RenderBlocks(md).ToList();

        blocks.Should().HaveCount(2);
        blocks[1].Should().BeOfType<Table>();
    }

    [Fact]
    public void RenderBlocks_TableAfterParagraphWithBlankLine_ReturnsTableBlock()
    {
        var md = "**Related file changes:**\n\n| File | Change Type |\n|------|-------------|\n| foo.cs | Modified |";
        var blocks = _renderer.RenderBlocks(md).ToList();

        blocks.Should().HaveCount(2);
        blocks[1].Should().BeOfType<Table>();
    }
}
