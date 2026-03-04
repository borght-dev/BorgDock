using System.Windows.Documents;
using Markdig;

namespace PRDock.App.Infrastructure;

public interface IMarkdownRenderer
{
    IEnumerable<Inline> RenderInlines(string markdown);
}

public class MarkdownRenderer : IMarkdownRenderer
{
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UseEmphasisExtras()
        .Build();

    public IEnumerable<Inline> RenderInlines(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return [new Run("")];

        var html = Markdig.Markdown.ToHtml(markdown, Pipeline);
        return ConvertHtmlToInlines(html);
    }

    private static IEnumerable<Inline> ConvertHtmlToInlines(string html)
    {
        // Strip HTML tags for a simple plain-text rendering in TextBlock inlines.
        var text = System.Text.RegularExpressions.Regex.Replace(html, "<[^>]+>", "");
        text = System.Net.WebUtility.HtmlDecode(text).Trim();

        if (string.IsNullOrEmpty(text))
            return [new Run("")];

        return [new Run(text)];
    }
}
