using PRDock.App.Models;

namespace PRDock.App.Services;

public interface ILogParserService
{
    List<ParsedError> Parse(string logText, IReadOnlyList<string> changedFiles);
}
