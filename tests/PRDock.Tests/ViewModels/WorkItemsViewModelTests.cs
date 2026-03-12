using System.Net.Http;
using FluentAssertions;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using PRDock.App.Models;
using PRDock.App.Services;
using PRDock.App.ViewModels;

namespace PRDock.Tests.ViewModels;

public class WorkItemsViewModelTests
{
    private readonly IAzureDevOpsService _adoService = Substitute.For<IAzureDevOpsService>();
    private readonly IAzureDevOpsPollingService _pollingService = Substitute.For<IAzureDevOpsPollingService>();
    private readonly ISettingsService _settingsService = Substitute.For<ISettingsService>();

    private WorkItemsViewModel CreateSut(AppSettings? settings = null)
    {
        settings ??= CreateConfiguredSettings();
        _settingsService.CurrentSettings.Returns(settings);
        return new WorkItemsViewModel(_adoService, _pollingService, _settingsService);
    }

    private static AppSettings CreateConfiguredSettings() => new()
    {
        AzureDevOps = { Organization = "myorg", Project = "myproj", PersonalAccessToken = "pat123" }
    };

    // ── Initial state ──────────────────────────────────────────────

    [Fact]
    public void InitialState_HasDefaults()
    {
        var vm = CreateSut();

        vm.IsQueryBrowserOpen.Should().BeFalse();
        vm.SelectedQueryName.Should().Be("Select a query...");
        vm.SelectedQueryId.Should().BeNull();
        vm.QueryTree.Should().BeEmpty();
        vm.FavoriteQueries.Should().BeEmpty();
        vm.FilteredWorkItems.Should().BeEmpty();
        vm.IsLoading.Should().BeFalse();
        vm.FilterState.Should().Be("All");
        vm.SearchQuery.Should().Be("");
    }

    // ── ToggleQueryBrowser ─────────────────────────────────────────

    [Fact]
    public void ToggleQueryBrowser_OpensAndCloses()
    {
        var vm = CreateSut();
        _adoService.GetQueriesAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<AdoQuery>>([]));

        vm.ToggleQueryBrowserCommand.Execute(null);
        vm.IsQueryBrowserOpen.Should().BeTrue();

