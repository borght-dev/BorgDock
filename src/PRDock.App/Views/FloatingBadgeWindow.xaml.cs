using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using PRDock.App.Infrastructure;
using WpfColor = System.Windows.Media.Color;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class FloatingBadgeWindow : Window
{
    private string _lastBackgroundColor = "green";
    private bool _anchorBottom;

    public FloatingBadgeWindow(FloatingBadgeViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();

        viewModel.PropertyChanged += ViewModel_PropertyChanged;

        // Wire up hover scale animation on the handle pill
        HandlePill.MouseEnter += (_, _) => AnimateHandlePillScale(1.15);
        HandlePill.MouseLeave += (_, _) => AnimateHandlePillScale(1.0);

        // Auto-detect expand direction based on screen position
        LocationChanged += (_, _) => UpdateExpandDirection();
        Loaded += (_, _) => UpdateExpandDirection();

        // Keep badge pinned when expanding upward by anchoring the bottom edge
        SizeChanged += (_, e) =>
        {
            if (_anchorBottom && e.HeightChanged)
            {
                Top -= e.NewSize.Height - e.PreviousSize.Height;
            }
        };
    }

    private void ViewModel_PropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(FloatingBadgeViewModel.BackgroundColor))
        {
            var vm = (FloatingBadgeViewModel)DataContext;
            if (vm.BackgroundColor != _lastBackgroundColor)
            {
                _lastBackgroundColor = vm.BackgroundColor;
                UpdateGlowColors(vm);
                PlayPulseAnimation(vm);
            }
        }
        else if (e.PropertyName == nameof(FloatingBadgeViewModel.IsExpanded))
        {
            var vm = (FloatingBadgeViewModel)DataContext;
            if (vm.IsExpanded)
                PlayExpandAnimation();
            else
                PlayCollapseAnimation();
        }
        else if (e.PropertyName == nameof(FloatingBadgeViewModel.ExpandUpward))
        {
            var vm = (FloatingBadgeViewModel)DataContext;
            ApplyExpandDirection(vm.ExpandUpward);
        }
    }

    private void UpdateExpandDirection()
    {
        if (DataContext is not FloatingBadgeViewModel vm) return;
        if (!IsLoaded) return;

        var source = PresentationSource.FromVisual(this);
        var dpiScaleY = source?.CompositionTarget?.TransformToDevice.M22 ?? 1.0;

        var screenPoint = new System.Drawing.Point(
            (int)(Left * dpiScaleY),
            (int)(Top * dpiScaleY));
        var screen = System.Windows.Forms.Screen.FromPoint(screenPoint);
        var workingArea = screen.WorkingArea;
        var midY = workingArea.Top + workingArea.Height / 2.0;

        vm.ExpandUpward = (Top * dpiScaleY) > midY;
    }

    private void ApplyExpandDirection(bool expandUpward)
    {
        _anchorBottom = expandUpward;

        // Reorder grid rows:
        // Downward: Toast(0), Badge(1), Handle(2), Panel(3)
        // Upward:   Panel(0), Handle(1), Toast(2), Badge(3)
        Grid.SetRow(ToastBorder, expandUpward ? 2 : 0);
        Grid.SetRow(BadgeGrid, expandUpward ? 3 : 1);
        Grid.SetRow(HandlePill, expandUpward ? 1 : 2);
        Grid.SetRow(ExpandedPanel, expandUpward ? 0 : 3);

        // Flip handle pill margin (overlap with badge)
        HandlePill.Margin = expandUpward
            ? new Thickness(0, 0, 0, -1)
            : new Thickness(0, -1, 0, 0);

        // Flip expanded panel margin and scale origin
        ExpandedPanel.Margin = expandUpward
            ? new Thickness(0, 0, 0, 2)
            : new Thickness(0, 2, 0, 0);
        ExpandedPanel.RenderTransformOrigin = expandUpward
            ? new System.Windows.Point(0.5, 1.0)
            : new System.Windows.Point(0.5, 0.0);
    }

    private void AnimateHandlePillScale(double targetScale)
    {
        var anim = new DoubleAnimation(targetScale, AnimationHelper.Fast)
        {
            EasingFunction = AnimationHelper.EaseOut
        };
        HandlePillScale.BeginAnimation(ScaleTransform.ScaleXProperty, anim);
        HandlePillScale.BeginAnimation(ScaleTransform.ScaleYProperty, anim);
    }

    private void PlayExpandAnimation()
    {
        var expandUpward = (DataContext as FloatingBadgeViewModel)?.ExpandUpward ?? false;

        // Ensure the panel is visible before animating
        ExpandedPanel.Visibility = Visibility.Visible;

        // Scale from 0.95 → 1.0
        var scaleX = new DoubleAnimation(0.95, 1.0, AnimationHelper.Normal) { EasingFunction = AnimationHelper.EaseOut };
        var scaleY = new DoubleAnimation(0.95, 1.0, AnimationHelper.Normal) { EasingFunction = AnimationHelper.EaseOut };
        ExpandedPanelScale.BeginAnimation(ScaleTransform.ScaleXProperty, scaleX);
        ExpandedPanelScale.BeginAnimation(ScaleTransform.ScaleYProperty, scaleY);

        // Slide direction depends on expand direction
        var slideFrom = expandUpward ? 8.0 : -8.0;
        var slide = new DoubleAnimation(slideFrom, 0, AnimationHelper.Normal) { EasingFunction = AnimationHelper.EaseOut };
        ExpandedPanelTranslate.BeginAnimation(TranslateTransform.YProperty, slide);

        // Fade in
        AnimationHelper.Fade(ExpandedPanel, 0, 1, AnimationHelper.Normal);
    }

    private void PlayCollapseAnimation()
    {
        var expandUpward = (DataContext as FloatingBadgeViewModel)?.ExpandUpward ?? false;

        // Scale from 1.0 → 0.95
        var scaleX = new DoubleAnimation(1.0, 0.95, AnimationHelper.Normal) { EasingFunction = AnimationHelper.EaseIn };
        var scaleY = new DoubleAnimation(1.0, 0.95, AnimationHelper.Normal) { EasingFunction = AnimationHelper.EaseIn };
        ExpandedPanelScale.BeginAnimation(ScaleTransform.ScaleXProperty, scaleX);
        ExpandedPanelScale.BeginAnimation(ScaleTransform.ScaleYProperty, scaleY);

        // Slide direction depends on expand direction
        var slideTo = expandUpward ? 8.0 : -8.0;
        var slide = new DoubleAnimation(0, slideTo, AnimationHelper.Normal) { EasingFunction = AnimationHelper.EaseIn };
        ExpandedPanelTranslate.BeginAnimation(TranslateTransform.YProperty, slide);

        // Fade out, then collapse visibility
        var fade = new DoubleAnimation(1, 0, AnimationHelper.Normal) { EasingFunction = AnimationHelper.EaseIn };
        fade.Completed += (_, _) =>
        {
            if (DataContext is FloatingBadgeViewModel vm && !vm.IsExpanded)
                ExpandedPanel.Visibility = Visibility.Collapsed;
        };
        ExpandedPanel.BeginAnimation(OpacityProperty, fade);
    }

    private void UpdateGlowColors(FloatingBadgeViewModel vm)
    {
        var glowColor = vm.BackgroundColor switch
        {
            "red" => WpfColor.FromRgb(0xF8, 0x71, 0x71),
            "yellow" => WpfColor.FromRgb(0xF5, 0x9E, 0x0B),
            _ => WpfColor.FromRgb(0x34, 0xD3, 0x99),
        };

        if (GlassCapsuleBorder?.Effect is DropShadowEffect glassGlow)
            glassGlow.Color = glowColor;

        if (FloatingIslandBorder?.Effect is DropShadowEffect islandGlow)
            islandGlow.Color = glowColor;
    }

    private void PlayPulseAnimation(FloatingBadgeViewModel vm)
    {
        var target = vm.BadgeStyle switch
        {
            "GlassCapsule" => GlassCapsuleBorder,
            "MinimalNotch" => MinimalNotchBorder,
            "FloatingIsland" => FloatingIslandBorder,
            "LiquidMorph" => LiquidMorphBorder,
            "SpectralBar" => SpectralBarBorder,
            _ => GlassCapsuleBorder,
        };

        if (target is null) return;

        // Opacity pulse (CSS: bk animation)
        AnimationHelper.Pulse(target, minOpacity: 0.7, period: TimeSpan.FromSeconds(0.5), repeatCount: 3);

        // Scale pulse for Liquid Morph ring
        if (vm.BadgeStyle == "LiquidMorph" && MorphRing?.RenderTransform is ScaleTransform scale)
        {
            var scaleAnim = new DoubleAnimation(1.0, 1.08, TimeSpan.FromSeconds(0.4))
            {
                AutoReverse = true,
                RepeatBehavior = new RepeatBehavior(3)
            };
            scale.BeginAnimation(ScaleTransform.ScaleXProperty, scaleAnim);
            scale.BeginAnimation(ScaleTransform.ScaleYProperty, scaleAnim);
        }
    }

    private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton == MouseButton.Left)
        {
            var startLeft = Left;
            var startTop = Top;
            DragMove();

            // DragMove() is blocking — after it returns, check if the window
            // actually moved. If it didn't, treat it as a click.
            if (Math.Abs(Left - startLeft) < 4 && Math.Abs(Top - startTop) < 4)
            {
                if (DataContext is FloatingBadgeViewModel vm)
                {
                    vm.ExpandSidebarCommand.Execute(null);
                }
            }
        }
    }

    /// <summary>
    /// Fade + scale out, then hide the window.
    /// </summary>
    public void FadeOutAndHide()
    {
        var fade = new DoubleAnimation(1, 0, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseIn
        };
        fade.Completed += (_, _) =>
        {
            Hide();
            // Reset for next show
            BeginAnimation(OpacityProperty, null);
            Opacity = 1;
        };
        BeginAnimation(OpacityProperty, fade);
    }

    /// <summary>
    /// Fade in when the badge window is shown.
    /// </summary>
    public void FadeInAndShow()
    {
        Opacity = 0;
        Show();
        var fade = new DoubleAnimation(0, 1, AnimationHelper.Normal)
        {
            EasingFunction = AnimationHelper.EaseOut
        };
        BeginAnimation(OpacityProperty, fade);
    }

    private void ExpandedPanel_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        // Prevent window drag when clicking inside the expanded panel
        e.Handled = true;
    }
}
