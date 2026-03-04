using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed partial class LogParserService(ILogger<LogParserService> logger) : ILogParserService
{
    // MSBuild: path(line,col): error CS1234: message
    [GeneratedRegex(@"^(.+?)\((\d+),(\d+)\):\s*error\s+(CS\d{4}):\s*(.+)$", RegexOptions.Multiline)]
    private static partial Regex MsBuildRegex();

    // dotnet test: "Failed <TestName>" followed by assertion/error lines
    [GeneratedRegex(@"^\s*Failed\s+(\S+)\s*$", RegexOptions.Multiline)]
    private static partial Regex DotnetTestFailedRegex();

    // TypeScript: file(line,col): error TSXXXX: message
    [GeneratedRegex(@"^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$", RegexOptions.Multiline)]
    private static partial Regex TypeScriptRegex();

    // ESLint: file:line:col - error message
    [GeneratedRegex(@"^(.+?):(\d+):(\d+)\s+-\s+error\s+(.+)$", RegexOptions.Multiline)]
    private static partial Regex EsLintRegex();

    // Generic fallback: lines containing error/FAILED/fatal/exception
    // No word boundary on "exception" to match compound names like NullReferenceException
    [GeneratedRegex(@"\b(error|FAILED|fatal)\b|exception", RegexOptions.IgnoreCase)]
    private static partial Regex GenericErrorRegex();

    // Lines that are just summaries (e.g. "0 Error(s)") should not be treated as errors
    [GeneratedRegex(@"^\s*\d+\s+(error|warning)", RegexOptions.IgnoreCase)]
    private static partial Regex SummaryLineRegex();

    public List<ParsedError> Parse(string logText, IReadOnlyList<string> changedFiles)
    {
        if (string.IsNullOrWhiteSpace(logText))
            return [];

        var errors = new List<ParsedError>();

        errors.AddRange(ParseMsBuild(logText));
        errors.AddRange(ParseDotnetTest(logText));
        errors.AddRange(ParseTypeScriptEsLint(logText));

        if (errors.Count == 0)
        {
            errors.AddRange(ParseGenericFallback(logText));
        }

        // Mark errors as introduced by PR based on changed files
        var normalizedChanged = changedFiles
            .Select(NormalizePath)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var error in errors)
        {
            if (!string.IsNullOrEmpty(error.FilePath))
            {
                var normalized = NormalizePath(error.FilePath);
                error.IsIntroducedByPr = normalizedChanged.Any(
                    changed => normalized.EndsWith(changed, StringComparison.OrdinalIgnoreCase)
                              || changed.EndsWith(normalized, StringComparison.OrdinalIgnoreCase));
            }
        }

        logger.LogDebug("Parsed {Count} errors from log ({Introduced} introduced by PR)",
            errors.Count, errors.Count(e => e.IsIntroducedByPr));

        return errors;
    }

    private static List<ParsedError> ParseMsBuild(string logText)
    {
        var errors = new List<ParsedError>();
        foreach (Match match in MsBuildRegex().Matches(logText))
        {
            errors.Add(new ParsedError
            {
                FilePath = match.Groups[1].Value.Trim(),
                LineNumber = int.Parse(match.Groups[2].Value),
                ColumnNumber = int.Parse(match.Groups[3].Value),
                ErrorCode = match.Groups[4].Value,
                Message = match.Groups[5].Value.Trim(),
                Category = "MSBuild"
            });
        }
        return errors;
    }

    private static List<ParsedError> ParseDotnetTest(string logText)
    {
        var errors = new List<ParsedError>();
        var lines = logText.Split('\n');

        foreach (Match match in DotnetTestFailedRegex().Matches(logText))
        {
            var testName = match.Groups[1].Value;
            var matchLineIndex = GetLineIndex(lines, match.Index, logText);
            var message = CollectTestErrorContext(lines, matchLineIndex);

            errors.Add(new ParsedError
            {
                Message = $"Test failed: {testName}. {message}".Trim(),
                ErrorCode = testName,
                Category = "DotnetTest"
            });
        }
        return errors;
    }

    private static List<ParsedError> ParseTypeScriptEsLint(string logText)
    {
        var errors = new List<ParsedError>();

        foreach (Match match in TypeScriptRegex().Matches(logText))
        {
            errors.Add(new ParsedError
            {
                FilePath = match.Groups[1].Value.Trim(),
                LineNumber = int.Parse(match.Groups[2].Value),
                ColumnNumber = int.Parse(match.Groups[3].Value),
                ErrorCode = match.Groups[4].Value,
                Message = match.Groups[5].Value.Trim(),
                Category = "TypeScript"
            });
        }

        foreach (Match match in EsLintRegex().Matches(logText))
        {
            errors.Add(new ParsedError
            {
                FilePath = match.Groups[1].Value.Trim(),
                LineNumber = int.Parse(match.Groups[2].Value),
                ColumnNumber = int.Parse(match.Groups[3].Value),
                Message = match.Groups[4].Value.Trim(),
                Category = "ESLint"
            });
        }

        return errors;
    }

    private static List<ParsedError> ParseGenericFallback(string logText)
    {
        var errors = new List<ParsedError>();
        var lines = logText.Split('\n');

        for (var i = 0; i < lines.Length; i++)
        {
            if (!GenericErrorRegex().IsMatch(lines[i]))
                continue;

            // Skip summary lines like "0 Error(s)"
            if (SummaryLineRegex().IsMatch(lines[i]))
                continue;

            var contextEnd = Math.Min(lines.Length - 1, i + 3);

            errors.Add(new ParsedError
            {
                Message = lines[i].TrimEnd('\r').Trim(),
                Category = "Generic",
                FilePath = "",
                ErrorCode = $"Line {i + 1}",
            });

            // Skip ahead past the context window to avoid duplicate overlapping errors
            i = contextEnd;
        }
        return errors;
    }

    private static int GetLineIndex(string[] lines, int charIndex, string fullText)
    {
        var currentPos = 0;
        for (var i = 0; i < lines.Length; i++)
        {
            if (currentPos >= charIndex)
                return i;
            currentPos += lines[i].Length + 1; // +1 for \n
        }
        return lines.Length - 1;
    }

    private static string CollectTestErrorContext(string[] lines, int startLine)
    {
        var contextLines = new List<string>();
        for (var i = startLine + 1; i < lines.Length && i <= startLine + 10; i++)
        {
            var line = lines[i].TrimEnd('\r');
            if (string.IsNullOrWhiteSpace(line))
                break;
            if (line.TrimStart().StartsWith("Failed "))
                break;
            contextLines.Add(line.Trim());
        }
        return string.Join(" ", contextLines);
    }

    private static string NormalizePath(string path)
    {
        return path.Replace('\\', '/').TrimStart('/');
    }
}
