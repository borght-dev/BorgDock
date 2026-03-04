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
}
