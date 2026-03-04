using CommunityToolkit.Mvvm.ComponentModel;

namespace PRDock.App.ViewModels;

public partial class PullRequestCardViewModel
{
    [ObservableProperty]
    private PullRequestClosureState _closureState = PullRequestClosureState.None;

    [ObservableProperty]
    private DateTime? _closedAt;

    public string ClosureBadgeText => ClosureState switch
    {
        PullRequestClosureState.Merged => "Merged \u2713",
        PullRequestClosureState.Closed => "Closed",
        _ => ""
    };

    public bool IsClosed => ClosureState != PullRequestClosureState.None;
}
