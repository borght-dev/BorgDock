using System.Collections.ObjectModel;
using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PRDock.App.Models;
using PRDock.App.Services;

namespace PRDock.App.ViewModels;

public partial class WorkItemsViewModel : ObservableObject
{
    private readonly IAzureDevOpsService _adoService;
    private readonly IAzureDevOpsPollingService _pollingService;
    private readonly ISettingsService _settingsService;

    private IReadOnlyList<WorkItem> _allWorkItems = [];

    public WorkItemsViewModel(
        IAzureDevOpsService adoService,
        IAzureDevOpsPollingService pollingService,
        ISettingsService settingsService)
    {
        _adoService = adoService;
        _pollingService = pollingService;
        _settingsService = settingsService;

        _pollingService.PollCompleted += OnPollCompleted;
        _pollingService.PollFailed += OnPollFailed;
    }

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string _statusText = "";

    [ObservableProperty]
    private bool _isQueryBrowserOpen;

    [ObservableProperty]
    private string _selectedQueryName = "Select a query...";

    [ObservableProperty]
    private Guid? _selectedQueryId;

    [ObservableProperty]
    private string _filterState = "All";

    [ObservableProperty]
    private string _filterAssignedTo = "";

    [ObservableProperty]
    private string _searchQuery = "";

    [ObservableProperty]
    private WorkItemCardViewModel? _selectedWorkItem;

    [ObservableProperty]
    private bool _isDetailOpen;

    public ObservableCollection<WorkItemCardViewModel> FilteredWorkItems { get; } = [];
    public ObservableCollection<AdoQueryTreeNode> QueryTree { get; } = [];
    public ObservableCollection<AdoQueryTreeNode> FavoriteQueries { get; } = [];

    // Available states for filter dropdown
    public ObservableCollection<string> AvailableStates { get; } = ["All"];
    public ObservableCollection<string> AvailableAssignees { get; } = [""];

    partial void OnFilterStateChanged(string value) => ApplyFiltering();
    partial void OnFilterAssignedToChanged(string value) => ApplyFiltering();
    partial void OnSearchQueryChanged(string value) => ApplyFiltering();

    [RelayCommand]
    private void ToggleQueryBrowser()
    {
        IsQueryBrowserOpen = !IsQueryBrowserOpen;
        if (IsQueryBrowserOpen && QueryTree.Count == 0)
            _ = LoadQueriesAsync();
    }

