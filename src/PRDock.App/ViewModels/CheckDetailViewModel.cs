using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;

namespace PRDock.App.ViewModels;

public partial class CheckDetailViewModel : ObservableObject
{
    [ObservableProperty]
    private string _checkName = "";

    [ObservableProperty]
    private string _duration = "";

    [ObservableProperty]
    private string _rawLogContent = "";

    [ObservableProperty]
    private bool _isRawLogVisible;

    [ObservableProperty]
    private bool _isLoading;

    public ObservableCollection<ParsedError> ParsedErrors { get; } = [];

    /// <summary>
    /// The editor command from settings (e.g. "code", "rider").
    /// Set by the parent when constructing or loading the detail panel.
    /// </summary>
    public string EditorCommand { get; set; } = "code";

    [RelayCommand]
    private void ToggleRawLog()
    {
        IsRawLogVisible = !IsRawLogVisible;
    }

    [RelayCommand]
    private void OpenFileInEditor(ParsedError? error)
    {
        if (error is null || string.IsNullOrWhiteSpace(error.FilePath))
            return;

        var args = $"--goto {error.FilePath}";
        if (error.LineNumber.HasValue)
        {
            args += $":{error.LineNumber.Value}";
            if (error.ColumnNumber.HasValue)
                args += $":{error.ColumnNumber.Value}";
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = EditorCommand,
            Arguments = args,
            UseShellExecute = true
        });
    }

    [RelayCommand]
    private void FixWithClaude(ParsedError? error)
    {
        // Phase 4 will implement Claude Code integration.
        // For now, this is a placeholder that copies error context.
    }

    /// <summary>
    /// Returns the last N lines of RawLogContent for display.
    /// </summary>
    public string GetTruncatedLog(int maxLines = 200)
    {
        if (string.IsNullOrEmpty(RawLogContent))
            return "";

        var lines = RawLogContent.Split('\n');
        if (lines.Length <= maxLines)
            return RawLogContent;

        return string.Join('\n', lines[^maxLines..]);
    }
}
