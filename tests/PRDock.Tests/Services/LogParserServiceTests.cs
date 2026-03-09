using FluentAssertions;
using Microsoft.Extensions.Logging;
using NSubstitute;
using PRDock.App.Services;

namespace PRDock.Tests.Services;

public class LogParserServiceTests
{
    private readonly LogParserService _sut = new(Substitute.For<ILogger<LogParserService>>());

    #region MSBuild Parsing

    [Fact]
    public void Parse_MsBuildError_ExtractsStructuredError()
    {
        var log = """
            Build started...
            src/Foo/Bar.cs(42,7): error CS1002: ; expected
            Build completed with errors.
            """;

        var result = _sut.Parse(log, []);

        result.Should().ContainSingle();
        var error = result[0];
        error.FilePath.Should().Be("src/Foo/Bar.cs");
        error.LineNumber.Should().Be(42);
        error.ColumnNumber.Should().Be(7);
        error.ErrorCode.Should().Be("CS1002");
        error.Message.Should().Be("; expected");
        error.Category.Should().Be("MSBuild");
    }

    [Fact]
    public void Parse_MultipleMsBuildErrors_ExtractsAll()
    {
        var log = """
            src/A.cs(1,1): error CS0246: Type not found
            src/B.cs(10,5): error CS1061: Does not contain definition
            """;

        var result = _sut.Parse(log, []);

        result.Should().HaveCount(2);
        result[0].FilePath.Should().Be("src/A.cs");
        result[1].FilePath.Should().Be("src/B.cs");
    }

    [Fact]
    public void Parse_MsBuildError_WithWindowsPath_ExtractsCorrectly()
    {
        var log = @"D:\repo\src\Foo.cs(10,3): error CS0001: Compiler error";

        var result = _sut.Parse(log, []);

        result.Should().ContainSingle();
        result[0].FilePath.Should().Be(@"D:\repo\src\Foo.cs");
        result[0].ErrorCode.Should().Be("CS0001");
    }

    #endregion

    #region DotnetTest Parsing

    [Fact]
    public void Parse_DotnetTestFailure_ExtractsTestName()
    {
        var log = """
            Test run started.
            Failed MyNamespace.MyTests.ShouldDoTheThing
              Expected: 5
              But was: 3

            Test run finished.
            """;

        var result = _sut.Parse(log, []);

        result.Should().ContainSingle();
        var error = result[0];
        error.Category.Should().Be("DotnetTest");
        error.ErrorCode.Should().Be("MyNamespace.MyTests.ShouldDoTheThing");
        error.Message.Should().Contain("Test failed: MyNamespace.MyTests.ShouldDoTheThing");
        error.Message.Should().Contain("Expected: 5");
    }

    [Fact]
    public void Parse_MultipleTestFailures_ExtractsAll()
    {
        var log = """
            Failed Test1
              Error message 1

            Failed Test2
              Error message 2

            """;

        var result = _sut.Parse(log, []);

        result.Should().HaveCount(2);
        result[0].ErrorCode.Should().Be("Test1");
        result[1].ErrorCode.Should().Be("Test2");
    }

    [Fact]
    public void Parse_DotnetTestFailure_CollectsContextUntilBlankLine()
    {
        var log = """
            Failed SomeTest
              Assert.Equal() Failure
              Expected: True
              Actual:   False

            Passed AnotherTest
            """;

        var result = _sut.Parse(log, []);

        result.Should().ContainSingle();
        result[0].Message.Should().Contain("Assert.Equal() Failure");
        result[0].Message.Should().Contain("Expected: True");
        result[0].Message.Should().Contain("Actual:   False");
    }

    #endregion

    #region TypeScript/ESLint Parsing

    [Fact]
    public void Parse_TypeScriptError_ExtractsStructuredError()
    {
        var log = """
            src/components/Header.tsx(47,12): error TS2345: Argument of type 'string' is not assignable
            """;

        var result = _sut.Parse(log, []);

        result.Should().ContainSingle();
        var error = result[0];
        error.FilePath.Should().Be("src/components/Header.tsx");
        error.LineNumber.Should().Be(47);
        error.ColumnNumber.Should().Be(12);
        error.ErrorCode.Should().Be("TS2345");
        error.Message.Should().Be("Argument of type 'string' is not assignable");
        error.Category.Should().Be("TypeScript");
    }

