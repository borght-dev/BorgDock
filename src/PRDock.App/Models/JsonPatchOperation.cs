using System.Text.Json.Serialization;

namespace PRDock.App.Models;

public sealed class JsonPatchOperation
{
    [JsonPropertyName("op")]
    public string Op { get; set; } = "add";

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("value")]
    public object? Value { get; set; }
}