        vm.ToggleQueryBrowserCommand.Execute(null);
        vm.IsQueryBrowserOpen.Should().BeFalse();
    }

    [Fact]
    public async Task ToggleQueryBrowser_LoadsQueriesOnFirstOpen()
    {
        var vm = CreateSut();
        var queries = new List<AdoQuery>
        {
            new() { Id = Guid.NewGuid(), Name = "My Queries", IsFolder = true, Children =
            [
                new() { Id = Guid.NewGuid(), Name = "My Bugs", IsFolder = false }
            ]},
            new() { Id = Guid.NewGuid(), Name = "Shared Queries", IsFolder = true, Children =
            [
                new() { Id = Guid.NewGuid(), Name = "All Bugs", IsFolder = false }
            ]}
        };
        _adoService.GetQueriesAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<AdoQuery>>(queries));

        vm.ToggleQueryBrowserCommand.Execute(null);

        // Wait for the fire-and-forget LoadQueriesAsync to complete
        await Task.Delay(100);

        vm.QueryTree.Should().HaveCount(2);
        vm.QueryTree[0].Name.Should().Be("My Queries");
        vm.QueryTree[0].IsFolder.Should().BeTrue();
        vm.QueryTree[0].Children.Should().HaveCount(1);
        vm.QueryTree[0].Children[0].Name.Should().Be("My Bugs");

        vm.QueryTree[1].Name.Should().Be("Shared Queries");
        vm.QueryTree[1].IsFolder.Should().BeTrue();
        vm.QueryTree[1].Children.Should().HaveCount(1);
        vm.QueryTree[1].Children[0].Name.Should().Be("All Bugs");
    }

    [Fact]
    public async Task ToggleQueryBrowser_DoesNotReloadIfQueriesAlreadyLoaded()
    {
        var vm = CreateSut();
        var queries = new List<AdoQuery>
        {
            new() { Id = Guid.NewGuid(), Name = "Shared Queries", IsFolder = true }
        };
        _adoService.GetQueriesAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<AdoQuery>>(queries));

        // First open — loads queries
        vm.ToggleQueryBrowserCommand.Execute(null);
        await Task.Delay(100);
        vm.QueryTree.Should().HaveCount(1);

        // Close and re-open — should NOT reload
        vm.ToggleQueryBrowserCommand.Execute(null);
        vm.ToggleQueryBrowserCommand.Execute(null);
        await Task.Delay(100);

        await _adoService.Received(1).GetQueriesAsync(Arg.Any<CancellationToken>());
    }

    // ── LoadQueries ────────────────────────────────────────────────

    [Fact]
    public async Task LoadQueries_PopulatesQueryTree()
    {
        var vm = CreateSut();
        var sharedId = Guid.NewGuid();
        var queries = new List<AdoQuery>
        {
            new()
            {
                Id = Guid.NewGuid(),
                Name = "My Queries",
                Path = "My Queries",
                IsFolder = true,
                Children =
                [
                    new() { Id = Guid.NewGuid(), Name = "Assigned to me", Path = "My Queries/Assigned to me" }
                ]
            },
            new()
            {
                Id = sharedId,
                Name = "Shared Queries",
                Path = "Shared Queries",
                IsFolder = true,
                Children =
                [
                    new() { Id = Guid.NewGuid(), Name = "Open Bugs", Path = "Shared Queries/Open Bugs" },
                    new() { Id = Guid.NewGuid(), Name = "Sprint Backlog", Path = "Shared Queries/Sprint Backlog" }
                ]
            }
        };
        _adoService.GetQueriesAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<AdoQuery>>(queries));

        vm.LoadQueriesCommand.Execute(null);
        await Task.Delay(100);

        vm.QueryTree.Should().HaveCount(2);
        vm.QueryTree[1].Children.Should().HaveCount(2);
        vm.QueryTree[1].Children[0].Name.Should().Be("Open Bugs");
        vm.QueryTree[1].Children[1].Name.Should().Be("Sprint Backlog");
    }

    [Fact]
    public async Task LoadQueries_MarksFavoritesCorrectly()
    {
        var favoriteId = Guid.NewGuid();
        var settings = CreateConfiguredSettings();
        settings.AzureDevOps.FavoriteQueryIds.Add(favoriteId);
        _settingsService.CurrentSettings.Returns(settings);

        var vm = new WorkItemsViewModel(_adoService, _pollingService, _settingsService);
        var queries = new List<AdoQuery>
        {
            new()
            {
                Id = Guid.NewGuid(),
                Name = "Shared Queries",
                IsFolder = true,
                Children =
                [
                    new() { Id = favoriteId, Name = "My Favorite Query" },
                    new() { Id = Guid.NewGuid(), Name = "Not Favorite" }
                ]
            }
        };
        _adoService.GetQueriesAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<AdoQuery>>(queries));

        vm.LoadQueriesCommand.Execute(null);
        await Task.Delay(100);

        vm.QueryTree[0].Children[0].IsFavorite.Should().BeTrue();
        vm.QueryTree[0].Children[1].IsFavorite.Should().BeFalse();

        vm.FavoriteQueries.Should().HaveCount(1);
        vm.FavoriteQueries[0].Name.Should().Be("My Favorite Query");
    }

    [Fact]
    public async Task LoadQueries_SetsStatusTextOnFailure()
    {
        var vm = CreateSut();
        _adoService.GetQueriesAsync(Arg.Any<CancellationToken>())
            .ThrowsAsync(new HttpRequestException("Network error"));

        vm.LoadQueriesCommand.Execute(null);
        await Task.Delay(100);

        vm.StatusText.Should().Contain("Failed to load queries");
        vm.StatusText.Should().Contain("Network error");
        vm.IsLoading.Should().BeFalse();
    }

    [Fact]
    public async Task LoadQueries_ClearsExistingTreeBeforeReloading()
    {
        var vm = CreateSut();

        // First load
        _adoService.GetQueriesAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<AdoQuery>>(new List<AdoQuery>
            {
                new() { Id = Guid.NewGuid(), Name = "First", IsFolder = true }
            }));
        vm.LoadQueriesCommand.Execute(null);
        await Task.Delay(100);
        vm.QueryTree.Should().HaveCount(1);

        // Second load with different data
        _adoService.GetQueriesAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<AdoQuery>>(new List<AdoQuery>
            {
                new() { Id = Guid.NewGuid(), Name = "Second", IsFolder = true },
                new() { Id = Guid.NewGuid(), Name = "Third", IsFolder = true }
            }));
        vm.LoadQueriesCommand.Execute(null);
        await Task.Delay(100);

        vm.QueryTree.Should().HaveCount(2);
        vm.QueryTree[0].Name.Should().Be("Second");
    }

    // ── SelectQuery ────────────────────────────────────────────────

    [Fact]
    public async Task SelectQuery_SetsSelectedQueryAndCloseBrowser()
    {
        var vm = CreateSut();
        var queryId = Guid.NewGuid();
        var node = new AdoQueryTreeNode { Id = queryId, Name = "My Bug Query", IsFolder = false };

        vm.IsQueryBrowserOpen = true;

        vm.SelectQueryCommand.Execute(node);
        await Task.Delay(100);

        vm.SelectedQueryId.Should().Be(queryId);
        vm.SelectedQueryName.Should().Be("My Bug Query");
        vm.IsQueryBrowserOpen.Should().BeFalse();
    }

    [Fact]
    public async Task SelectQuery_StartsPolling()
    {
        var vm = CreateSut();
        var queryId = Guid.NewGuid();
        var node = new AdoQueryTreeNode { Id = queryId, Name = "Test Query", IsFolder = false };

        vm.SelectQueryCommand.Execute(node);
        await Task.Delay(100);

        _pollingService.Received(1).StartPolling(queryId);
    }

    [Fact]
    public async Task SelectQuery_PersistsLastSelectedQueryId()
    {
        var settings = CreateConfiguredSettings();
        _settingsService.CurrentSettings.Returns(settings);
        var vm = new WorkItemsViewModel(_adoService, _pollingService, _settingsService);

        var queryId = Guid.NewGuid();
        var node = new AdoQueryTreeNode { Id = queryId, Name = "Persisted Query", IsFolder = false };

        vm.SelectQueryCommand.Execute(node);
        await Task.Delay(100);

        settings.AzureDevOps.LastSelectedQueryId.Should().Be(queryId);
        await _settingsService.Received(1).SaveAsync(settings);
    }

    [Fact]
    public async Task SelectQuery_IgnoresFolders()
    {
        var vm = CreateSut();
        var folderNode = new AdoQueryTreeNode { Id = Guid.NewGuid(), Name = "Folder", IsFolder = true };

        vm.IsQueryBrowserOpen = true;

        vm.SelectQueryCommand.Execute(folderNode);
        await Task.Delay(100);

        vm.SelectedQueryId.Should().BeNull();
        vm.SelectedQueryName.Should().Be("Select a query...");
        vm.IsQueryBrowserOpen.Should().BeTrue(); // Should remain open
        _pollingService.DidNotReceive().StartPolling(Arg.Any<Guid>());
    }

    // ── ToggleFavorite ─────────────────────────────────────────────

    [Fact]
    public async Task ToggleFavorite_AddsToFavorites()
    {
        var settings = CreateConfiguredSettings();
        _settingsService.CurrentSettings.Returns(settings);
        var vm = new WorkItemsViewModel(_adoService, _pollingService, _settingsService);

        var queryId = Guid.NewGuid();
        var node = new AdoQueryTreeNode { Id = queryId, Name = "Bug Query", IsFolder = false, IsFavorite = false };

        vm.ToggleFavoriteCommand.Execute(node);
        await Task.Delay(100);

        node.IsFavorite.Should().BeTrue();
        settings.AzureDevOps.FavoriteQueryIds.Should().Contain(queryId);
        vm.FavoriteQueries.Should().Contain(node);
        await _settingsService.Received(1).SaveAsync(settings);
    }

    [Fact]
    public async Task ToggleFavorite_RemovesFromFavorites()
    {
        var queryId = Guid.NewGuid();
        var settings = CreateConfiguredSettings();
        settings.AzureDevOps.FavoriteQueryIds.Add(queryId);
        _settingsService.CurrentSettings.Returns(settings);
        var vm = new WorkItemsViewModel(_adoService, _pollingService, _settingsService);

        var node = new AdoQueryTreeNode { Id = queryId, Name = "Bug Query", IsFolder = false, IsFavorite = true };
        vm.FavoriteQueries.Add(node);

        vm.ToggleFavoriteCommand.Execute(node);
        await Task.Delay(100);

        node.IsFavorite.Should().BeFalse();
        settings.AzureDevOps.FavoriteQueryIds.Should().NotContain(queryId);
        vm.FavoriteQueries.Should().NotContain(node);
    }

    [Fact]
    public async Task ToggleFavorite_IgnoresFolders()
    {
        var settings = CreateConfiguredSettings();
        _settingsService.CurrentSettings.Returns(settings);
        var vm = new WorkItemsViewModel(_adoService, _pollingService, _settingsService);

        var folderNode = new AdoQueryTreeNode { Id = Guid.NewGuid(), Name = "Folder", IsFolder = true };

        vm.ToggleFavoriteCommand.Execute(folderNode);
        await Task.Delay(100);

        settings.AzureDevOps.FavoriteQueryIds.Should().BeEmpty();
        vm.FavoriteQueries.Should().BeEmpty();
    }

    // ── Initialize ─────────────────────────────────────────────────

    [Fact]
    public void Initialize_RestoresLastSelectedQuery()
    {
        var queryId = Guid.NewGuid();
        var settings = CreateConfiguredSettings();
        settings.AzureDevOps.LastSelectedQueryId = queryId;
        _settingsService.CurrentSettings.Returns(settings);

        var vm = new WorkItemsViewModel(_adoService, _pollingService, _settingsService);
        vm.Initialize();

        vm.SelectedQueryId.Should().Be(queryId);
        _pollingService.Received(1).StartPolling(queryId);
    }

    [Fact]
    public void Initialize_DoesNothingWithoutLastSelectedQuery()
    {
        var vm = CreateSut();
        vm.Initialize();

        vm.SelectedQueryId.Should().BeNull();
        _pollingService.DidNotReceive().StartPolling(Arg.Any<Guid>());
    }

    // ── Nested query hierarchy ─────────────────────────────────────

    [Fact]
    public async Task LoadQueries_MapsNestedFolderHierarchy()
    {
        var vm = CreateSut();
        var leafId = Guid.NewGuid();
        var queries = new List<AdoQuery>
        {
            new()
            {
                Id = Guid.NewGuid(),
                Name = "Shared Queries",
                IsFolder = true,
                Children =
                [
                    new()
                    {
                        Id = Guid.NewGuid(),
                        Name = "Team Queries",
                        IsFolder = true,
                        Children =
                        [
                            new() { Id = leafId, Name = "Sprint Items" }
                        ]
                    }
                ]
            }
        };
        _adoService.GetQueriesAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<AdoQuery>>(queries));

        vm.LoadQueriesCommand.Execute(null);
        await Task.Delay(100);

        var leaf = vm.QueryTree[0].Children[0].Children[0];
        leaf.Name.Should().Be("Sprint Items");
        leaf.Id.Should().Be(leafId);
        leaf.IsFolder.Should().BeFalse();
    }

    // ── Empty API response ─────────────────────────────────────────

    [Fact]
    public async Task LoadQueries_HandlesEmptyResponse()
    {
        var vm = CreateSut();
        _adoService.GetQueriesAsync(Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<AdoQuery>>([]));

        vm.LoadQueriesCommand.Execute(null);
        await Task.Delay(100);

        vm.QueryTree.Should().BeEmpty();
        vm.IsLoading.Should().BeFalse();
    }

    // ── Not configured ─────────────────────────────────────────────

    [Fact]
    public async Task LoadQueries_ShowsErrorWhenNotConfigured()
    {
        var vm = CreateSut(new AppSettings()); // empty ADO settings

        vm.LoadQueriesCommand.Execute(null);
        await Task.Delay(100);

        vm.QueryLoadError.Should().Contain("not configured");
        vm.IsLoading.Should().BeFalse();
        await _adoService.DidNotReceive().GetQueriesAsync(Arg.Any<CancellationToken>());
    }

    [Theory]
    [InlineData("", "proj", "pat")]
    [InlineData("org", "", "pat")]
    [InlineData("org", "proj", "")]
    [InlineData("org", "proj", null)]
    public async Task LoadQueries_ShowsErrorWhenAnySettingMissing(string org, string proj, string? pat)
    {
        var settings = new AppSettings
        {
            AzureDevOps = { Organization = org, Project = proj, PersonalAccessToken = pat }
        };
        var vm = CreateSut(settings);

        vm.LoadQueriesCommand.Execute(null);
        await Task.Delay(100);

        vm.QueryLoadError.Should().Contain("not configured");
        await _adoService.DidNotReceive().GetQueriesAsync(Arg.Any<CancellationToken>());
    }
}
