using System.Text.Json;
using System.Text.RegularExpressions;
using PRDock.App.Models;

namespace PRDock.App.Infrastructure;

public static partial class WorkItemFieldClassifier
{
    // Fields already shown in the hardcoded header section — skip these
    private static readonly HashSet<string> SkipFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "System.Id", "System.Rev", "System.Watermark",
        "System.AuthorizedDate", "System.RevisedDate", "System.AuthorizedAs",
        "System.PersonId", "System.AreaId", "System.NodeName", "System.TeamProject",
        "System.BoardColumn", "System.BoardColumnDone", "System.BoardLane",
        "System.CommentCount", "System.HyperLinkCount", "System.AttachedFileCount",
        "System.ExternalLinkCount", "System.RelatedLinkCount",
        // Already rendered in the hardcoded header
        "System.Title", "System.State", "System.WorkItemType",
        "System.AssignedTo", "System.Tags", "Microsoft.VSTS.Common.Priority",
        "System.AreaPath", "System.IterationPath",
    };

    private static readonly HashSet<string> HtmlFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "System.Description",
        "Microsoft.VSTS.TCM.ReproSteps",
        "Microsoft.VSTS.TCM.SystemInfo",
        "Microsoft.VSTS.Common.AcceptanceCriteria",
    };

    private static readonly Dictionary<string, string> KnownLabels = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Microsoft.VSTS.Common.Severity"] = "Severity",
        ["Microsoft.VSTS.Common.ValueArea"] = "Value Area",
        ["Microsoft.VSTS.Common.Activity"] = "Activity",
        ["Microsoft.VSTS.Common.BusinessValue"] = "Business Value",
        ["Microsoft.VSTS.Common.StackRank"] = "Stack Rank",
        ["Microsoft.VSTS.Scheduling.Effort"] = "Effort",
        ["Microsoft.VSTS.Scheduling.StoryPoints"] = "Story Points",
        ["Microsoft.VSTS.Scheduling.RemainingWork"] = "Remaining Work",
        ["Microsoft.VSTS.Scheduling.CompletedWork"] = "Completed Work",
        ["Microsoft.VSTS.Scheduling.OriginalEstimate"] = "Original Estimate",
        ["Microsoft.VSTS.Build.FoundIn"] = "Found In Version",
        ["Microsoft.VSTS.Build.IntegrationBuild"] = "Integration Build",
        ["Microsoft.VSTS.TCM.ReproSteps"] = "Repro Steps",
        ["Microsoft.VSTS.TCM.SystemInfo"] = "System Info",
        ["Microsoft.VSTS.Common.AcceptanceCriteria"] = "Acceptance Criteria",
        ["System.Description"] = "Description",
        ["System.Reason"] = "Reason",
        ["System.CreatedDate"] = "Created Date",
        ["System.CreatedBy"] = "Created By",
        ["System.ChangedDate"] = "Changed Date",
        ["System.ChangedBy"] = "Changed By",
        ["System.History"] = "History",
    };

    public static List<DynamicFieldItem> Classify(Dictionary<string, object?> fields)
    {
        var result = new List<DynamicFieldItem>();

        foreach (var (key, raw) in fields)
        {
            if (SkipFields.Contains(key))
                continue;

            var value = ExtractDisplayValue(raw);
            if (string.IsNullOrWhiteSpace(value))
                continue;

            var isHtml = HtmlFields.Contains(key);
            var label = GetLabel(key);
            var section = GetSection(key, isHtml);

            result.Add(new DynamicFieldItem
            {
                FieldKey = key,
                Label = label.ToUpperInvariant(),
                Value = isHtml ? null : value,
                IsHtml = isHtml,
                HtmlContent = isHtml ? value : null,
                Section = section,
            });
        }

        // Sort: RichText first, then Standard, then Dates, then Custom
        result.Sort((a, b) =>
        {
            var sectionCompare = a.Section.CompareTo(b.Section);
            if (sectionCompare != 0) return sectionCompare;
            return string.Compare(a.Label, b.Label, StringComparison.OrdinalIgnoreCase);
        });

        return result;
    }

    private static string GetLabel(string fieldKey)
    {
        if (KnownLabels.TryGetValue(fieldKey, out var known))
            return known;

        // Extract the last segment and split PascalCase
        var lastDot = fieldKey.LastIndexOf('.');
        var name = lastDot >= 0 ? fieldKey[(lastDot + 1)..] : fieldKey;
        return SplitPascalCase(name);
    }

    private static string SplitPascalCase(string input)
    {
        return PascalCaseRegex().Replace(input, " $1").Trim();
    }

    [GeneratedRegex(@"(?<!^)([A-Z][a-z]|(?<=[a-z])[A-Z])")]
    private static partial Regex PascalCaseRegex();

    private static FieldSection GetSection(string fieldKey, bool isHtml)
    {
        if (isHtml) return FieldSection.RichText;
        if (fieldKey.StartsWith("Custom.", StringComparison.OrdinalIgnoreCase))
            return FieldSection.Custom;
        if (fieldKey.Contains("Date", StringComparison.OrdinalIgnoreCase) &&
            fieldKey.StartsWith("System.", StringComparison.OrdinalIgnoreCase))
            return FieldSection.Dates;
        return FieldSection.Standard;
    }

    private static string? ExtractDisplayValue(object? raw)
    {
        if (raw is null) return null;

        if (raw is JsonElement element)
        {
            return element.ValueKind switch
            {
                JsonValueKind.String => element.GetString(),
                JsonValueKind.Number => element.TryGetInt64(out var l) ? l.ToString() : element.GetDouble().ToString("G"),
                JsonValueKind.True => "Yes",
                JsonValueKind.False => "No",
                JsonValueKind.Null => null,
                JsonValueKind.Object when element.TryGetProperty("displayName", out var dn) => dn.GetString(),
                JsonValueKind.Object => element.ToString(),
                _ => element.ToString(),
            };
        }

        if (raw is DateTime dt)
            return dt.ToString("yyyy-MM-dd HH:mm");

        return raw.ToString();
    }
}
