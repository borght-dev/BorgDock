using Markdig;

namespace PRDock.App.Infrastructure;

public static class HtmlFieldRenderer
{
    private static readonly MarkdownPipeline MarkdownPipeline = new MarkdownPipelineBuilder()
        .UseAdvancedExtensions()
        .Build();

    /// <summary>
    /// Detects if content is HTML or markdown and wraps it in a themed HTML document.
    /// </summary>
    public static string WrapHtml(string? htmlContent, bool isDarkTheme)
    {
        if (string.IsNullOrWhiteSpace(htmlContent))
            return WrapHtml("<em style='opacity:0.5'>No content</em>", isDarkTheme);

        // Detect if content is markdown (no HTML tags) vs actual HTML
        if (!ContainsHtmlTags(htmlContent))
            htmlContent = Markdown.ToHtml(htmlContent, MarkdownPipeline);

        var bg = isDarkTheme ? "#0D0F17" : "#FFFFFF";
        var text = isDarkTheme ? "#E2E4EA" : "#1A1D26";
        var muted = isDarkTheme ? "#5A5E6A" : "#7A7F92";
        var link = isDarkTheme ? "#63B3ED" : "#2563EB";
        var codeBg = isDarkTheme ? "#0A0C14" : "#F4F5F7";
        var border = isDarkTheme ? "#1A1E24" : "#E0E0E0";

        return $$"""
        <!DOCTYPE html>
        <html><head><meta charset="UTF-8">
        <style>
            * { box-sizing: border-box; }
            body {
                background: {{bg}}; color: {{text}};
                font-family: 'Segoe UI', sans-serif;
                font-size: 13px; line-height: 1.6;
                margin: 0; padding: 10px 12px;
                word-wrap: break-word; overflow-wrap: break-word;
            }
            a { color: {{link}}; text-decoration: none; }
            a:hover { text-decoration: underline; }
            img { max-width: 100%; height: auto; border-radius: 4px; margin: 4px 0; }
            pre, code {
                background: {{codeBg}}; border-radius: 3px;
                font-family: 'Cascadia Code', 'Consolas', monospace;
                font-size: 12px;
            }
            code { padding: 1px 4px; }
            pre { padding: 8px 10px; overflow-x: auto; }
            pre code { padding: 0; background: none; }
            table { border-collapse: collapse; width: 100%; margin: 6px 0; }
            td, th {
                border: 1px solid {{border}}; padding: 4px 8px;
                text-align: left; font-size: 12px;
            }
            th { background: {{codeBg}}; font-weight: 600; }
            blockquote {
                margin: 6px 0; padding: 4px 12px;
                border-left: 3px solid {{link}};
                color: {{muted}};
            }
            ul, ol { padding-left: 20px; margin: 4px 0; }
            li { margin: 2px 0; }
            h1, h2, h3, h4 { margin: 10px 0 4px; }
            hr { border: none; border-top: 1px solid {{border}}; margin: 8px 0; }
            p { margin: 4px 0; }
        </style></head>
        <body>{{htmlContent}}</body></html>
        """;
    }

    /// <summary>
    /// Simple heuristic: if the content contains any HTML tags, treat it as HTML.
    /// Otherwise treat it as markdown and convert.
    /// </summary>
    private static bool ContainsHtmlTags(string content)
    {
        // Look for common HTML tags
        return content.Contains("<div", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<p>", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<p ", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<br", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<img", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<span", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<table", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<ul", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<ol", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<h1", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<h2", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<h3", StringComparison.OrdinalIgnoreCase)
            || content.Contains("<a ", StringComparison.OrdinalIgnoreCase)
            || content.Contains("&lt;", StringComparison.Ordinal)
            || content.Contains("&amp;", StringComparison.Ordinal);
    }
}
