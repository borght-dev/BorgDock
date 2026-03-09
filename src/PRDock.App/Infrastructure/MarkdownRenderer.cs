using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Documents;
using System.Windows.Media;
using Markdig;
using Markdig.Extensions.Tables;
using Markdig.Extensions.TaskLists;
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
        .UsePipeTables()
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

                // Add bottom border for h1 and h2 (like GitHub)
                if (heading.Level <= 2)
                {
                    hPara.Margin = new Thickness(0, 12, 0, 0);
                    hPara.BorderBrush = ResolveBrush("SeparatorBrush", Brushes.Gray);
                    hPara.BorderThickness = new Thickness(0, 0, 0, 1);
                    hPara.Padding = new Thickness(0, 0, 0, 6);
                }

                return hPara;

            case ParagraphBlock para:
                var p = new Paragraph { Margin = new Thickness(0, 0, 0, 8) };
                AddInlines(p.Inlines, para.Inline);
                return p;

            case FencedCodeBlock fenced:
                var codeText = fenced.Lines.ToString().TrimEnd();
                var lang = fenced.Info?.Trim().ToLowerInvariant() ?? "";
                return BuildCodeBlock(codeText, lang);

            case CodeBlock code:
                var cbText = code.Lines.ToString().TrimEnd();
                return BuildCodeBlock(cbText, "");

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
                    BorderBrush = ResolveBrush("SeparatorBrush", Brushes.Gray),
                    BorderThickness = new Thickness(0, 0, 0, 1),
                    Margin = new Thickness(0, 4, 0, 8)
                };

            case QuoteBlock quote:
                var section = new Section
                {
                    BorderBrush = ResolveBrush("AccentBrush", Brushes.CornflowerBlue),
                    BorderThickness = new Thickness(3, 0, 0, 0),
                    Padding = new Thickness(12, 0, 0, 0),
                    Margin = new Thickness(0, 0, 0, 8)
                };
                foreach (var child in quote)
                    section.Blocks.Add(ConvertBlock(child));
                return section;

            case Table mdTable:
                return ConvertTable(mdTable);

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

    private static Paragraph BuildCodeBlock(string codeText, string lang)
    {
        var codePara = new Paragraph
        {
            Margin = new Thickness(0, 4, 0, 8),
            Padding = new Thickness(10, 8, 10, 8),
            Background = ResolveBrush("CodeBlockBgBrush",
                new SolidColorBrush(Color.FromRgb(0x0D, 0x11, 0x17))),
            BorderBrush = ResolveBrush("SubtleBorderBrush", Brushes.Gray),
            BorderThickness = new Thickness(1)
        };

        var codeFont = new FontFamily("Consolas, Courier New");
        var tokens = SyntaxHighlighter.Tokenize(codeText, lang);

        foreach (var token in tokens)
        {
            var brush = token.Kind switch
            {
                TokenKind.Keyword => ResolveBrush("SyntaxKeywordBrush", Brushes.MediumPurple),
                TokenKind.String => ResolveBrush("SyntaxStringBrush", Brushes.Green),
                TokenKind.Comment => ResolveBrush("SyntaxCommentBrush", Brushes.Gray),
                TokenKind.Number => ResolveBrush("SyntaxNumberBrush", Brushes.DarkOrange),
                TokenKind.Type => ResolveBrush("SyntaxTypeBrush", Brushes.Goldenrod),
                _ => ResolveBrush("SyntaxPlainBrush", Brushes.White)
            };

            codePara.Inlines.Add(new Run(token.Text)
            {
                FontFamily = codeFont,
                FontSize = 12,
                Foreground = brush
            });
        }

        return codePara;
    }

    private static Brush ResolveBrush(string key, Brush fallback) =>
        (Brush?)Application.Current?.TryFindResource(key) ?? fallback;

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
                    Background = ResolveBrush("CodeBlockBgBrush",
                        new SolidColorBrush(Color.FromRgb(0x0D, 0x11, 0x17))),
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

            case TaskList task:
                return new Run(task.Checked ? "\u2611 " : "\u2610 ");

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

internal enum TokenKind { Plain, Keyword, String, Comment, Number, Type }

internal readonly record struct SyntaxToken(string Text, TokenKind Kind);

