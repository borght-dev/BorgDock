using System;
using System.Collections.Generic;
using System.Windows;
using System.Windows.Media;
using PRDock.App.ViewModels;

namespace PRDock.App.Views;

public partial class BadgeShowcaseWindow : Window
{
    private static readonly string[] BadgeStyles =
        ["GlassCapsule", "MinimalNotch", "FloatingIsland", "LiquidMorph", "SpectralBar"];

    private static readonly Uri LightThemeUri =
        new("pack://application:,,,/Resources/Themes/LightTheme.xaml", UriKind.Absolute);

    private static readonly Uri DarkThemeUri =
        new("pack://application:,,,/Resources/Themes/DarkTheme.xaml", UriKind.Absolute);

    private readonly List<FloatingBadgeWindow> _badgeWindows = [];

    public BadgeShowcaseWindow()
    {
        InitializeComponent();
    }

    private void Window_Loaded(object sender, RoutedEventArgs e)
    {
        var lightTheme = new ResourceDictionary { Source = LightThemeUri };
        var darkTheme = new ResourceDictionary { Source = DarkThemeUri };

        const double cellWidth = 280;
        const double lightRowOffsetY = 100;  // from top of window
        const double darkRowOffsetY = 490;
        const double colStartX = 50;

        for (int themeRow = 0; themeRow < 2; themeRow++)
        {
            var theme = themeRow == 0 ? lightTheme : darkTheme;
            double rowY = themeRow == 0 ? lightRowOffsetY : darkRowOffsetY;

            for (int col = 0; col < BadgeStyles.Length; col++)
            {
                var style = BadgeStyles[col];
                var vm = CreateSampleViewModel(style);
                var window = new FloatingBadgeWindow(vm);

                // Apply per-window theme override (DynamicResource re-resolves)
                window.Resources.MergedDictionaries.Add(theme);

                // Disable topmost so they don't float above everything
                window.Topmost = false;
                window.Owner = this;

                // Position relative to showcase window
                window.Left = Left + colStartX + col * cellWidth;
                window.Top = Top + rowY;

                window.Show();
                _badgeWindows.Add(window);
            }
        }
    }

    private static FloatingBadgeViewModel CreateSampleViewModel(string badgeStyle)
    {
        var vm = new FloatingBadgeViewModel { BadgeStyle = badgeStyle };

        vm.Update(
            totalPrCount: 5,
            failingCount: 1,
            pendingCount: 1,
            prStatuses: ["green", "green", "red", "yellow", "green"],
            authors:
            [
                new BadgeAuthorInfo
                {
                    Initials = "KV",
                    BackgroundBrush = FloatingBadgeViewModel.GetAuthorBrush("koen")
                },
                new BadgeAuthorInfo
                {
                    Initials = "JD",
                    BackgroundBrush = FloatingBadgeViewModel.GetAuthorBrush("john")
                },
                new BadgeAuthorInfo
                {
                    Initials = "AS",
                    BackgroundBrush = FloatingBadgeViewModel.GetAuthorBrush("alice")
                }
            ]);

        // Sample expanded-panel data
        vm.MyPrs.Add(new BadgePrItem
        {
            Title = "Add user authentication",
            Number = 42,
            TimeAgo = "2h ago",
            StatusColor = "green",
            ChecksText = "8/8"
        });
        vm.MyPrs.Add(new BadgePrItem
        {
            Title = "Fix CI pipeline timeout",
            Number = 57,
            TimeAgo = "30m ago",
            StatusColor = "red",
            ChecksText = "3/8"
        });
        vm.TeamPrs.Add(new BadgePrItem
        {
            Title = "Update dependencies",
            Number = 61,
            TimeAgo = "1h ago",
            StatusColor = "yellow",
            ChecksText = "5/8",
            IsInProgress = true
        });
        vm.TeamPrs.Add(new BadgePrItem
        {
            Title = "Refactor data layer",
            Number = 63,
            TimeAgo = "4h ago",
            StatusColor = "green",
            ChecksText = "12/12"
        });
        vm.TeamPrs.Add(new BadgePrItem
        {
            Title = "Add dark mode support",
            Number = 65,
            TimeAgo = "1d ago",
            StatusColor = "green",
            ChecksText = "6/6"
        });

        vm.NeedsReviewCount = 2;
        vm.ReadyCount = 2;
        vm.LastUpdatedText = DateTime.Now.ToString("h:mm tt");

        return vm;
    }

    private void Window_Closed(object? sender, EventArgs e)
    {
        foreach (var w in _badgeWindows)
            w.Close();
        _badgeWindows.Clear();

        System.Windows.Application.Current?.Shutdown();
    }
}