    [Fact]
    public void Parse_EsLintError_ExtractsStructuredError()
    {
        var log = """
            src/utils/helper.js:15:3 - error no-unused-vars 'x' is defined but never used
            """;

        var result = _sut.Parse(log, []);

        result.Should().ContainSingle();
        var error = result[0];
        error.FilePath.Should().Be("src/utils/helper.js");
        error.LineNumber.Should().Be(15);
        error.ColumnNumber.Should().Be(3);
        error.Message.Should().Contain("no-unused-vars");
        error.Category.Should().Be("ESLint");
    }

    [Fact]
    public void Parse_MixedTypeScriptAndEsLint_ExtractsAll()
    {
        var log = """
            src/a.ts(1,1): error TS1005: ';' expected
            src/b.js:5:10 - error semi Missing semicolon
            """;

        var result = _sut.Parse(log, []);

        result.Should().HaveCount(2);
        result[0].Category.Should().Be("TypeScript");
        result[1].Category.Should().Be("ESLint");
    }

    #endregion

    #region Generic Fallback Parsing

    [Fact]
    public void Parse_GenericError_FallsBackWhenNoSpecificMatch()
    {
        var log = """
            Step 1: Installing dependencies
            Step 2: Running checks
            FAILED: deployment check timed out
            Step 3: Cleanup
            """;

        var result = _sut.Parse(log, []);

        result.Should().ContainSingle();
        result[0].Category.Should().Be("Generic");
        result[0].Message.Should().Contain("FAILED");
    }

    [Fact]
    public void Parse_GenericFatalError_IsDetected()
    {
        var log = """
            line 1
            line 2
            line 3
            fatal: unable to access repository
            line 5
            line 6
            line 7
            """;

        var result = _sut.Parse(log, []);

        result.Should().ContainSingle();
        result[0].Message.Should().Contain("fatal");
        result[0].Category.Should().Be("Generic");
    }

    [Fact]
    public void Parse_GenericException_IsDetected()
    {
        var log = """
            Starting process
            System.NullReferenceException: Object reference not set
            at Program.Main()
            """;

        var result = _sut.Parse(log, []);

        result.Should().NotBeEmpty();
        result[0].Category.Should().Be("Generic");
        result[0].Message.Should().Contain("Exception");
    }

    [Fact]
    public void Parse_GenericFallback_NotUsedWhenSpecificParsersMatch()
    {
        var log = """
            src/Foo.cs(10,1): error CS0001: Something went wrong
            """;

        var result = _sut.Parse(log, []);

        result.Should().ContainSingle();
        result[0].Category.Should().Be("MSBuild");
    }

    [Fact]
    public void Parse_GenericFallback_SkipsOverlappingContext()
    {
        var log = """
            ok
            ok
            error on line A
            error on line B
            ok
            ok
            """;

        var result = _sut.Parse(log, []);

        result.Should().HaveCount(1);
    }

    #endregion

    #region Diff-Aware Tagging

    [Fact]
    public void Parse_MarkErrorsInChangedFilesAsIntroduced()
    {
        var log = """
            src/Foo/Bar.cs(10,1): error CS0001: Bad code
            src/Other/Baz.cs(5,1): error CS0002: Other error
            """;

        var changedFiles = new[] { "src/Foo/Bar.cs" };

        var result = _sut.Parse(log, changedFiles);

        result.Should().HaveCount(2);
        result[0].IsIntroducedByPr.Should().BeTrue();
        result[1].IsIntroducedByPr.Should().BeFalse();
    }

    [Fact]
    public void Parse_ChangedFilesMatchingIsCaseInsensitive()
    {
        var log = """
            SRC/Foo/Bar.cs(10,1): error CS0001: Bad code
            """;

        var changedFiles = new[] { "src/foo/bar.cs" };

        var result = _sut.Parse(log, changedFiles);

        result.Should().ContainSingle();
        result[0].IsIntroducedByPr.Should().BeTrue();
    }

    [Fact]
    public void Parse_ChangedFilesWithDifferentSlashes_StillMatch()
    {
        var log = @"src\Foo\Bar.cs(10,1): error CS0001: Bad code";

        var changedFiles = new[] { "src/Foo/Bar.cs" };

        var result = _sut.Parse(log, changedFiles);

        result.Should().ContainSingle();
        result[0].IsIntroducedByPr.Should().BeTrue();
    }

