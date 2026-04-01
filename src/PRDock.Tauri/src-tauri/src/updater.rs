use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

const GITHUB_RELEASES_API: &str =
    "https://api.github.com/repos/borght-dev/PRDock/releases";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TauriLatestJson {
    version: String,
    notes: Option<String>,
}

/// Resolve a GitHub token from gh CLI or settings PAT.
fn resolve_github_token() -> Option<String> {
    if let Ok(token) = crate::auth::gh_cli_token() {
        return Some(token);
    }
    if let Ok(settings) = crate::settings::load_settings() {
        if let Some(pat) = settings.git_hub.personal_access_token {
            if !pat.trim().is_empty() {
                return Some(pat);
            }
        }
    }
    None
}

/// Build an authenticated reqwest client.
fn api_client(token: &Option<String>) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("User-Agent", "PRDock-Updater".parse().unwrap());
    headers.insert(
        "Accept",
        "application/vnd.github.v3+json".parse().unwrap(),
    );
    if let Some(t) = token {
        headers.insert(
            "Authorization",
            format!("Bearer {t}").parse().map_err(|e| format!("{e}"))?,
        );
    }
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}

/// Fetch the latest.json content by finding the newest Tauri release (v* tag,
/// not wpf-v*) via the GitHub API, then downloading the latest.json asset.
/// Also rewrites the platform download URL from the github.com convenience URL
/// to the API asset URL so the updater can download from a private repo.
async fn fetch_latest_json(token: &Option<String>) -> Result<String, String> {
    let client = api_client(token)?;

    // List releases and find the first Tauri release
    let releases: serde_json::Value = client
        .get(format!("{GITHUB_RELEASES_API}?per_page=20"))
        .send()
        .await
        .map_err(|e| format!("Failed to list releases: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Releases API error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse releases: {e}"))?;

    let releases = releases
        .as_array()
        .ok_or("Releases response is not an array")?;

    // Find the first release with a v* tag (not wpf-v*)
    let mut latest_json_api_url: Option<String> = None;
    // Map browser_download_url → API url for .nsis.zip assets
    let mut url_rewrites: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    for release in releases {
        let tag = release["tag_name"].as_str().unwrap_or("");
        if !tag.starts_with('v') || tag.starts_with("wpf-") {
            continue;
        }
        if let Some(assets) = release["assets"].as_array() {
            for asset in assets {
                let name = asset["name"].as_str().unwrap_or("");
                if name.eq_ignore_ascii_case("latest.json") {
                    latest_json_api_url = asset["url"].as_str().map(String::from);
                }
                // Collect API URLs for .nsis.zip so we can rewrite the download URL
                if let (Some(browser_url), Some(api_url)) = (
                    asset["browser_download_url"].as_str(),
                    asset["url"].as_str(),
                ) {
                    url_rewrites.insert(browser_url.to_string(), api_url.to_string());
                }
            }
        }
        if latest_json_api_url.is_some() {
            break;
        }
    }

    let asset_url = latest_json_api_url.ok_or("No Tauri release with latest.json found")?;

    // Download the latest.json asset binary content
    let body = download_asset(token, &asset_url).await?;

    // Rewrite platform download URLs: resolve each github.com URL to a
    // pre-signed CDN URL via the API so the updater can download without auth.
    let mut json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("Invalid latest.json: {e}"))?;
    if let Some(platforms) = json.get_mut("platforms").and_then(|p| p.as_object_mut()) {
        for platform in platforms.values_mut() {
            if let Some(url_val) = platform.get_mut("url") {
                if let Some(url_str) = url_val.as_str() {
                    if let Some(api_url) = url_rewrites.get(url_str) {
                        // Resolve the API asset URL to a pre-signed CDN URL
                        if let Ok(cdn_url) = resolve_cdn_url(token, api_url).await {
                            *url_val = serde_json::Value::String(cdn_url);
                        }
                    }
                }
            }
        }
    }

    serde_json::to_string(&json).map_err(|e| e.to_string())
}

