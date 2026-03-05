using System.Windows;
using System.Windows.Documents;
using System.Windows.Media;
using Markdig;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;
using WpfInline = System.Windows.Documents.Inline;
using WpfBlock = System.Windows.Documents.Block;
using Application = System.Windows.Application;
using Brush = System.Windows.Media.Brush;
using Brushes = System.Windows.Media.Brushes;
using Color = System.Windows.Media.Color;
using FontFamily = System.Windows.Media.FontFamily;

namespace PRDock.App.Infrastructure;

public interface IMarkdownRenderer
{
    IEnumerable<WpfInline> RenderInlines(string markdown);
    IEnumerable<WpfBlock> RenderBlocks(string markdown);
}

public class MarkdownRenderer : IMarkdownRenderer
{
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UseEmphasisExtras()
        .UseTaskLists()
        .Build();

    public IEnumerable<WpfInline> RenderInlines(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return [new Run("")];

        var doc = Markdig.Markdown.Parse(markdown, Pipeline);
        var inlines = new List<WpfInline>();
        foreach (var block in doc)
        {
            if (inlines.Count > 0)
                inlines.Add(new LineBreak());
            inlines.AddRange(RenderBlockInlines(block));
        }
        return inlines.Count > 0 ? inlines : [new Run("")];
    }

    public IEnumerable<WpfBlock> RenderBlocks(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return [new Paragraph(new Run(""))];

        try
        {
            var doc = Markdig.Markdown.Parse(markdown, Pipeline);
            var blocks = new List<WpfBlock>();
            foreach (var block in doc)
                blocks.Add(ConvertBlock(block));
            return blocks.Count > 0 ? blocks : [new Paragraph(new Run(""))];
        }
        catch
        {
            // Fallback to plain text
            return [new Paragraph(new Run(markdown))];
        }
    }

    private static WpfBlock ConvertBlock(MarkdownObject block)
    {
        switch (block)
        {
            case HeadingBlock heading:
                var hPara = new Paragraph { Margin = new Thickness(0, 8, 0, 4) };
                hPara.FontWeight = FontWeights.Bold;
                hPara.FontSize = heading.Level switch
                {
                    1 => 20,
                    2 => 17,
                    3 => 15,
                    _ => 14
                };
                AddInlines(hPara.Inlines, heading.Inline);
                return hPara;

            case ParagraphBlock para:
                var p = new Paragraph { Margin = new Thickness(0, 0, 0, 8) };
                AddInlines(p.Inlines, para.Inline);
                return p;

            case FencedCodeBlock fenced:
                var codeText = fenced.Lines.ToString().TrimEnd();
                var codePara = new Paragraph(new Run(codeText)
                {
                    FontFamily = new FontFamily("Consolas, Courier New"),
                    FontSize = 12
                })
                {
                    Margin = new Thickness(0, 4, 0, 8),
                    Padding = new Thickness(10, 8, 10, 8),
                    Background = (Brush?)Application.Current?.TryFindResource("CodeBlockBgBrush")
                        ?? new SolidColorBrush(Color.FromRgb(0x0D, 0x11, 0x17)),
                    BorderBrush = (Brush?)Application.Current?.TryFindResource("SubtleBorderBrush")
                        ?? Brushes.Gray,
                    BorderThickness = new Thickness(1)
                };
                return codePara;

            case CodeBlock code:
                var cbText = code.Lines.ToString().TrimEnd();
                return new Paragraph(new Run(cbText)
                {
                    FontFamily = new FontFamily("Consolas, Courier New"),
                    FontSize = 12
                })
                {
                    Margin = new Thickness(0, 4, 0, 8),
                    Padding = new Thickness(10, 8, 10, 8),
                    Background = (Brush?)Application.Current?.TryFindResource("CodeBlockBgBrush")
                        ?? new SolidColorBrush(Color.FromRgb(0x0D, 0x11, 0x17))
                };

            case ListBlock list:
                var wpfList = new List
                {
                    MarkerStyle = list.IsOrdered ? TextMarkerStyle.Decimal : TextMarkerStyle.Disc,
                    Margin = new Thickness(0, 0, 0, 8),
                    Padding = new Thickness(20, 0, 0, 0)
                };
                foreach (var item in list)
                {
                    if (item is ListItemBlock listItem)
                    {
                        var li = new ListItem();
                        foreach (var child in listItem)
                            li.Blocks.Add(ConvertBlock(child));
                        wpfList.ListItems.Add(li);
                    }
                }
                return wpfList;

            case ThematicBreakBlock:
                return new Paragraph(new Run(""))
                {
                    BorderBrush = (Brush?)Application.Current?.TryFindResource("SeparatorBrush") ?? Brushes.Gray,
                    BorderThickness = new Thickness(0, 0, 0, 1),
                    Margin = new Thickness(0, 4, 0, 8)
                };

            case QuoteBlock quote:
                var section = new Section
                {
                    BorderBrush = (Brush?)Application.Current?.TryFindResource("AccentBrush") ?? Brushes.CornflowerBlue,
                    BorderThickness = new Thickness(3, 0, 0, 0),
                    Padding = new Thickness(12, 0, 0, 0),
                    Margin = new Thickness(0, 0, 0, 8)
                };
                foreach (var child in quote)
                    section.Blocks.Add(ConvertBlock(child));
                return section;

            default:
                // Fallback: render as plain text paragraph
                var fallback = new Paragraph { Margin = new Thickness(0, 0, 0, 8) };
                if (block is LeafBlock leaf && leaf.Inline is not null)
                    AddInlines(fallback.Inlines, leaf.Inline);
                else
                    fallback.Inlines.Add(new Run(block.ToString() ?? ""));
                return fallback;
        }
    }

