using FluentAssertions;
using PRDock.App.Models;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class CheckDetailViewModelTests
{
    [Fact]
    public void InitialState_HasDefaults()
    {
        var vm = new CheckDetailViewModel();

        vm.CheckName.Should().Be("");
        vm.Duration.Should().Be("");
        vm.RawLogContent.Should().Be("");
        vm.IsRawLogVisible.Should().BeFalse();
        vm.IsLoading.Should().BeFalse();
        vm.ParsedErrors.Should().BeEmpty();
        vm.EditorCommand.Should().Be("code");
    }

    [Fact]
    public void ToggleRawLogCommand_TogglesVisibility()
    {
        var vm = new CheckDetailViewModel();

        vm.IsRawLogVisible.Should().BeFalse();

        vm.ToggleRawLogCommand.Execute(null);
        vm.IsRawLogVisible.Should().BeTrue();

        vm.ToggleRawLogCommand.Execute(null);
        vm.IsRawLogVisible.Should().BeFalse();
    }

    [Fact]
    public void ParsedErrors_CanAddAndRemove()
    {
        var vm = new CheckDetailViewModel();
        var error = new ParsedError
        {
            FilePath = "src/App.cs",
            LineNumber = 42,
            ColumnNumber = 10,
            Message = "CS0001: Something went wrong",
            ErrorCode = "CS0001",
            Category = "error",
            IsIntroducedByPr = true
        };

        vm.ParsedErrors.Add(error);

        vm.ParsedErrors.Should().HaveCount(1);
        vm.ParsedErrors[0].FilePath.Should().Be("src/App.cs");
        vm.ParsedErrors[0].LineNumber.Should().Be(42);
        vm.ParsedErrors[0].IsIntroducedByPr.Should().BeTrue();

        vm.ParsedErrors.Clear();
        vm.ParsedErrors.Should().BeEmpty();
    }

    [Fact]
    public void GetTruncatedLog_ReturnsAllLines_WhenUnderLimit()
    {
        var vm = new CheckDetailViewModel
        {
            RawLogContent = "line1\nline2\nline3"
        };

        var result = vm.GetTruncatedLog(200);

        result.Should().Be("line1\nline2\nline3");
    }

    [Fact]
    public void GetTruncatedLog_ReturnsLastNLines_WhenOverLimit()
    {
        var lines = Enumerable.Range(1, 300).Select(i => $"line{i}");
        var vm = new CheckDetailViewModel
        {
            RawLogContent = string.Join('\n', lines)
        };

        var result = vm.GetTruncatedLog(200);

        var resultLines = result.Split('\n');
        resultLines.Should().HaveCount(200);
        resultLines[0].Should().Be("line101");
        resultLines[^1].Should().Be("line300");
    }

    [Fact]
    public void GetTruncatedLog_EmptyContent_ReturnsEmpty()
    {
        var vm = new CheckDetailViewModel();

        vm.GetTruncatedLog().Should().Be("");
    }

    [Fact]
    public void Properties_RaisePropertyChanged()
    {
        var vm = new CheckDetailViewModel();
        var changedProperties = new List<string>();
        vm.PropertyChanged += (_, e) => changedProperties.Add(e.PropertyName!);

        vm.CheckName = "build";
        vm.Duration = "2m 30s";
        vm.IsLoading = true;
        vm.RawLogContent = "some log";
        vm.IsRawLogVisible = true;

        changedProperties.Should().Contain("CheckName");
        changedProperties.Should().Contain("Duration");
        changedProperties.Should().Contain("IsLoading");
        changedProperties.Should().Contain("RawLogContent");
        changedProperties.Should().Contain("IsRawLogVisible");
    }

    [Fact]
    public void OpenFileInEditorCommand_DoesNotThrow_WhenErrorIsNull()
    {
        var vm = new CheckDetailViewModel();

        var act = () => vm.OpenFileInEditorCommand.Execute(null);

        act.Should().NotThrow();
    }

    [Fact]
    public void OpenFileInEditorCommand_DoesNotThrow_WhenFilePathIsEmpty()
    {
        var vm = new CheckDetailViewModel();
        var error = new ParsedError { FilePath = "" };

        var act = () => vm.OpenFileInEditorCommand.Execute(error);

        act.Should().NotThrow();
    }

    [Fact]
    public void FixWithClaudeCommand_DoesNotThrow()
    {
        var vm = new CheckDetailViewModel();
        var error = new ParsedError
        {
            FilePath = "src/App.cs",
            LineNumber = 10,
            Message = "Error"
        };

        var act = () => vm.FixWithClaudeCommand.Execute(error);

        act.Should().NotThrow();
    }

    [Fact]
    public void EditorCommand_CanBeChanged()
    {
        var vm = new CheckDetailViewModel { EditorCommand = "rider" };

        vm.EditorCommand.Should().Be("rider");
    }

    [Fact]
    public void ParsedErrors_IsObservable()
    {
        var vm = new CheckDetailViewModel();
        var collectionChangedRaised = false;
        vm.ParsedErrors.CollectionChanged += (_, _) => collectionChangedRaised = true;

        vm.ParsedErrors.Add(new ParsedError { FilePath = "test.cs", Message = "error" });

        collectionChangedRaised.Should().BeTrue();
    }
}