    [Fact]
    public void Parse_PartialPathMatch_IntroducedWhenSuffixMatches()
    {
        var log = @"D:\agent\_work\1\s\src\Foo.cs(10,1): error CS0001: Bad";

        var changedFiles = new[] { "src/Foo.cs" };

        var result = _sut.Parse(log, changedFiles);

        result.Should().ContainSingle();
        result[0].IsIntroducedByPr.Should().BeTrue();
    }

    [Fact]
    public void Parse_NoChangedFiles_NothingMarkedAsIntroduced()
    {
        var log = """
            src/A.cs(1,1): error CS0001: Error
            """;

        var result = _sut.Parse(log, []);

        result.Should().ContainSingle();
        result[0].IsIntroducedByPr.Should().BeFalse();
    }

    #endregion

    #region Edge Cases

    [Fact]
    public void Parse_EmptyLog_ReturnsEmpty()
    {
        _sut.Parse("", []).Should().BeEmpty();
    }

    [Fact]
    public void Parse_NullLog_ReturnsEmpty()
    {
        _sut.Parse(null!, []).Should().BeEmpty();
    }

    [Fact]
    public void Parse_WhitespaceLog_ReturnsEmpty()
    {
        _sut.Parse("   \n  \t  ", []).Should().BeEmpty();
    }

    [Fact]
    public void Parse_CleanLog_WithNoErrors_ReturnsEmpty()
    {
        var log = """
            Build started.
            Restoring packages...
            Build succeeded.
            0 Warning(s)
            0 Error(s)
            """;

        _sut.Parse(log, []).Should().BeEmpty();
    }

    [Fact]
    public void Parse_MixedMsBuildAndTestFailures_ReturnsBoth()
    {
        var log = """
            src/Lib.cs(5,1): error CS0246: Type 'Foo' not found
            Test run started.
            Failed MyTest.ShouldWork
              Assert.True() Failure

            """;

        var result = _sut.Parse(log, []);

        result.Should().HaveCount(2);
        result.Should().Contain(e => e.Category == "MSBuild");
        result.Should().Contain(e => e.Category == "DotnetTest");
    }

    #endregion

    #region Playwright Parsing

    [Fact]
    public void Parse_PlaywrightFailure_ExtractsTestDetails()
    {
        var log = """
            Running 47 tests using 1 worker

              1) [chromium] › tests/planboard/planboard-order-context-menu.spec.ts:204:9 › Planboard Order Context Menu › Safe Actions › Copy Order sends POST and menu closes

                TimeoutError: page.waitForResponse: Timeout 15000ms exceeded while waiting for event "response"

                  209 |
                  210 |       // Set up network interception for the copy API call
                > 211 |       const copyResponse = page.waitForResponse(
                      |                                 ^
                  212 |         (res) => res.url().includes('/copy') && res.request().method() === 'POST',

                    at tests/planboard/planboard-order-context-menu.spec.ts:211:33

                Retry #1 ───────────────────────────────────────────────────────────

                TimeoutError: page.waitForResponse: Timeout 15000ms exceeded

              1 failed
                [chromium] › tests/planboard/planboard-order-context-menu.spec.ts:204:9 › Planboard Order Context Menu › Safe Actions › Copy Order sends POST and menu closes
              38 passed (11.0m)
            """;

        var result = _sut.Parse(log, []);

        // Should have a summary entry and a failure entry
        result.Should().Contain(e => e.Category == "PlaywrightSummary");
        result.Should().Contain(e => e.Category == "Playwright");

        var failure = result.First(e => e.Category == "Playwright");
        failure.FilePath.Should().Be("tests/planboard/planboard-order-context-menu.spec.ts");
        failure.LineNumber.Should().Be(204);
        failure.ErrorCode.Should().Contain("Copy Order sends POST and menu closes");
        failure.Message.Should().Contain("TimeoutError");
    }