    [RelayCommand]
    private async Task LoadQueriesAsync()
    {
        IsLoading = true;
        try
        {
            var queries = await _adoService.GetQueriesAsync();
            var favorites = _settingsService.CurrentSettings.AzureDevOps.FavoriteQueryIds;

            QueryTree.Clear();
            FavoriteQueries.Clear();

            foreach (var q in queries)
            {
                var node = MapQueryToNode(q, favorites);
                QueryTree.Add(node);
            }
        }
        catch (Exception ex)
        {
            StatusText = $"Failed to load queries: {ex.Message}";
            Serilog.Log.Warning(ex, "Failed to load ADO queries");
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    private async Task SelectQueryAsync(AdoQueryTreeNode node)
    {
        if (node.IsFolder) return;

        SelectedQueryId = node.Id;
        SelectedQueryName = node.Name;
        IsQueryBrowserOpen = false;

        // Persist last selected query
        var settings = _settingsService.CurrentSettings;
        settings.AzureDevOps.LastSelectedQueryId = node.Id;
        await _settingsService.SaveAsync(settings);

        // Start polling with this query
        _pollingService.StartPolling(node.Id);
    }

    [RelayCommand]
    private async Task ToggleFavoriteAsync(AdoQueryTreeNode node)
    {
        if (node.IsFolder) return;

        var settings = _settingsService.CurrentSettings;
        if (node.IsFavorite)
        {
            settings.AzureDevOps.FavoriteQueryIds.Remove(node.Id);
            node.IsFavorite = false;
            var existing = FavoriteQueries.FirstOrDefault(f => f.Id == node.Id);
            if (existing is not null)
                FavoriteQueries.Remove(existing);
        }
        else
        {
            settings.AzureDevOps.FavoriteQueryIds.Add(node.Id);
            node.IsFavorite = true;
            FavoriteQueries.Add(node);
        }

        await _settingsService.SaveAsync(settings);
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        if (_pollingService.CurrentQueryId is null) return;
        IsLoading = true;
        await _pollingService.PollNowAsync();
    }

    [RelayCommand]
    private void OpenWorkItemInBrowser(WorkItemCardViewModel? card)
    {
        if (card is null || string.IsNullOrWhiteSpace(card.HtmlUrl)) return;
        try
        {
            Process.Start(new ProcessStartInfo(card.HtmlUrl) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to open work item URL");
        }
    }

    [RelayCommand]
    private void OpenWorkItemDetail(WorkItemCardViewModel? card)
    {
        if (card is null) return;
        SelectedWorkItem = card;
        IsDetailOpen = true;
        OpenDetailRequested?.Invoke(card);
    }

    [RelayCommand]
    private void CloseDetail()
    {
        IsDetailOpen = false;
        SelectedWorkItem = null;
    }

    public event Action<WorkItemCardViewModel>? OpenDetailRequested;

    public void Initialize()
    {
        var lastQueryId = _settingsService.CurrentSettings.AzureDevOps.LastSelectedQueryId;
        if (lastQueryId is not null)
        {
            SelectedQueryId = lastQueryId;
            _pollingService.StartPolling(lastQueryId.Value);
        }
    }

    private void OnPollCompleted(IReadOnlyList<WorkItem> workItems)
    {
        _allWorkItems = workItems;

        void UpdateUi()
        {
            ApplyFiltering();
            UpdateAvailableFilters();
            StatusText = $"Updated {DateTime.Now:h:mm tt} -- {workItems.Count} items";
            IsLoading = false;
        }

        if (System.Windows.Application.Current?.Dispatcher is { } dispatcher)
            dispatcher.InvokeAsync(UpdateUi);
        else
            UpdateUi();
    }

    private void OnPollFailed(Exception ex)
    {
        void UpdateUi()
        {
            StatusText = $"Poll failed: {ex.Message}";
            IsLoading = false;
        }

        if (System.Windows.Application.Current?.Dispatcher is { } dispatcher)
            dispatcher.InvokeAsync(UpdateUi);
        else
            UpdateUi();
    }

    private void ApplyFiltering()
    {
        var filtered = _allWorkItems.AsEnumerable();

        if (FilterState != "All")
            filtered = filtered.Where(w => w.State.Equals(FilterState, StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(FilterAssignedTo))
            filtered = filtered.Where(w => w.AssignedTo.Contains(FilterAssignedTo, StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(SearchQuery))
        {
            var q = SearchQuery;
            filtered = filtered.Where(w =>
                w.Title.Contains(q, StringComparison.OrdinalIgnoreCase) ||
                w.Id.ToString().Contains(q) ||
                w.Tags.Contains(q, StringComparison.OrdinalIgnoreCase));
        }

        var cards = filtered.Select(WorkItemCardViewModel.FromWorkItem).ToList();

        FilteredWorkItems.Clear();
        foreach (var card in cards)
            FilteredWorkItems.Add(card);
    }

    private void UpdateAvailableFilters()
    {
        var states = _allWorkItems.Select(w => w.State).Distinct().OrderBy(s => s).ToList();
        AvailableStates.Clear();
        AvailableStates.Add("All");
        foreach (var s in states)
            AvailableStates.Add(s);

        var assignees = _allWorkItems.Select(w => w.AssignedTo).Where(a => !string.IsNullOrEmpty(a)).Distinct().OrderBy(a => a).ToList();
        AvailableAssignees.Clear();
        AvailableAssignees.Add("");
        foreach (var a in assignees)
            AvailableAssignees.Add(a);
    }

    private AdoQueryTreeNode MapQueryToNode(AdoQuery query, List<Guid> favoriteIds)
    {
        var node = new AdoQueryTreeNode
        {
            Id = query.Id,
            Name = query.Name,
            Path = query.Path,
            IsFolder = query.IsFolder,
            IsFavorite = favoriteIds.Contains(query.Id)
        };

        if (node.IsFavorite && !node.IsFolder)
            FavoriteQueries.Add(node);

        foreach (var child in query.Children)
            node.Children.Add(MapQueryToNode(child, favoriteIds));

        return node;
    }
}
