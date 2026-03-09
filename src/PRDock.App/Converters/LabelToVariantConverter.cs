using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;
using WpfApplication = System.Windows.Application;

namespace PRDock.App.Converters;

/// <summary>
/// Converts a PR label string to badge styling brushes.
/// Parameter: "bg", "fg", or "border" to select which brush to return.
/// </summary>
public sealed class LabelToVariantConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var label = (value as string ?? "").ToLowerInvariant();
        var part = (parameter as string ?? "bg").ToLowerInvariant();

        var variant = label switch
        {
            "feature" or "feat" => "Accent",
            "fix" or "bugfix" or "hotfix" => "Error",
            "refactor" => "Neutral", // purple
            "chore" or "tooling" or "dependencies" => "Warning",
            _ => "Default"
        };

        return (variant, part) switch
        {
            ("Accent", "bg") => FindBrush("AccentSubtleBrush", "#1463B3ED"),
            ("Accent", "fg") => FindBrush("AccentBrush", "#63B3ED"),
            ("Accent", "border") => FindBrush("BranchBadgeBorderBrush", "#2663B3ED"),

            ("Error", "bg") => FindBrush("ErrorBadgeBackgroundBrush", "#1AF87171"),
            ("Error", "fg") => FindBrush("ErrorBadgeForegroundBrush", "#F87171"),
            ("Error", "border") => FindBrush("ErrorBadgeBorderBrush", "#33F87171"),

            ("Neutral", "bg") => FindBrush("NeutralBadgeBackgroundBrush", "#14A78BFA"),
            ("Neutral", "fg") => FindBrush("NeutralBadgeForegroundBrush", "#A78BFA"),
            ("Neutral", "border") => FindBrush("NeutralBadgeBorderBrush", "#33A78BFA"),

            ("Warning", "bg") => FindBrush("WarningBadgeBackgroundBrush", "#1AFBBF24"),
            ("Warning", "fg") => FindBrush("WarningBadgeForegroundBrush", "#FBBF24"),
            ("Warning", "border") => FindBrush("WarningBadgeBorderBrush", "#1FFBBF24"),

            (_, "bg") => FindBrush("SurfaceRaisedBrush", "#058B8FA3"),
            (_, "fg") => FindBrush("TextTertiaryBrush", "#8B8FA3"),
            (_, "border") => FindBrush("SubtleBorderBrush", "#0F8B8FA3"),

            _ => System.Windows.Media.Brushes.Transparent
        };
    }

    private static SolidColorBrush FindBrush(string resourceKey, string fallback)
    {
        if (WpfApplication.Current?.TryFindResource(resourceKey) is SolidColorBrush brush)
            return brush;
        return new SolidColorBrush((System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString(fallback));
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
