using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed partial class LogParserService(ILogger<LogParserService> logger) : ILogParserService
{
    // MSBuild: path(line,col): error CODE: message
    // Handles any LETTERS+DIGITS error code (CS0001, ASPDEPR002, NETSDK1100, CA1234, etc.)
    [GeneratedRegex(@"^(.+?)\((\d+),(\d+)\):\s*error\s+([A-Z]+\d+):\s*(.+)$", RegexOptions.Multiline)]
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

    // Playwright: numbered failure header "1) [chromium] › file:line:col › Test Name"
    [GeneratedRegex(@"\d+\)\s*\[(\w+)\]\s*›\s*(.+?):(\d+):\d+\s*›\s*(.+?)\s*$", RegexOptions.Multiline)]
    private static partial Regex PlaywrightFailureHeaderRegex();

    // Playwright summary line: "1 failed", "38 passed (11.0m)", etc.
    [GeneratedRegex(@"^\s*(\d+)\s+(failed|flaky|skipped|did not run|passed)", RegexOptions.Multiline)]
    private static partial Regex PlaywrightSummaryLineRegex();

    // GitHub Actions error annotation: ##[error]message
    [GeneratedRegex(@"^##\[error\](.+)$", RegexOptions.Multiline)]
    private static partial Regex GitHubActionsErrorRegex();

    // MSBuild-style error pattern within a message (for dedup with ##[error] parser)
    [GeneratedRegex(@"\(\d+,\d+\):\s*error\s+[A-Z]+\d+:")]
    private static partial Regex MsBuildPatternRegex();

    // GitHub Actions timestamp prefix: "2024-01-15T10:30:45.1234567Z "
    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*", RegexOptions.Multiline)]
    private static partial Regex TimestampRegex();

    // ANSI escape codes: ESC[31;1m, ESC[0m, etc.
    [GeneratedRegex(@"\x1b\[\d*(?:;\d+)*m")]
    private static partial Regex AnsiEscapeRegex();

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

        // Preprocess: strip timestamps, ANSI codes, and ##[error]/##[warning] markers
        var cleanLog = PreprocessLog(logText);

        var errors = new List<ParsedError>();

        errors.AddRange(ParseMsBuild(cleanLog));
        errors.AddRange(ParseDotnetTest(cleanLog));
        errors.AddRange(ParseTypeScriptEsLint(cleanLog));
        errors.AddRange(ParsePlaywright(cleanLog));
        errors.AddRange(ParseGitHubActionsAnnotations(cleanLog));

        if (errors.Count == 0)
        {
            errors.AddRange(ParseGenericFallback(cleanLog));
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

    /// <summary>
    /// Strip GitHub Actions timestamps, ANSI escape codes, and annotation markers from raw log text.
    /// </summary>
    internal static string PreprocessLog(string logText)
    {
        // Strip timestamps: "2024-01-15T10:30:45.1234567Z "
        logText = TimestampRegex().Replace(logText, "");

        // Strip ANSI escape codes
        logText = AnsiEscapeRegex().Replace(logText, "");

        return logText;
    }

    private static List<ParsedError> ParseMsBuild(string logText)
    {
        var errors = new List<ParsedError>();
        foreach (Match match in MsBuildRegex().Matches(logText))
        {
            var errorCode = match.Groups[4].Value;

            // Skip TypeScript error codes (handled by TypeScript parser)
            if (errorCode.StartsWith("TS") && errorCode.Length >= 5)
                continue;

            var filePath = match.Groups[1].Value.Trim();

            // Strip ##[error] prefix from file path if present
            if (filePath.StartsWith("##[error]"))
                filePath = filePath["##[error]".Length..];

            errors.Add(new ParsedError
            {
                FilePath = filePath,
                LineNumber = int.Parse(match.Groups[2].Value),
                ColumnNumber = int.Parse(match.Groups[3].Value),
                ErrorCode = match.Groups[4].Value,
                Message = match.Groups[5].Value.Trim(),
                Category = "MSBuild"
            });
        }

        // Deduplicate (same file+line+code can appear multiple times in verbose logs)
        return errors
            .GroupBy(e => $"{e.FilePath}:{e.LineNumber}:{e.ErrorCode}")
            .Select(g => g.First())
            .ToList();
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

            // Skip GitHub Actions annotation markers (handled by GitHubActions parser)
            if (lines[i].TrimStart().StartsWith("##["))
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

    private static List<ParsedError> ParsePlaywright(string logText)
    {
        var errors = new List<ParsedError>();

        // Must have a Playwright summary section and browser tags to qualify
        if (!PlaywrightSummaryLineRegex().IsMatch(logText))
            return errors;

        if (!logText.Contains("[chromium]") && !logText.Contains("[firefox]") && !logText.Contains("[webkit]"))
            return errors;

        var lines = logText.Split('\n');

        // Extract individual test failures with error context
        foreach (Match match in PlaywrightFailureHeaderRegex().Matches(logText))
        {
            var browser = match.Groups[1].Value;
            var filePath = match.Groups[2].Value.Trim();
            var lineNumber = int.Parse(match.Groups[3].Value);
            var testName = match.Groups[4].Value.Trim();
            var errorCode = $"[{browser}] {testName}";

            // Skip duplicate entries (same test appears in retries)
            if (errors.Any(e => e.Category == "Playwright" && e.ErrorCode == errorCode))
                continue;

            var matchLineIndex = GetLineIndex(lines, match.Index, logText);
            var errorMessage = CollectPlaywrightErrorContext(lines, matchLineIndex);

            errors.Add(new ParsedError
            {
                FilePath = filePath,
                LineNumber = lineNumber,
                Category = "Playwright",
                ErrorCode = errorCode,
                Message = errorMessage,
            });
        }

        // Extract the summary section (the counts block at the bottom)
        var summary = CollectPlaywrightSummary(lines);
        if (!string.IsNullOrEmpty(summary))
        {
            errors.Insert(0, new ParsedError
            {
                Category = "PlaywrightSummary",
                ErrorCode = "Test Results",
                Message = summary,
            });
        }

        return errors;
    }

    /// <summary>
    /// Extract errors from GitHub Actions ##[error] annotations.
    /// Catches coverage failures, deployment mismatches, and other CI errors
    /// that don't match specific parsers.
    /// </summary>
    private static List<ParsedError> ParseGitHubActionsAnnotations(string logText)
    {
        var errors = new List<ParsedError>();
        foreach (Match match in GitHubActionsErrorRegex().Matches(logText))
        {
            var message = match.Groups[1].Value.Trim();

            // Skip generic process exit messages (noise)
            if (message.StartsWith("Process completed with exit code"))
                continue;

            // Skip MSBuild-style errors (already caught by MSBuild parser)
            if (MsBuildPatternRegex().IsMatch(message))
                continue;

            errors.Add(new ParsedError
            {
                Message = message,
                Category = "GitHubActions",
            });
        }
        return errors;
    }

    private static string CollectPlaywrightErrorContext(string[] lines, int startIndex)
    {
        var contextLines = new List<string>();

        for (int i = startIndex + 1; i < lines.Length && contextLines.Count < 30; i++)
        {
            var line = lines[i].TrimEnd('\r');
            var trimmed = line.Trim();

            // Stop at next failure block, retry, attachment, or error context marker
            if (i > startIndex + 1 && PlaywrightFailureHeaderRegex().IsMatch(line)) break;
            if (trimmed.StartsWith("Retry #")) break;
            if (trimmed.StartsWith("attachment #")) break;
            if (trimmed.StartsWith("Error Context:")) break;

            if (!string.IsNullOrWhiteSpace(trimmed))
                contextLines.Add(trimmed);
        }

        return string.Join("\n", contextLines);
    }

    private static string CollectPlaywrightSummary(string[] lines)
    {
        // Find the summary block at the end of the log by scanning from the bottom
        int summaryStart = -1;
        int summaryEnd = -1;

        for (int i = lines.Length - 1; i >= 0; i--)
        {
            var trimmed = lines[i].TrimEnd('\r').Trim();

            if (string.IsNullOrWhiteSpace(trimmed))
            {
                if (summaryStart != -1) break;
                continue;
            }

            if (PlaywrightSummaryLineRegex().IsMatch(trimmed))
            {
                summaryStart = i;
                if (summaryEnd == -1) summaryEnd = i;
            }
            else if (summaryStart != -1)
            {
                // Test reference lines under a count (e.g. "[chromium] › tests/...")
                if (trimmed.Contains("] ›") && (trimmed.Contains("[chromium]") || trimmed.Contains("[firefox]") || trimmed.Contains("[webkit]")))
                {
                    summaryStart = i;
                }
                else
                {
                    break;
                }
            }
        }

        if (summaryStart == -1) return "";

        var sb = new StringBuilder();
        for (int i = summaryStart; i <= summaryEnd; i++)
        {
            sb.AppendLine(lines[i].TrimEnd('\r'));
        }

        return sb.ToString().TrimEnd();
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
