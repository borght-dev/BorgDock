//! WebView2 ships browser shortcuts (Ctrl+F find bar, Ctrl+P print, Ctrl+R
//! reload, F12 devtools, zoom) that swallow keys the app binds itself.
//! WebView2 only picks the setting up on the next navigation, so it's applied
//! on every page load rather than once per window.

pub fn disable<R: tauri::Runtime>(webview: &tauri::Webview<R>) {
    #[cfg(windows)]
    {
        let result = webview.with_webview(|platform_webview| {
            if let Err(e) = disable_accelerator_keys(&platform_webview.controller()) {
                log::warn!("disable browser accelerator keys: {e}");
            }
        });
        if let Err(e) = result {
            log::warn!("disable browser accelerator keys on {}: {e}", webview.label());
        }
    }
    #[cfg(not(windows))]
    let _ = webview;
}

#[cfg(windows)]
fn disable_accelerator_keys(
    controller: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
) -> windows::core::Result<()> {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;

    unsafe {
        controller
            .CoreWebView2()?
            .Settings()?
            .cast::<ICoreWebView2Settings3>()?
            .SetAreBrowserAcceleratorKeysEnabled(false)
    }
}
