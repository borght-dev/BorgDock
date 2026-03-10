using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using WpfColor = System.Windows.Media.Color;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class FloatingBadgeWindow : Window
{
    private string _lastBackgroundColor = "green";

    public FloatingBadgeWindow(FloatingBadgeViewModel viewModel)
    {
        DataContext = viewModel;
        InitializeComponent();

        viewModel.PropertyChanged += ViewModel_PropertyChanged;
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
    }

    private void UpdateGlowColors(FloatingBadgeViewModel vm)
    {
        var glowColor = vm.BackgroundColor switch
        {
            "red" => WpfColor.FromRgb(0xF8, 0x71, 0x71),
            "yellow" => WpfColor.FromRgb(0xFB, 0xBF, 0x24),
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

        // Opacity pulse for most styles
        var opacityAnim = new DoubleAnimation(1.0, 0.7, TimeSpan.FromSeconds(0.5))
        {
            AutoReverse = true,
            RepeatBehavior = new RepeatBehavior(3)
        };
        target.BeginAnimation(OpacityProperty, opacityAnim);

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

    private void ExpandedPanel_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        // Prevent window drag when clicking inside the expanded panel
        e.Handled = true;
    }
}
