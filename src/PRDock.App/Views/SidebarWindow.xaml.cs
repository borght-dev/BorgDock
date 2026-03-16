using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using Microsoft.Extensions.DependencyInjection;
using PRDock.App.Infrastructure;
using PRDock.App.Models;
using PRDock.App.Services;
using PRDock.App.ViewModels;
using WinFormsScreen = System.Windows.Forms.Screen;

namespace PRDock.App.Views;

public partial class SidebarWindow : Window
{
    private string _sidebarEdge = "right";
    private System.Windows.Threading.DispatcherTimer? _widthDebounceTimer;

    public SidebarWindow(MainViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();
        Loaded += SidebarWindow_Loaded;
        IsVisibleChanged += SidebarWindow_IsVisibleChanged;
    }

    private void SidebarWindow_IsVisibleChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (e.NewValue is true && IsLoaded)
        {
            PlayEntranceAnimation();
        }
    }

    private MainViewModel ViewModel => (MainViewModel)DataContext;

    private void SidebarWindow_Loaded(object sender, RoutedEventArgs e)
    {
        PositionAtScreenEdge();
        PlayEntranceAnimation();

        // Wire settings flyout when it opens/closes
        ViewModel.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(MainViewModel.IsSettingsOpen))
            {
                if (ViewModel.IsSettingsOpen)
                {
                    WireSettingsFlyout();
                    PlaySettingsOpenAnimation();
                }
                else
                {
                    PlaySettingsCloseAnimation();
                }
            }
        };

        // Wire worktree prune dialog
        ViewModel.ManageWorktreesRequested += OnManageWorktreesRequested;

        // Wire work item detail view
        if (ViewModel.WorkItems is not null)
        {
            ViewModel.WorkItems.OpenDetailRequested += OnOpenWorkItemDetailRequested;
        }

        // Wire PR detail view
        ViewModel.OpenPRDetailRequested += OnOpenPRDetailRequested;
    }

    private void PlayEntranceAnimation()
    {
        // Slide the entire window in from off-screen so background moves with content
        var sidebarWidth = ActualWidth > 0 ? ActualWidth : Width;
        var finalLeft = Left;

        // Start off-screen: right-docked slides in from the right, left-docked from the left
        var offScreenLeft = _sidebarEdge == "left"
            ? finalLeft - sidebarWidth
            : finalLeft + sidebarWidth;

        var slide = new DoubleAnimation(offScreenLeft, finalLeft, AnimationHelper.Slow)
        {
            EasingFunction = AnimationHelper.EaseOut
        };
        BeginAnimation(LeftProperty, slide);
    }

    private void PlaySettingsOpenAnimation()
    {
        SettingsOverlay.Visibility = Visibility.Visible;

        // Fade in overlay background
        AnimationHelper.Fade(SettingsOverlay, 0, 1, AnimationHelper.Normal);

        // Slide flyout panel in from right
        var slide = new DoubleAnimation(360, 0, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseOut
        };
        SettingsFlyoutTranslate.BeginAnimation(TranslateTransform.XProperty, slide);
    }

    private void PlaySettingsCloseAnimation()
    {
        // Fade out overlay background
        AnimationHelper.Fade(SettingsOverlay, 1, 0, AnimationHelper.Normal, () =>
        {
            SettingsOverlay.Visibility = Visibility.Collapsed;
        });

        // Slide flyout panel out to the right
        var slide = new DoubleAnimation(0, 360, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseIn
        };
        SettingsFlyoutTranslate.BeginAnimation(TranslateTransform.XProperty, slide);
    }

    private void OnManageWorktreesRequested()
    {
        var app = (App)System.Windows.Application.Current;
        var sp = app.ServiceProvider;
        if (sp is null) return;

        var vm = new WorktreePruneViewModel(
            sp.GetRequiredService<IWorktreeService>(),
            sp.GetRequiredService<IGitHubService>(),
            sp.GetRequiredService<ISettingsService>());

        var dialog = new WorktreePruneDialog(vm) { Owner = this };
        dialog.ShowDialog();
    }

    private PRDetailWindow? _detailWindow;

    private void OnOpenPRDetailRequested(PullRequestCardViewModel card)
    {
        var app = (App)System.Windows.Application.Current;
        var sp = app.ServiceProvider;
        if (sp is null) return;

        var vm = sp.GetRequiredService<ViewModels.PRDetailViewModel>();
        vm.Initialize(card);

        if (_detailWindow is not null)
        {
            _detailWindow.Close();
        }

        _detailWindow = new PRDetailWindow(vm);
        vm.CloseRequested += () =>
        {
            _detailWindow?.Close();
            _detailWindow = null;
            _suppressAutoHide = false;
        };
        vm.RefreshRequested += () =>
        {
            // Trigger immediate poll after an action (approve, comment, etc.)
            var pollingService = sp.GetService<PRDock.App.Services.IPRPollingService>();
            if (pollingService is not null)
                _ = pollingService.PollNowAsync();
        };
        vm.RerunChecksRequested += () => card.RerunRequested?.Invoke(card);
        vm.FixWithClaudeRequested += () => card.FixWithClaudeRequested?.Invoke(card);
        vm.ToggleDraftRequested += () => card.ToggleDraftRequested?.Invoke(card);
        _detailWindow.Closed += (_, _) =>
        {
            _detailWindow = null;
            _suppressAutoHide = false;
        };

        _suppressAutoHide = true;
        PositionDetailWindow(_detailWindow);
        _detailWindow.Show();
    }

    private void PositionDetailWindow(PRDetailWindow detailWindow)
    {
        var detailWidth = 800.0;
        detailWindow.Width = detailWidth;
        detailWindow.Top = Top;
        detailWindow.Height = Height;

        if (_sidebarEdge == "right")
        {
            // Sidebar is on the right, detail opens to its left
            detailWindow.Left = Left - detailWidth;
        }
        else
        {
            // Sidebar is on the left, detail opens to its right
            detailWindow.Left = Left + ActualWidth;
        }
    }

    private SettingsViewModel? _settingsVm;

    private void WireSettingsFlyout()
    {
        var sp = ((App)System.Windows.Application.Current).ServiceProvider;
        var settingsService = sp?.GetService(typeof(Services.ISettingsService)) as Services.ISettingsService;
        if (settingsService is null) return;

        if (_settingsVm is null)
        {
            var startupManager = sp?.GetService(typeof(Services.IStartupManager)) as Services.IStartupManager;
            var updateService = sp?.GetService(typeof(Services.IUpdateService)) as Services.IUpdateService;
            _settingsVm = new SettingsViewModel(settingsService, startupManager, updateService);
            _settingsVm.SaveCompleted += () => ViewModel.IsSettingsOpen = false;
            _settingsVm.CancelCompleted += OnSettingsCancelled;
            _settingsVm.PropertyChanged += SettingsVm_PropertyChanged;
            SettingsFlyoutPanel.DataContext = _settingsVm;
        }
        else
        {
            // Reload from saved settings each time the flyout opens,
            // discarding any unsaved changes (e.g. an Add without Save).
            _settingsVm.LoadFromSettings(settingsService.CurrentSettings);
        }
    }

    private void OnSettingsCancelled()
    {
        // LoadFromSettings already ran (resets VM properties),
        // which triggers PropertyChanged → live preview reverts automatically.
        ViewModel.IsSettingsOpen = false;
    }

    private void SettingsVm_PropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (_settingsVm is null) return;

        switch (e.PropertyName)
        {
            case nameof(SettingsViewModel.Theme):
                ApplyThemeLive(_settingsVm.Theme);
                break;
            case nameof(SettingsViewModel.SidebarEdge):
                ApplyEdgeLive(_settingsVm.SidebarEdge);
                break;
            case nameof(SettingsViewModel.SidebarWidthPx):
                DebounceApplyWidth(_settingsVm.SidebarWidthPx);
                break;
        }
    }

    private void ApplyThemeLive(string theme)
    {
        if (System.Windows.Application.Current is App app)
        {
            app.ThemeManager?.ApplyTheme(theme);
        }
    }

    private void ApplyEdgeLive(string edge)
    {
        _sidebarEdge = string.Equals(edge, "left", StringComparison.OrdinalIgnoreCase)
            ? "left" : "right";
        if (IsLoaded) PositionAtScreenEdge();
    }

    private void DebounceApplyWidth(int widthPx)
    {
        _widthDebounceTimer?.Stop();
        _widthDebounceTimer = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(150)
        };
        _widthDebounceTimer.Tick += (_, _) =>
        {
            _widthDebounceTimer.Stop();
            Width = widthPx;
            if (IsLoaded) PositionAtScreenEdge();
        };
        _widthDebounceTimer.Start();
    }

    internal void ApplyUiSettings(UiSettings settings)
    {
        Width = settings.SidebarWidthPx;
        _sidebarEdge = string.Equals(settings.SidebarEdge, "left", StringComparison.OrdinalIgnoreCase)
            ? "left"
            : "right";

        if (IsLoaded)
        {
            PositionAtScreenEdge();
        }
    }

    private void PositionAtScreenEdge(WinFormsScreen? targetScreen = null)
    {
        var screen = targetScreen ?? GetCurrentScreen();
        var screenBounds = GetScaledRect(screen.Bounds);
        var workArea = GetScaledRect(screen.WorkingArea);
        var sidebarWidth = ActualWidth > 0 ? ActualWidth : Width;

        var edgeLeft = _sidebarEdge == "left"
            ? screenBounds.Left
            : screenBounds.Left + screenBounds.Width - sidebarWidth;
        Left = edgeLeft;
        Top = workArea.Top;
        Height = workArea.Height;
    }

    private Rect GetScaledRect(System.Drawing.Rectangle rect)
    {
        var compositionTarget = PresentationSource.FromVisual(this)?.CompositionTarget;

        if (compositionTarget is null)
        {
            return new Rect(rect.Left, rect.Top, rect.Width, rect.Height);
        }

        var topLeft = compositionTarget.TransformFromDevice.Transform(
            new System.Windows.Point(rect.Left, rect.Top));
        var bottomRight = compositionTarget.TransformFromDevice.Transform(
            new System.Windows.Point(rect.Right, rect.Bottom));
        return new Rect(topLeft, bottomRight);
    }

    private WinFormsScreen GetCurrentScreen()
    {
        var handle = new WindowInteropHelper(this).Handle;
        if (handle != IntPtr.Zero)
        {
            return WinFormsScreen.FromHandle(handle);
        }

        return WinFormsScreen.PrimaryScreen ?? WinFormsScreen.FromPoint(System.Windows.Forms.Cursor.Position);
    }

    internal void RevealOnScreen(WinFormsScreen? targetScreen)
    {
        PositionAtScreenEdge(targetScreen);
    }

    private void OnOpenWorkItemDetailRequested(WorkItemCardViewModel card)
    {
        var app = (App)System.Windows.Application.Current;
        var sp = app.ServiceProvider;
        if (sp is null) return;

        var vm = sp.GetRequiredService<WorkItemDetailViewModel>();
        _ = vm.LoadCommand.ExecuteAsync(card.Id);
        vm.WorkItemSaved += () => ViewModel.WorkItems?.RefreshCommand.Execute(null);
        ShowWorkItemDetailWindow(vm);
    }

    // QuerySelector now uses Command binding directly in XAML

    private void NewWorkItem_Click(object sender, RoutedEventArgs e)
    {
        var app = (App)System.Windows.Application.Current;
        var sp = app.ServiceProvider;
        if (sp is null) return;

        var vm = sp.GetRequiredService<WorkItemDetailViewModel>();
        vm.PrepareNewItem();
        vm.WorkItemSaved += () => ViewModel.WorkItems?.RefreshCommand.Execute(null);
        ShowWorkItemDetailWindow(vm);
    }

    private WorkItemDetailWindow? _workItemDetailWindow;
    private bool _suppressAutoHide;

    private void ShowWorkItemDetailWindow(WorkItemDetailViewModel vm)
    {
        _workItemDetailWindow?.Close();

        _workItemDetailWindow = new WorkItemDetailWindow(vm);
        _workItemDetailWindow.Closed += (_, _) =>
        {
            _workItemDetailWindow = null;
            _suppressAutoHide = false;
        };

        // Position adjacent to sidebar
        var detailWidth = 600.0;
        _workItemDetailWindow.Width = detailWidth;
        _workItemDetailWindow.Top = Top;
        _workItemDetailWindow.Height = Height;

        if (_sidebarEdge == "right")
            _workItemDetailWindow.Left = Left - detailWidth;
        else
            _workItemDetailWindow.Left = Left + ActualWidth;

        _suppressAutoHide = true;
        _workItemDetailWindow.Show();
    }

    protected override void OnDeactivated(EventArgs e)
    {
        base.OnDeactivated(e);
        if (!_suppressAutoHide)
            ViewModel.MinimizeToBadgeCommand.Execute(null);
    }

    protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e)
    {
        base.OnMouseLeftButtonDown(e);
        DragMove();
    }

}
