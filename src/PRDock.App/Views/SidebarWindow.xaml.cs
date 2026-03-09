using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using Microsoft.Extensions.DependencyInjection;
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
    }

    private MainViewModel ViewModel => (MainViewModel)DataContext;

    private void SidebarWindow_Loaded(object sender, RoutedEventArgs e)
    {
        PositionAtScreenEdge();

        // Wire settings flyout when it opens
        ViewModel.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(MainViewModel.IsSettingsOpen) && ViewModel.IsSettingsOpen)
            {
                WireSettingsFlyout();
            }
        };

        // Wire worktree prune dialog
        ViewModel.ManageWorktreesRequested += OnManageWorktreesRequested;

        // Wire PR detail view
        ViewModel.OpenPRDetailRequested += OnOpenPRDetailRequested;
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
        _detailWindow.Closed += (_, _) => _detailWindow = null;

        PositionDetailWindow(_detailWindow);
        _detailWindow.Show();
    }

    private void PositionDetailWindow(PRDetailWindow detailWindow)
    {
        var detailWidth = 750.0;
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

    protected override void OnDeactivated(EventArgs e)
    {
        base.OnDeactivated(e);
        ViewModel.MinimizeToBadgeCommand.Execute(null);
    }

    protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e)
    {
        base.OnMouseLeftButtonDown(e);
        DragMove();
    }

}
