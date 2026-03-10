using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Animation;

namespace PRDock.App.Infrastructure;

/// <summary>
/// Centralized animation helpers for consistent motion across the app.
/// Mirrors CSS keyframe patterns: slide-in, pulse, scale transitions.
/// </summary>
public static class AnimationHelper
{
    // Standard durations
    public static readonly Duration Fast = new(TimeSpan.FromMilliseconds(150));
    public static readonly Duration Normal = new(TimeSpan.FromMilliseconds(250));
    public static readonly Duration Slow = new(TimeSpan.FromMilliseconds(350));

    // Standard easing
    public static readonly IEasingFunction EaseOut = new CubicEase { EasingMode = EasingMode.EaseOut };
    public static readonly IEasingFunction EaseIn = new CubicEase { EasingMode = EasingMode.EaseIn };
    public static readonly IEasingFunction EaseInOut = new CubicEase { EasingMode = EasingMode.EaseInOut };

    /// <summary>
    /// Slide-in animation (CSS: animation:si 0.25s ease forwards; opacity:0; transform:translateY(-4px))
    /// Fades in + slides from offset to 0.
    /// </summary>
    public static void SlideIn(UIElement element, TranslateTransform translate,
        double fromY = -8, Duration? duration = null, Action? completed = null)
    {
        var dur = duration ?? Normal;

        var fade = new DoubleAnimation(0, 1, dur) { EasingFunction = EaseOut };
        if (completed is not null)
            fade.Completed += (_, _) => completed();
        element.BeginAnimation(UIElement.OpacityProperty, fade);

        var slide = new DoubleAnimation(fromY, 0, dur) { EasingFunction = EaseOut };
        translate.BeginAnimation(TranslateTransform.YProperty, slide);
    }

    /// <summary>
    /// Slide-out animation. Fades out + slides to offset.
    /// </summary>
    public static void SlideOut(UIElement element, TranslateTransform translate,
        double toY = -8, Duration? duration = null, Action? completed = null)
    {
        var dur = duration ?? Normal;

        var fade = new DoubleAnimation(1, 0, dur) { EasingFunction = EaseIn };
        if (completed is not null)
            fade.Completed += (_, _) => completed();
        element.BeginAnimation(UIElement.OpacityProperty, fade);

        var slide = new DoubleAnimation(0, toY, dur) { EasingFunction = EaseIn };
        translate.BeginAnimation(TranslateTransform.YProperty, slide);
    }

    /// <summary>
    /// Exampletal slide in (for flyouts, panels). Slides from offsetX to 0 + fades in.
    /// </summary>
    public static void SlideInX(UIElement element, TranslateTransform translate,
        double fromX, Duration? duration = null, Action? completed = null)
    {
        var dur = duration ?? Normal;

        var fade = new DoubleAnimation(0, 1, dur) { EasingFunction = EaseOut };
        if (completed is not null)
            fade.Completed += (_, _) => completed();
        element.BeginAnimation(UIElement.OpacityProperty, fade);

        var slide = new DoubleAnimation(fromX, 0, dur) { EasingFunction = EaseOut };
        translate.BeginAnimation(TranslateTransform.XProperty, slide);
    }

    /// <summary>
    /// Exampletal slide out.
    /// </summary>
    public static void SlideOutX(UIElement element, TranslateTransform translate,
        double toX, Duration? duration = null, Action? completed = null)
    {
        var dur = duration ?? Normal;

        var fade = new DoubleAnimation(1, 0, dur) { EasingFunction = EaseIn };
        if (completed is not null)
            fade.Completed += (_, _) => completed();
        element.BeginAnimation(UIElement.OpacityProperty, fade);

        var slide = new DoubleAnimation(0, toX, dur) { EasingFunction = EaseIn };
        translate.BeginAnimation(TranslateTransform.XProperty, slide);
    }

    /// <summary>
    /// Scale + fade entrance (CSS: opacity:0 → 1 + scale 0.95 → 1.0).
    /// Good for dialogs and popups.
    /// </summary>
    public static void ScaleIn(UIElement element, ScaleTransform scale,
        double fromScale = 0.95, Duration? duration = null, Action? completed = null)
    {
        var dur = duration ?? Normal;

        var fade = new DoubleAnimation(0, 1, dur) { EasingFunction = EaseOut };
        if (completed is not null)
            fade.Completed += (_, _) => completed();
        element.BeginAnimation(UIElement.OpacityProperty, fade);

        var scaleAnim = new DoubleAnimation(fromScale, 1.0, dur) { EasingFunction = EaseOut };
        scale.BeginAnimation(ScaleTransform.ScaleXProperty, scaleAnim);
        scale.BeginAnimation(ScaleTransform.ScaleYProperty, scaleAnim);
    }

    /// <summary>
    /// Scale + fade exit.
    /// </summary>
    public static void ScaleOut(UIElement element, ScaleTransform scale,
        double toScale = 0.95, Duration? duration = null, Action? completed = null)
    {
        var dur = duration ?? Normal;

        var fade = new DoubleAnimation(1, 0, dur) { EasingFunction = EaseIn };
        if (completed is not null)
            fade.Completed += (_, _) => completed();
        element.BeginAnimation(UIElement.OpacityProperty, fade);

        var scaleAnim = new DoubleAnimation(1.0, toScale, dur) { EasingFunction = EaseIn };
        scale.BeginAnimation(ScaleTransform.ScaleXProperty, scaleAnim);
        scale.BeginAnimation(ScaleTransform.ScaleYProperty, scaleAnim);
    }

    /// <summary>
    /// Pulse animation on opacity (CSS: animation:bk 2s ease-in-out infinite).
    /// </summary>
    public static void Pulse(UIElement element, double minOpacity = 0.3,
        TimeSpan? period = null, int repeatCount = 0)
    {
        var dur = period ?? TimeSpan.FromSeconds(2);
        var anim = new DoubleAnimation(1, minOpacity, dur)
        {
            AutoReverse = true,
            EasingFunction = EaseInOut,
            RepeatBehavior = repeatCount > 0
                ? new RepeatBehavior(repeatCount)
                : RepeatBehavior.Forever
        };
        element.BeginAnimation(UIElement.OpacityProperty, anim);
    }

    /// <summary>
    /// Stop pulse / reset opacity to 1.
    /// </summary>
    public static void StopPulse(UIElement element)
    {
        element.BeginAnimation(UIElement.OpacityProperty, null);
        element.Opacity = 1;
    }

    /// <summary>
    /// Simple fade transition.
    /// </summary>
    public static void Fade(UIElement element, double from, double to,
        Duration? duration = null, Action? completed = null)
    {
        var dur = duration ?? Normal;
        var anim = new DoubleAnimation(from, to, dur) { EasingFunction = from < to ? EaseOut : EaseIn };
        if (completed is not null)
            anim.Completed += (_, _) => completed();
        element.BeginAnimation(UIElement.OpacityProperty, anim);
    }
}
