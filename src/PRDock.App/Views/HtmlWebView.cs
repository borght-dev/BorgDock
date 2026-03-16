using System.Text;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using PRDock.App.Infrastructure;
using PRDock.App.Services;

namespace PRDock.App.Views;

/// <summary>
/// A thin wrapper around WebView2 that renders HTML content with theme-aware CSS.
/// Automatically injects ADO PAT auth for images from dev.azure.com.
/// </summary>
public class HtmlWebView : System.Windows.Controls.ContentControl
{
    private static CoreWebView2Environment? _sharedEnvironment;
    private static readonly SemaphoreSlim _envLock = new(1, 1);
    private WebView2? _webView;
    private bool _isInitialized;
    private string? _pendingContent;

    public static readonly DependencyProperty HtmlContentProperty =
        DependencyProperty.Register(nameof(HtmlContent), typeof(string), typeof(HtmlWebView),
            new PropertyMetadata(null, OnHtmlContentChanged));

    /// <summary>
    /// Optional: set to inject auth headers for ADO image URLs.
    /// </summary>
    public static ISettingsService? SettingsService { get; set; }

    public string? HtmlContent
    {
        get => (string?)GetValue(HtmlContentProperty);
        set => SetValue(HtmlContentProperty, value);
    }

    public HtmlWebView()
    {
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        if (_webView is not null) return;

        _webView = new WebView2
        {
            DefaultBackgroundColor = System.Drawing.Color.Transparent,
        };
        Content = _webView;

        try
        {
            await _envLock.WaitAsync();
            try
            {
                _sharedEnvironment ??= await CoreWebView2Environment.CreateAsync(
                    userDataFolder: System.IO.Path.Combine(
                        System.IO.Path.GetTempPath(), "PRDock_WebView2"));
            }
            finally
            {
                _envLock.Release();
            }

            await _webView.EnsureCoreWebView2Async(_sharedEnvironment);

            // Disable navigation, context menu, dev tools
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

            // Inject auth for ADO image URLs
            _webView.CoreWebView2.AddWebResourceRequestedFilter("https://dev.azure.com/*", CoreWebView2WebResourceContext.Image);
            _webView.CoreWebView2.WebResourceRequested += OnWebResourceRequested;

            // Open links in external browser
            _webView.CoreWebView2.NewWindowRequested += (_, args) =>
            {
                args.Handled = true;
                if (!string.IsNullOrWhiteSpace(args.Uri))
                {
                    try
                    {
                        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(args.Uri)
                        {
                            UseShellExecute = true
                        });
                    }
                    catch { }
                }
            };

            _isInitialized = true;

            // Render any content that was set before initialization completed
            if (_pendingContent is not null || HtmlContent is not null)
                RenderContent();
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to initialize WebView2");
            Content = new System.Windows.Controls.TextBlock
            {
                Text = "WebView2 not available. Install Edge WebView2 Runtime.",
                TextWrapping = TextWrapping.Wrap,
                Foreground = (System.Windows.Media.Brush)FindResource("TextMutedBrush"),
                FontSize = 11,
                Margin = new Thickness(8),
            };
        }
    }

    private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs args)
    {
        // Inject ADO PAT as Basic auth header for image requests to dev.azure.com
        var pat = SettingsService?.CurrentSettings.AzureDevOps.PersonalAccessToken;
        if (!string.IsNullOrWhiteSpace(pat) && args.Request.Uri.Contains("dev.azure.com", StringComparison.OrdinalIgnoreCase))
        {
            var bytes = Encoding.ASCII.GetBytes($":{pat}");
            var authValue = $"Basic {Convert.ToBase64String(bytes)}";
            args.Request.Headers.SetHeader("Authorization", authValue);
        }
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        if (_webView is not null)
        {
            try { _webView.Dispose(); } catch { }
            _webView = null;
            _isInitialized = false;
        }
    }

    private static void OnHtmlContentChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is HtmlWebView view)
        {
            view._pendingContent = e.NewValue as string;
            view.RenderContent();
        }
    }

    private void RenderContent()
    {
        if (!_isInitialized || _webView?.CoreWebView2 is null)
            return;

        var html = HtmlContent ?? _pendingContent;
        _pendingContent = null;
        var isDark = ThemeManager.Instance?.CurrentTheme == "dark";
        var wrapped = HtmlFieldRenderer.WrapHtml(html, isDark);
        _webView.CoreWebView2.NavigateToString(wrapped);
    }
}
