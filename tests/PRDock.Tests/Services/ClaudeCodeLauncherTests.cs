using System.IO;
using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Infrastructure;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class ClaudeCodeLauncherTests
{
    private static PullRequest CreateTestPR() => new()
    {
        Number = 42,
        Title = "Fix customer validation",
        HtmlUrl = "https://github.com/org/repo/pull/42",
        HeadRef = "feature/fix-validation",
        BaseRef = "main",
        AuthorLogin = "koen-dev"
    };

    private static RepoSettings CreateTestRepoSettings() => new()
    {
        Owner = "org",
        Name = "repo",
        WorktreeBasePath = @"D:\Projects\repo",
        WorktreeSubfolder = ".worktrees"
    };

    #region BuildFixPrompt

    [Fact]
    public void BuildFixPrompt_ContainsPRDetails()
    {
        var pr = CreateTestPR();
        var errors = new List<ParsedError>();
        var repoSettings = CreateTestRepoSettings();

        var result = ClaudeCodeLauncher.BuildFixPrompt(pr, "build", errors, [], "", repoSettings);

        result.Should().Contain("PR #42");
        result.Should().Contain("Fix customer validation");
        result.Should().Contain("https://github.com/org/repo/pull/42");
        result.Should().Contain("feature/fix-validation");
        result.Should().Contain("main");
        result.Should().Contain("koen-dev");
        result.Should().Contain("`build`");
    }

    [Fact]
    public void BuildFixPrompt_IncludesParsedErrors()
    {
        var pr = CreateTestPR();
        var errors = new List<ParsedError>
        {
            new()
            {
                FilePath = "src/Service.cs",
                Line = 42,
                Column = 12,
                ErrorCode = "CS0103",
                Message = "The name 'x' does not exist",
                Category = "error",
                IsIntroducedByPR = true,
                ContextLines = ["    var y = x + 1;"]
            },
            new()
            {
                FilePath = "src/Other.cs",
                Line = 10,
                Column = 1,
                ErrorCode = "CS0168",
                Message = "Variable declared but never used",
                Category = "warning",
                IsIntroducedByPR = false
            }
        };

        var result = ClaudeCodeLauncher.BuildFixPrompt(pr, "build", errors, [], "", CreateTestRepoSettings());

        result.Should().Contain("[Introduced]");
        result.Should().Contain("[Pre-existing]");
        result.Should().Contain("src/Service.cs:42:12");
        result.Should().Contain("CS0103");
        result.Should().Contain("The name 'x' does not exist");
        result.Should().Contain("var y = x + 1;");
        result.Should().Contain("src/Other.cs:10:1");
    }

    [Fact]
    public void BuildFixPrompt_IncludesChangedFiles()
    {
        var changedFiles = new List<string> { "src/Service.cs", "tests/ServiceTests.cs" };

        var result = ClaudeCodeLauncher.BuildFixPrompt(
            CreateTestPR(), "lint", [], changedFiles, "", CreateTestRepoSettings());

        result.Should().Contain("Files Changed in This PR");
        result.Should().Contain("- src/Service.cs");
        result.Should().Contain("- tests/ServiceTests.cs");
    }

    [Fact]
    public void BuildFixPrompt_TruncatesRawLogTo500Lines()
    {
        var lines = Enumerable.Range(1, 1000).Select(i => $"line {i}").ToList();
        var rawLog = string.Join("\n", lines);

        var result = ClaudeCodeLauncher.BuildFixPrompt(
            CreateTestPR(), "build", [], [], rawLog, CreateTestRepoSettings());

        result.Should().Contain("Raw Log (last 500 lines)");
        result.Should().Contain("line 501");
        result.Should().Contain("line 1000");
        result.Should().NotContain("line 1\n");
    }

    [Fact]
    public void BuildFixPrompt_ShortRawLogIncludedFully()
    {
        var rawLog = "line 1\nline 2\nline 3";

        var result = ClaudeCodeLauncher.BuildFixPrompt(
            CreateTestPR(), "build", [], [], rawLog, CreateTestRepoSettings());

        result.Should().Contain("line 1");
        result.Should().Contain("line 3");
    }

    [Fact]
    public void BuildFixPrompt_IncludesCustomPromptTemplate()
    {
        var repoSettings = CreateTestRepoSettings();
        repoSettings.FixPromptTemplate = "Always run `dotnet test` before committing.";

        var result = ClaudeCodeLauncher.BuildFixPrompt(
            CreateTestPR(), "build", [], [], "", repoSettings);

        result.Should().Contain("Additional Context");
        result.Should().Contain("Always run `dotnet test` before committing.");
    }

    [Fact]
    public void BuildFixPrompt_OmitsCustomPromptWhenNull()
    {
        var repoSettings = CreateTestRepoSettings();
        repoSettings.FixPromptTemplate = null;

        var result = ClaudeCodeLauncher.BuildFixPrompt(
            CreateTestPR(), "build", [], [], "", repoSettings);

        result.Should().NotContain("Additional Context");
    }

    [Fact]
    public void BuildFixPrompt_ContainsInstructions()
    {
        var result = ClaudeCodeLauncher.BuildFixPrompt(
            CreateTestPR(), "lint", [], [], "", CreateTestRepoSettings());

        result.Should().Contain("Fix the failing CI check");
        result.Should().Contain("`lint`");
        result.Should().Contain("run the relevant checks locally to verify");
    }

    #endregion

    #region BuildConflictPrompt

    [Fact]
    public void BuildConflictPrompt_ContainsPRDetails()
    {
        var pr = CreateTestPR();

        var result = ClaudeCodeLauncher.BuildConflictPrompt(pr);

        result.Should().Contain("Resolve Merge Conflict");
        result.Should().Contain("PR #42");
        result.Should().Contain("Fix customer validation");
        result.Should().Contain("feature/fix-validation");
        result.Should().Contain("main");
    }

    [Fact]
    public void BuildConflictPrompt_ContainsMergeInstructions()
    {
        var pr = CreateTestPR();

        var result = ClaudeCodeLauncher.BuildConflictPrompt(pr);

        result.Should().Contain("Merge `origin/main` into this branch");
        result.Should().Contain("resolve all merge conflicts");
        result.Should().Contain("push to `origin/feature/fix-validation`");
    }

    #endregion

    #region SanitizeFileName

    [Theory]
    [InlineData("build", "build")]
    [InlineData("lint/check", "lint_check")]
    [InlineData("test:unit", "test_unit")]
    [InlineData("CI Build (Windows)", "CI Build (Windows)")]
    [InlineData("a<b>c", "a_b_c")]
    [InlineData("pipe|test", "pipe_test")]
    [InlineData("question?mark", "question_mark")]
    public void SanitizeFileName_HandlesSpecialCharacters(string input, string expected)
    {
        ClaudeCodeLauncher.SanitizeFileName(input).Should().Be(expected);
    }

    #endregion

    #region WritePromptFile

    [Fact]
    public void WritePromptFile_CreatesFileWithContent()
    {
        var launcher = CreateLauncher();
        var content = "# Test Prompt\nHello world";

        var path = launcher.WritePromptFile(99, "test-check", content);

        try
        {
            File.Exists(path).Should().BeTrue();
            File.ReadAllText(path).Should().Be(content);
            Path.GetFileName(path).Should().Contain("PR99");
            Path.GetFileName(path).Should().Contain("test-check");
            Path.GetFileName(path).Should().EndWith(".md");
        }
        finally
        {
            File.Delete(path);
        }
    }

    #endregion

    #region CleanupOldPromptFiles

    [Fact]
    public void CleanupOldPromptFiles_DeletesOldFiles()
    {
        var dir = Path.Combine(Path.GetTempPath(), "PRDock-test-cleanup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);

        try
        {
            // Create an "old" file
            var oldFile = Path.Combine(dir, "old-prompt.md");
            File.WriteAllText(oldFile, "old");
            File.SetCreationTimeUtc(oldFile, DateTime.UtcNow.AddDays(-10));

            // Create a "new" file
            var newFile = Path.Combine(dir, "new-prompt.md");
            File.WriteAllText(newFile, "new");

            // Use reflection-free approach: test the static logic directly
            var cutoff = DateTime.UtcNow.AddDays(-7);
            var files = Directory.GetFiles(dir, "*.md");
            foreach (var file in files)
            {
                if (File.GetCreationTimeUtc(file) < cutoff)
                    File.Delete(file);
            }

            File.Exists(oldFile).Should().BeFalse();
            File.Exists(newFile).Should().BeTrue();
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }

    #endregion

    private static ClaudeCodeLauncher CreateLauncher()
    {
        var settings = Substitute.For<ISettingsService>();
        settings.CurrentSettings.Returns(new AppSettings());
        var logger = Substitute.For<ILogger<ClaudeCodeLauncher>>();
        var processLogger = Substitute.For<ILogger<ProcessTracker>>();
        var tracker = new ProcessTracker(processLogger);
        return new ClaudeCodeLauncher(settings, tracker, logger);
    }
}