internal static partial class SyntaxHighlighter
{
    // Regex-based tokenizer: order matters — first match wins
    [GeneratedRegex(
        @"(?<comment>//[^\n]*|/\*[\s\S]*?\*/)" +
        @"|(?<string>""(?:[^""\\]|\\.)*""|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)" +
        @"|(?<number>\b\d+(?:\.\d+)?\b)" +
        @"|(?<word>\b[A-Za-z_]\w*\b)" +
        @"|(?<other>[^\s\w]+|\s+)",
        RegexOptions.Compiled)]
    private static partial Regex TokenRegex();

    private static readonly HashSet<string> JsKeywords = new(StringComparer.Ordinal)
    {
        "abstract", "async", "await", "break", "case", "catch", "class", "const",
        "continue", "debugger", "default", "delete", "do", "else", "enum", "export",
        "extends", "finally", "for", "from", "function", "if", "implements", "import",
        "in", "instanceof", "interface", "let", "new", "of", "package", "private",
        "protected", "public", "return", "static", "super", "switch", "this", "throw",
        "try", "typeof", "var", "void", "while", "with", "yield",
        "true", "false", "null", "undefined"
    };

    private static readonly HashSet<string> CsKeywords = new(StringComparer.Ordinal)
    {
        "abstract", "as", "async", "await", "base", "bool", "break", "byte", "case",
        "catch", "char", "checked", "class", "const", "continue", "decimal", "default",
        "delegate", "do", "double", "else", "enum", "event", "explicit", "extern",
        "false", "finally", "fixed", "float", "for", "foreach", "goto", "if", "implicit",
        "in", "int", "interface", "internal", "is", "lock", "long", "namespace", "new",
        "null", "object", "operator", "out", "override", "params", "partial", "private",
        "protected", "public", "readonly", "record", "ref", "return", "sbyte", "sealed",
        "short", "sizeof", "stackalloc", "static", "string", "struct", "switch", "this",
        "throw", "true", "try", "typeof", "uint", "ulong", "unchecked", "unsafe",
        "ushort", "using", "var", "virtual", "void", "volatile", "while", "yield",
        "where", "when", "required", "init", "get", "set", "value", "global"
    };

    private static readonly HashSet<string> JsTypes = new(StringComparer.Ordinal)
    {
        "Array", "Boolean", "Date", "Error", "Function", "Map", "Number", "Object",
        "Promise", "Proxy", "RegExp", "Set", "String", "Symbol", "WeakMap", "WeakSet",
        "ReactNode", "JSX", "HTMLElement", "Event", "Response", "Request"
    };

    private static readonly HashSet<string> CsTypes = new(StringComparer.Ordinal)
    {
        "Task", "List", "Dictionary", "IEnumerable", "IList", "IReadOnlyList",
        "Action", "Func", "Span", "Memory", "StringBuilder", "Exception",
        "Console", "Math", "Convert", "DateTime", "TimeSpan", "Guid"
    };

    public static List<SyntaxToken> Tokenize(string code, string lang)
    {
        var tokens = new List<SyntaxToken>();
        if (string.IsNullOrEmpty(code))
            return tokens;

        var isCs = lang is "csharp" or "cs" or "c#";
        var isJs = lang is "javascript" or "js" or "typescript" or "ts" or "tsx" or "jsx";
        var doHighlight = isCs || isJs || string.IsNullOrEmpty(lang);

        if (!doHighlight)
        {
            tokens.Add(new SyntaxToken(code, TokenKind.Plain));
            return tokens;
        }

        var keywords = isCs ? CsKeywords : JsKeywords;
        var types = isCs ? CsTypes : JsTypes;

        foreach (Match m in TokenRegex().Matches(code))
        {
            if (m.Groups["comment"].Success)
                tokens.Add(new SyntaxToken(m.Value, TokenKind.Comment));
            else if (m.Groups["string"].Success)
                tokens.Add(new SyntaxToken(m.Value, TokenKind.String));
            else if (m.Groups["number"].Success)
                tokens.Add(new SyntaxToken(m.Value, TokenKind.Number));
            else if (m.Groups["word"].Success)
            {
                var word = m.Value;
                if (keywords.Contains(word))
                    tokens.Add(new SyntaxToken(word, TokenKind.Keyword));
                else if (types.Contains(word) || (word.Length > 1 && char.IsUpper(word[0]) && word.Any(char.IsLower)))
                    tokens.Add(new SyntaxToken(word, TokenKind.Type));
                else
                    tokens.Add(new SyntaxToken(word, TokenKind.Plain));
            }
            else
                tokens.Add(new SyntaxToken(m.Value, TokenKind.Plain));
        }

        return tokens;
    }
}
