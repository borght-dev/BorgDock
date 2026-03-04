namespace PRDock.App.Models;

public sealed class ParsedError
{
    public string FilePath { get; set; } = "";
    public int? LineNumber { get; set; }
    public int? ColumnNumber { get; set; }
    public string Message { get; set; } = "";
    public string ErrorCode { get; set; } = "";
    public string Category { get; set; } = "";
    public bool IsIntroducedByPr { get; set; }
}
