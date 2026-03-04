using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class SidebarWindow : Window
{
    private const double HitStripWidth = 4;
    private const double SlideInDurationMs = 200;
    private const double SlideOutDelayMs = 500;
    private const double SlideOutDurationMs = 200;

    private AnimationState _animationState = AnimationState.Visible;
    private DateTime _animationStartTime;
    private double _animationFromLeft;
    private double _animationToLeft;
    private System.Windows.Threading.DispatcherTimer? _slideOutDelayTimer;
    private bool _isAutoHideMode;
    private double _screenEdgeLeft;

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
        ViewModel.PropertyChanged += ViewModel_PropertyChanged;
        UpdateAutoHideMode(ViewModel.SidebarMode);
    }

    private void PositionAtScreenEdge()
    {
        _screenEdgeLeft = SystemParameters.WorkArea.Right - Width;
        Left = _screenEdgeLeft;
        Top = SystemParameters.WorkArea.Top;
        Height = SystemParameters.WorkArea.Height;
    }

    private void ViewModel_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(MainViewModel.SidebarMode))
        {
            UpdateAutoHideMode(ViewModel.SidebarMode);
        }
    }

    internal void UpdateAutoHideMode(string mode)
    {
        bool wasAutoHide = _isAutoHideMode;
        _isAutoHideMode = string.Equals(mode, "autohide", StringComparison.OrdinalIgnoreCase);

        if (_isAutoHideMode && !wasAutoHide)
        {
            var screenRight = SystemParameters.PrimaryScreenWidth;
            _screenEdgeLeft = screenRight - Width;
            Top = 0;
            Height = SystemParameters.PrimaryScreenHeight;
            StartSlideOut(animated: false);
        }
        else if (!_isAutoHideMode && wasAutoHide)
        {
            CancelSlideOutDelay();
            StopAnimation();
            _animationState = AnimationState.Visible;
            PositionAtScreenEdge();
        }
    }

    protected override void OnMouseEnter(System.Windows.Input.MouseEventArgs e)
    {
        base.OnMouseEnter(e);
        if (_isAutoHideMode)
        {
            CancelSlideOutDelay();
            if (_animationState is AnimationState.Hidden or AnimationState.SlidingOut)
            {
                StartSlideIn();
            }
        }
    }

    protected override void OnMouseLeave(System.Windows.Input.MouseEventArgs e)
    {
        base.OnMouseLeave(e);
        if (_isAutoHideMode)
        {
            ScheduleSlideOut();
        }
    }

    protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e)
    {
        base.OnMouseLeftButtonDown(e);
        if (!_isAutoHideMode)
        {
            DragMove();
        }
    }

    internal void StartSlideIn()
    {
        _animationFromLeft = Left;
        _animationToLeft = _screenEdgeLeft;
        _animationStartTime = DateTime.UtcNow;
        _animationState = AnimationState.SlidingIn;
        CompositionTarget.Rendering += OnRendering;
    }

    internal void ScheduleSlideOut()
    {
        CancelSlideOutDelay();
        _slideOutDelayTimer = new System.Windows.Threading.DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(SlideOutDelayMs)
        };
        _slideOutDelayTimer.Tick += (_, _) =>
        {
            _slideOutDelayTimer.Stop();
            StartSlideOut(animated: true);
        };
        _slideOutDelayTimer.Start();
    }

    internal void StartSlideOut(bool animated)
    {
        double hiddenLeft = _screenEdgeLeft + Width - HitStripWidth;

        if (!animated)
        {
            Left = hiddenLeft;
            _animationState = AnimationState.Hidden;
            return;
        }

        _animationFromLeft = Left;
        _animationToLeft = hiddenLeft;
        _animationStartTime = DateTime.UtcNow;
        _animationState = AnimationState.SlidingOut;
        CompositionTarget.Rendering += OnRendering;
    }

    private void OnRendering(object? sender, EventArgs e)
    {
        double elapsed = (DateTime.UtcNow - _animationStartTime).TotalMilliseconds;
        double duration = _animationState == AnimationState.SlidingIn ? SlideInDurationMs : SlideOutDurationMs;
        double t = Math.Min(elapsed / duration, 1.0);

        double eased = 1.0 - Math.Pow(1.0 - t, 3);

        Left = _animationFromLeft + (_animationToLeft - _animationFromLeft) * eased;

        if (t >= 1.0)
        {
            Left = _animationToLeft;
            var finalState = _animationState == AnimationState.SlidingIn
                ? AnimationState.Visible
                : AnimationState.Hidden;
            StopAnimation();
            _animationState = finalState;
        }
    }

    private void StopAnimation()
    {
        CompositionTarget.Rendering -= OnRendering;
    }

    private void CancelSlideOutDelay()
    {
        if (_slideOutDelayTimer is not null)
        {
            _slideOutDelayTimer.Stop();
            _slideOutDelayTimer = null;
        }
    }

    internal void ShowFromHotkey()
    {
        if (_isAutoHideMode)
        {
            CancelSlideOutDelay();
            if (_animationState is AnimationState.Hidden or AnimationState.SlidingOut)
            {
                StartSlideIn();
            }
            else if (_animationState is AnimationState.Visible or AnimationState.SlidingIn)
            {
                CancelSlideOutDelay();
                StartSlideOut(animated: true);
            }
        }
    }

    internal AnimationState CurrentAnimationState => _animationState;
    internal bool IsAutoHideMode => _isAutoHideMode;
}

public enum AnimationState
{
    Visible,
    Hidden,
    SlidingIn,
    SlidingOut
}
