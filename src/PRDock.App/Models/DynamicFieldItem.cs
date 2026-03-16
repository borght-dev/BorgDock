namespace PRDock.App.Models;

public sealed class DynamicFieldItem
{
    public string FieldKey { get; init; } = "";
    public string Label { get; init; } = "";
    public string? Value { get; init; }
    public bool IsHtml { get; init; }
    public string? HtmlContent { get; init; }
    public FieldSection Section { get; init; }
}

public enum FieldSection
{
    RichText,
    Standard,
    Path,
    Dates,
    Custom
}
