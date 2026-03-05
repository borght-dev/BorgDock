using System.IO;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using PRDock.App.Models;

namespace PRDock.App.Services;

public sealed class PRCacheService : IPRCacheService, IDisposable
{
    private static readonly string DbPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PRDock", "cache.db");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private readonly ILogger<PRCacheService> _logger;
    private SqliteConnection? _connection;

    public PRCacheService(ILogger<PRCacheService> logger)
    {
        _logger = logger;
    }

    public async Task<IReadOnlyList<PullRequestWithChecks>> LoadCachedAsync()
    {
        try
        {
            await EnsureInitializedAsync();

            using var cmd = _connection!.CreateCommand();
            cmd.CommandText = "SELECT data FROM pr_cache WHERE id = 1;";
            var result = await cmd.ExecuteScalarAsync();

            if (result is string json && json.Length > 0)
            {
                var cached = JsonSerializer.Deserialize<List<PullRequestWithChecks>>(json, JsonOptions);
                if (cached is not null)
                {
                    _logger.LogInformation("Loaded {Count} cached PRs from SQLite", cached.Count);
                    return cached;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load PR cache, starting fresh");
        }

        return [];
    }

    public async Task SaveAsync(IReadOnlyList<PullRequestWithChecks> results)
    {
        try
        {
            await EnsureInitializedAsync();

            var json = JsonSerializer.Serialize(results, JsonOptions);

            using var cmd = _connection!.CreateCommand();
            cmd.CommandText = """
                INSERT OR REPLACE INTO pr_cache (id, data, updated_at)
                VALUES (1, @data, @updated_at);
                """;
            cmd.Parameters.AddWithValue("@data", json);
            cmd.Parameters.AddWithValue("@updated_at", DateTime.UtcNow.ToString("O"));
            await cmd.ExecuteNonQueryAsync();

            _logger.LogDebug("Cached {Count} PRs to SQLite", results.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to save PR cache");
        }
    }

    private async Task EnsureInitializedAsync()
    {
        if (_connection is not null)
            return;

        Directory.CreateDirectory(Path.GetDirectoryName(DbPath)!);

        _connection = new SqliteConnection($"Data Source={DbPath}");
        await _connection.OpenAsync();

        using var cmd = _connection.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS pr_cache (
                id INTEGER PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """;
        await cmd.ExecuteNonQueryAsync();
    }

    public void Dispose()
    {
        _connection?.Dispose();
    }
}