/// Resolve a GitHub API asset URL to a pre-signed CDN URL by following the
/// 302 redirect without actually downloading the file. The CDN URL works
/// without any auth headers, which is what the updater plugin needs.
async fn resolve_cdn_url(token: &Option<String>, api_url: &str) -> Result<String, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("Accept", "application/octet-stream".parse().unwrap());
    if let Some(t) = token {
        headers.insert(
            "Authorization",
            format!("Bearer {t}").parse().map_err(|e| format!("{e}"))?,
        );
    }

    // Disable automatic redirects so we can capture the Location header
    let client = reqwest::Client::builder()
        .default_headers(headers)
        .user_agent("PRDock-Updater")
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(api_url)
        .send()
        .await
        .map_err(|e| format!("Failed to resolve CDN URL: {e}"))?;

    if resp.status() == 302 {
        if let Some(location) = resp.headers().get("location") {
            return location
                .to_str()
                .map(String::from)
                .map_err(|e| format!("Invalid Location header: {e}"));
        }
    }

    Err(format!(
        "Expected 302 redirect, got {}",
        resp.status()
    ))
}

/// Download a GitHub release asset via the API.
async fn download_asset(token: &Option<String>, api_url: &str) -> Result<String, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("Accept", "application/octet-stream".parse().unwrap());
    if let Some(t) = token {
        headers.insert(
            "Authorization",
            format!("Bearer {t}").parse().map_err(|e| format!("{e}"))?,
        );
    }

    reqwest::Client::builder()
        .default_headers(headers)
        .user_agent("PRDock-Updater")
        .build()
        .map_err(|e| e.to_string())?
        .get(api_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download asset: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Asset download error: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Failed to read asset body: {e}"))
}

/// Spin up a one-shot local HTTP server that serves the given body, then
/// return the URL. The server shuts down after the first request.
async fn serve_once(body: String) -> Result<(String, tokio::task::JoinHandle<()>), String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to bind local server: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    let url = format!("http://127.0.0.1:{port}/latest.json");

    let handle = tokio::spawn(async move {
        // Accept one connection
        if let Ok((mut stream, _)) = listener.accept().await {
            use tokio::io::AsyncWriteExt;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes()).await;
            let _ = stream.shutdown().await;
        }
    });

    Ok((url, handle))
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let token = resolve_github_token();
    let json_str = fetch_latest_json(&token).await?;

    let latest: TauriLatestJson =
        serde_json::from_str(&json_str).map_err(|e| format!("Invalid latest.json: {e}"))?;

    // Compare with current version
    let current = app
        .config()
        .version
        .clone()
        .unwrap_or_else(|| "0.0.0".to_string());

    if latest.version == current {
        return Ok(None);
    }

    Ok(Some(UpdateInfo {
        version: latest.version,
        body: latest.notes,
    }))
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle) -> Result<(), String> {
    let token = resolve_github_token();
    let json_str = fetch_latest_json(&token).await?;

    // Serve latest.json from a local one-shot server so the updater plugin
    // can fetch it (the github.com URL doesn't support token auth).
    let (local_url, server_handle) = serve_once(json_str).await?;

    let mut builder = app.updater_builder();
    // Override the endpoint to our local server
    builder = builder.endpoints(vec![local_url.parse().map_err(|e| format!("{e}"))?]).map_err(|e| e.to_string())?;
    // No extra auth needed — the download URL is a pre-signed CDN URL

    let updater = builder.build().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No update available")?;

    // Clean up the one-shot server
    server_handle.abort();

    let handle = app.clone();
    let on_finish = {
        let handle = app.clone();
        move || {
            let _ = handle.emit(
                "update-download-progress",
                serde_json::json!({ "event": "Finished" }),
            );
        }
    };

    update
        .download_and_install(
            move |chunk_length, content_length| {
                let payload = serde_json::json!({
                    "event": "Progress",
                    "data": {
                        "chunkLength": chunk_length,
                        "contentLength": content_length
                    }
                });
                let _ = handle.emit("update-download-progress", payload);
            },
            on_finish,
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
