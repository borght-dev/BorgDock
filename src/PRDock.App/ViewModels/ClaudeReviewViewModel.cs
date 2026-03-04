using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;

namespace PRDock.App.ViewModels;

public partial class ClaudeReviewViewModel : ObservableObject
{
    [ObservableProperty]
    private string _summaryText = "";

    [ObservableProperty]
    private bool _hasComments;

    public ObservableCollection<ClaudeReviewComment> ReviewComments { get; } = [];

    public ObservableCollection<ClaudeReviewComment> CriticalComments { get; } = [];

    public ObservableCollection<ClaudeReviewComment> SuggestionComments { get; } = [];

    public ObservableCollection<ClaudeReviewComment> PraiseComments { get; } = [];

    public ObservableCollection<ClaudeReviewComment> OtherComments { get; } = [];

    public void LoadComments(IEnumerable<ClaudeReviewComment> comments)
    {
        ReviewComments.Clear();
        CriticalComments.Clear();
        SuggestionComments.Clear();
        PraiseComments.Clear();
        OtherComments.Clear();

        foreach (var comment in comments)
        {
            ReviewComments.Add(comment);

            switch (comment.Severity)
            {
                case CommentSeverity.Critical:
                    CriticalComments.Add(comment);
                    break;
                case CommentSeverity.Suggestion:
                    SuggestionComments.Add(comment);
                    break;
                case CommentSeverity.Praise:
                    PraiseComments.Add(comment);
                    break;
                default:
                    OtherComments.Add(comment);
                    break;
            }
        }

        HasComments = ReviewComments.Count > 0;
        SummaryText = BuildSummary();
    }

    private string BuildSummary()
    {
        if (ReviewComments.Count == 0)
            return "No review comments";

        var parts = new List<string>();

        if (CriticalComments.Count > 0)
            parts.Add($"{CriticalComments.Count} critical");

        if (SuggestionComments.Count > 0)
            parts.Add($"{SuggestionComments.Count} suggestion{(SuggestionComments.Count == 1 ? "" : "s")}");

        if (PraiseComments.Count > 0)
            parts.Add($"{PraiseComments.Count} praise");

        if (OtherComments.Count > 0)
            parts.Add($"{OtherComments.Count} other");

        return parts.Count > 0
            ? "\U0001F916 " + string.Join(" \u00B7 ", parts)
            : "No review comments";
    }

    [RelayCommand]
    private void OpenFile(ClaudeReviewComment? comment)
    {
        if (comment?.FilePath is null)
            return;

        if (!string.IsNullOrEmpty(comment.HtmlUrl))
        {
            OpenUrl(comment.HtmlUrl);
        }
    }

    [RelayCommand]
    private void OpenInBrowser(ClaudeReviewComment? comment)
    {
        if (comment is null || string.IsNullOrEmpty(comment.HtmlUrl))
            return;

        OpenUrl(comment.HtmlUrl);
    }

    private static void OpenUrl(string url)
    {
        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true };
            System.Diagnostics.Process.Start(psi);
        }
        catch
        {
            // Silently ignore if browser launch fails.
        }
    }
}
