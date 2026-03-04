namespace PRDock.App.Services;

public interface IGitHubAuthService
{
    Task<string?> GetTokenAsync(CancellationToken ct = default);
    bool IsAuthenticated { get; }
}
