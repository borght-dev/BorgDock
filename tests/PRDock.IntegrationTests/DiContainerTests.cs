using System.Net.Http;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PRDock.App.Services;
using PRDock.App.ViewModels;

namespace PRDock.IntegrationTests;

public sealed class DiContainerTests : IDisposable
{
    private readonly ServiceProvider _serviceProvider;

    public DiContainerTests()
    {
        var services = new ServiceCollection();

        // Replicate the registrations from App.xaml.cs ConfigureServices
        services.AddLogging(builder => builder.ClearProviders());

        services.AddHttpClient("GitHub", client =>
        {
            client.BaseAddress = new Uri("https://api.github.com/");
            client.DefaultRequestHeaders.Add("Accept", "application/vnd.github.v3+json");
            client.DefaultRequestHeaders.Add("User-Agent", "PRDock");
        });

        services.AddSingleton<ISettingsService, SettingsService>();
        services.AddSingleton<MainViewModel>();

        _serviceProvider = services.BuildServiceProvider();
    }

    public void Dispose()
    {
        _serviceProvider.Dispose();
    }

    [Fact]
    public void Resolve_ISettingsService_ReturnsSettingsService()
    {
        var service = _serviceProvider.GetRequiredService<ISettingsService>();

        service.Should().NotBeNull();
        service.Should().BeOfType<SettingsService>();
    }

    [Fact]
    public void Resolve_MainViewModel_ReturnsInstance()
    {
        var viewModel = _serviceProvider.GetRequiredService<MainViewModel>();

        viewModel.Should().NotBeNull();
    }

    [Fact]
    public void Resolve_IHttpClientFactory_ReturnsInstance()
    {
        var factory = _serviceProvider.GetRequiredService<IHttpClientFactory>();

        factory.Should().NotBeNull();
    }

    [Fact]
    public void Resolve_IHttpClientFactory_CreatesNamedGitHubClient()
    {
        var factory = _serviceProvider.GetRequiredService<IHttpClientFactory>();
        var client = factory.CreateClient("GitHub");

        client.Should().NotBeNull();
        client.BaseAddress.Should().NotBeNull();
        client.BaseAddress!.ToString().Should().Be("https://api.github.com/");
    }

    [Fact]
    public void Resolve_LoggerForSettingsService_ReturnsInstance()
    {
        var logger = _serviceProvider.GetRequiredService<ILogger<SettingsService>>();

        logger.Should().NotBeNull();
    }

    [Fact]
    public void Resolve_ISettingsService_ReturnsSameInstance_AsSingleton()
    {
        var first = _serviceProvider.GetRequiredService<ISettingsService>();
        var second = _serviceProvider.GetRequiredService<ISettingsService>();

        first.Should().BeSameAs(second);
    }

    [Fact]
    public void Resolve_MainViewModel_ReturnsSameInstance_AsSingleton()
    {
        var first = _serviceProvider.GetRequiredService<MainViewModel>();
        var second = _serviceProvider.GetRequiredService<MainViewModel>();

        first.Should().BeSameAs(second);
    }

    [Fact]
    public void Resolve_AllKeyServices_NoExceptionsThrown()
    {
        // Act & Assert — resolving all key services should not throw
        var act = () =>
        {
            _ = _serviceProvider.GetRequiredService<ISettingsService>();
            _ = _serviceProvider.GetRequiredService<MainViewModel>();
            _ = _serviceProvider.GetRequiredService<IHttpClientFactory>();
            _ = _serviceProvider.GetRequiredService<ILogger<SettingsService>>();
        };

        act.Should().NotThrow();
    }
}
