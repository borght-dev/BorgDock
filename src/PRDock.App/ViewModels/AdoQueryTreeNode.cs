using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;

namespace PRDock.App.ViewModels;

public partial class AdoQueryTreeNode : ObservableObject
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Path { get; set; } = "";
    public bool IsFolder { get; set; }

    [ObservableProperty]
    private bool _isFavorite;

    [ObservableProperty]
    private bool _isExpanded;

    [ObservableProperty]
    private bool _isSelected;

    public ObservableCollection<AdoQueryTreeNode> Children { get; } = [];
}