    private static void AddInlines(InlineCollection target, ContainerInline? container)
    {
        if (container is null) return;

        foreach (var inline in container)
            target.Add(ConvertInline(inline));
    }

    private static WpfInline ConvertInline(Markdig.Syntax.Inlines.Inline mdInline)
    {
        switch (mdInline)
        {
            case LiteralInline literal:
                return new Run(literal.Content.ToString());

            case EmphasisInline emphasis:
                var span = new Span();
                if (emphasis.DelimiterCount >= 2)
                    span.FontWeight = FontWeights.Bold;
                else
                    span.FontStyle = FontStyles.Italic;
                foreach (var child in emphasis)
                    span.Inlines.Add(ConvertInline(child));
                return span;

            case CodeInline code:
                return new Run(code.Content)
                {
                    FontFamily = new FontFamily("Consolas, Courier New"),
                    Background = (Brush?)Application.Current?.TryFindResource("CodeBlockBgBrush")
                        ?? new SolidColorBrush(Color.FromRgb(0x0D, 0x11, 0x17)),
                    FontSize = 12
                };

            case LinkInline link:
                if (link.Url is not null)
                {
                    try
                    {
                        var hyperlink = new Hyperlink { NavigateUri = new Uri(link.Url, UriKind.RelativeOrAbsolute) };
                        hyperlink.RequestNavigate += (_, e) =>
                        {
                            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                            {
                                FileName = e.Uri.AbsoluteUri,
                                UseShellExecute = true
                            });
                            e.Handled = true;
                        };
                        foreach (var child in link)
                            hyperlink.Inlines.Add(ConvertInline(child));
                        if (hyperlink.Inlines.Count == 0)
                            hyperlink.Inlines.Add(new Run(link.Url));
                        return hyperlink;
                    }
                    catch
                    {
                        // Bad URI — fall through to plain text
                    }
                }
                var linkSpan = new Span();
                foreach (var child in link)
                    linkSpan.Inlines.Add(ConvertInline(child));
                return linkSpan;

            case LineBreakInline:
                return new LineBreak();

            case HtmlEntityInline entity:
                return new Run(entity.Transcoded.ToString());

            case HtmlInline html:
                return new Run(html.Tag ?? "");

            case ContainerInline container:
                var cSpan = new Span();
                foreach (var child in container)
                    cSpan.Inlines.Add(ConvertInline(child));
                return cSpan;

            default:
                return new Run(mdInline.ToString() ?? "");
        }
    }

    private static IEnumerable<WpfInline> RenderBlockInlines(MarkdownObject block)
    {
        if (block is LeafBlock leaf && leaf.Inline is not null)
        {
            var inlines = new List<WpfInline>();
            foreach (var inline in leaf.Inline)
                inlines.Add(ConvertInline(inline));
            return inlines;
        }
        return [new Run(block.ToString() ?? "")];
    }
}
