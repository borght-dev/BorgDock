using System.Windows;
using System.Windows.Documents;
using WpfRichTextBox = System.Windows.Controls.RichTextBox;

namespace PRDock.App.Infrastructure;

public static class MarkdownTextBlock
{
    private static readonly MarkdownRenderer Renderer = new();

    public static readonly DependencyProperty MarkdownProperty =
        DependencyProperty.RegisterAttached(
            "Markdown",
            typeof(string),
            typeof(MarkdownTextBlock),
            new PropertyMetadata(null, OnMarkdownChanged));

    public static string? GetMarkdown(DependencyObject obj) => (string?)obj.GetValue(MarkdownProperty);
    public static void SetMarkdown(DependencyObject obj, string? value) => obj.SetValue(MarkdownProperty, value);

    private static void OnMarkdownChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is WpfRichTextBox rtb)
        {
            var markdown = e.NewValue as string;
            var doc = new FlowDocument();

            if (!string.IsNullOrWhiteSpace(markdown))
            {
                foreach (var block in Renderer.RenderBlocks(markdown))
                    doc.Blocks.Add(block);
            }

            rtb.Document = doc;
        }
    }
}