    [Fact]
    public void Parse_PlaywrightMultipleFailures_ExtractsAll()
    {
        var log = """
              1) [chromium] › tests/foo.spec.ts:10:5 › Suite › test one

                Error: expect(locator).toBeVisible() failed

              2) [chromium] › tests/bar.spec.ts:20:3 › Suite › test two

                TimeoutError: locator.click: Timeout 15000ms exceeded

              2 failed
                [chromium] › tests/foo.spec.ts:10:5 › Suite › test one
                [chromium] › tests/bar.spec.ts:20:3 › Suite › test two
              10 passed (5.0m)
            """;

        var result = _sut.Parse(log, []);

        var failures = result.Where(e => e.Category == "Playwright").ToList();
        failures.Should().HaveCount(2);
        failures[0].FilePath.Should().Be("tests/foo.spec.ts");
        failures[0].Message.Should().Contain("toBeVisible");
        failures[1].FilePath.Should().Be("tests/bar.spec.ts");
        failures[1].Message.Should().Contain("Timeout");
    }

    [Fact]
    public void Parse_PlaywrightSummary_ExtractsCounts()
    {
        var log = """
              1) [chromium] › tests/a.spec.ts:1:1 › Test › fails

                Error: test failure

              1 failed
                [chromium] › tests/a.spec.ts:1:1 › Test › fails
              1 flaky
                [chromium] › tests/b.spec.ts:5:1 › Test › flaky one
              4 skipped
              3 did not run
              38 passed (11.0m)
            """;

        var result = _sut.Parse(log, []);

        var summary = result.First(e => e.Category == "PlaywrightSummary");
        summary.Message.Should().Contain("1 failed");
        summary.Message.Should().Contain("1 flaky");
        summary.Message.Should().Contain("38 passed");
        summary.Message.Should().Contain("4 skipped");
        summary.Message.Should().Contain("3 did not run");
    }

    [Fact]
    public void Parse_PlaywrightRetries_DoesNotDuplicateEntries()
    {
        var log = """
              1) [chromium] › tests/a.spec.ts:10:5 › Test › retry test

                Error: first attempt failure

                Retry #1 ─────────────────────────

                Error: second attempt failure

                Retry #2 ─────────────────────────

                Error: third attempt failure

              1 failed
                [chromium] › tests/a.spec.ts:10:5 › Test › retry test
              5 passed (2.0m)
            """;

        var result = _sut.Parse(log, []);

        var failures = result.Where(e => e.Category == "Playwright").ToList();
        failures.Should().HaveCount(1);
        failures[0].Message.Should().Contain("first attempt failure");
    }

    [Fact]
    public void Parse_PlaywrightWithDiffAwareness_TagsIntroducedErrors()
    {
        var log = """
              1) [chromium] › tests/planboard/order-menu.spec.ts:10:1 › Test › fails

                Error: test failure

              1 failed
                [chromium] › tests/planboard/order-menu.spec.ts:10:1 › Test › fails
              5 passed (1.0m)
            """;

        var changedFiles = new[] { "tests/planboard/order-menu.spec.ts" };

        var result = _sut.Parse(log, changedFiles);

        var failure = result.First(e => e.Category == "Playwright");
        failure.IsIntroducedByPr.Should().BeTrue();
    }

    [Fact]
    public void Parse_NonPlaywrightLog_DoesNotMatchPlaywright()
    {
        // A log with "failed" and "passed" but no browser tags should NOT trigger Playwright parser
        var log = """
            1 test failed
            5 tests passed
            error: something went wrong
            """;

        var result = _sut.Parse(log, []);

        result.Should().NotContain(e => e.Category == "Playwright");
        result.Should().NotContain(e => e.Category == "PlaywrightSummary");
    }

    [Fact]
    public void Parse_PlaywrightErrorContext_StopsAtRetry()
    {
        var log = """
              1) [chromium] › tests/x.spec.ts:5:1 › Suite › test name

                TimeoutError: page.waitForResponse: Timeout 15000ms exceeded while waiting for event "response"

                  209 |
                > 211 |       const copyResponse = page.waitForResponse(
                      |                                 ^
                    at tests/x.spec.ts:211:33

                Retry #1 ─────────────────────────

                TimeoutError: retry error

              1 failed
                [chromium] › tests/x.spec.ts:5:1 › Suite › test name
              5 passed (1.0m)
            """;

        var result = _sut.Parse(log, []);

        var failure = result.First(e => e.Category == "Playwright");
        failure.Message.Should().Contain("Timeout 15000ms exceeded");
        failure.Message.Should().NotContain("retry error");
    }

    #endregion
}
