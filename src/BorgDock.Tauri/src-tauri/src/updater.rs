use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

/// The canonical "latest release" endpoint — returns the single release
/// GitHub considers newest (non-draft, non-prerelease). The listing
/// endpoint (/releases) is NOT reliably sorted by newest-first: duplicate
/// tags, re-published releases, or create_time vs published_at mismatches
/// can cause an older release to appear first. The previous version of
/// this file iterated the listing and broke on the first release with a
/// latest.json asset, which happened to be v1.0.9 — making auto-updates
/// silently no-op since v1.0.8.
const GITHUB_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/borght-dev/BorgDock/releases/latest";

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

/// Build an authenticated reqwest client for the GitHub API.
fn api_client(token: &Option<String>) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("User-Agent", "BorgDock-Updater".parse().unwrap());
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

/// Fetch the latest.json content from the repository's canonical latest
/// release via GitHub API, then download the latest.json asset. Also
/// rewrites the platform download URL to a pre-signed CDN URL so the
/// updater plugin can download from a private repo without auth headers.
///
/// Uses GET /releases/latest (single release) rather than GET /releases
/// (listing). The listing endpoint is not reliably ordered by newest-first
/// — in this repo it returned v1.0.9 before v1.0.11, which made the old
/// "take the first release with a latest.json" loop always pick the wrong
/// release and silently conclude "current is already latest" since v1.0.8.
/// The /latest endpoint returns exactly one release, the one GitHub marks
/// as isLatest, which for us is the newest semver-tagged, non-draft,
/// non-prerelease release.
async fn fetch_latest_json(token: &Option<String>) -> Result<String, String> {
    let client = api_client(token)?;

    log::info!("updater: fetching {GITHUB_LATEST_RELEASE_API}");

    let release: serde_json::Value = client
        .get(GITHUB_LATEST_RELEASE_API)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch latest release: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Latest release API error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse latest release: {e}"))?;

    let tag = release["tag_name"].as_str().unwrap_or("");
    log::info!("updater: latest release = {tag}");

    // Defensive: ignore legacy WPF tags just in case they ever land as latest.
    if !tag.starts_with('v') || tag.starts_with("wpf-") {
        return Err(format!(
            "latest release tag '{tag}' is not a Tauri release (expected v*, not wpf-v*)"
        ));
    }

    let mut latest_json_api_url: Option<String> = None;
    let mut url_rewrites: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    if let Some(assets) = release["assets"].as_array() {
        for asset in assets {
            let name = asset["name"].as_str().unwrap_or("");
            if name.eq_ignore_ascii_case("latest.json") {
                latest_json_api_url = asset["url"].as_str().map(String::from);
            }
            if let (Some(browser_url), Some(api_url)) = (
                asset["browser_download_url"].as_str(),
                asset["url"].as_str(),
            ) {
                url_rewrites.insert(browser_url.to_string(), api_url.to_string());
            }
        }
    }

    let asset_url =
        latest_json_api_url.ok_or_else(|| format!("Release {tag} has no latest.json asset"))?;
    let body = download_asset(token, &asset_url).await?;

    // Rewrite platform download URLs to pre-signed CDN URLs
    let mut json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("Invalid latest.json: {e}"))?;
    if let Some(platforms) = json.get_mut("platforms").and_then(|p| p.as_object_mut()) {
        for platform in platforms.values_mut() {
            if let Some(url_val) = platform.get_mut("url") {
                if let Some(url_str) = url_val.as_str() {
                    if let Some(api_url) = url_rewrites.get(url_str) {
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
/// 302 redirect. The CDN URL works without any auth headers.
async fn resolve_cdn_url(token: &Option<String>, api_url: &str) -> Result<String, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("Accept", "application/octet-stream".parse().unwrap());
    if let Some(t) = token {
        headers.insert(
            "Authorization",
            format!("Bearer {t}").parse().map_err(|e| format!("{e}"))?,
        );
    }

    let client = reqwest::Client::builder()
        .default_headers(headers)
        .user_agent("BorgDock-Updater")
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

    Err(format!("Expected 302 redirect, got {}", resp.status()))
}

/// Download a GitHub release asset via the API (text content).
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
        .user_agent("BorgDock-Updater")
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

/// Spin up a local HTTP server on a dedicated OS thread (not tokio) that serves
/// the given body. Returns the URL and a handle to stop the server.
/// Uses std::net to avoid tokio runtime issues on Windows.
///
/// # Security note
/// This serves on `127.0.0.1` only (loopback — not reachable from the network).
/// The `dangerousInsecureTransportProtocol` setting in tauri.conf.json is required
/// because the Tauri updater plugin refuses `http://` URLs by default. This is safe
/// here because the server is local-only, ephemeral, and serves pre-authenticated
/// content fetched from the GitHub API — no secrets are exposed over the wire.
fn serve_local(body: String) -> Result<(String, std::thread::JoinHandle<()>), String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind local server: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    // Short timeout so the thread doesn't hang forever
    listener
        .set_nonblocking(false)
        .map_err(|e| e.to_string())?;
    let url = format!("http://127.0.0.1:{port}/latest.json");

    let handle = std::thread::spawn(move || {
        // Serve up to 3 requests (the updater may make retries)
        for _ in 0..3 {
            if let Ok((mut stream, _)) = listener.accept() {
                use std::io::{Read, Write};
                // Read the request (we don't care about the content)
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf);
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
        }
    });

    Ok((url, handle))
}

/// Simple semver comparison: returns true if `a` is newer than `b`.
fn is_newer(a: &str, b: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.split('.').filter_map(|s| s.parse().ok()).collect()
    };
    let va = parse(a);
    let vb = parse(b);
    va > vb
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let token = resolve_github_token();
    let json_str = fetch_latest_json(&token).await?;

    let latest: TauriLatestJson =
        serde_json::from_str(&json_str).map_err(|e| format!("Invalid latest.json: {e}"))?;

    let current = app
        .config()
        .version
        .clone()
        .unwrap_or_else(|| "0.0.0".to_string());

    let newer = is_newer(&latest.version, &current);
    log::info!(
        "updater: current={current} latest={} newer={newer}",
        latest.version
    );

    if !newer {
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

    // Serve latest.json from a local server (blocking std::net on a separate
    // thread) so the updater plugin can fetch it.
    let (local_url, _server_handle) = serve_local(json_str)?;

    let builder = app
        .updater_builder()
        .endpoints(vec![local_url.parse().map_err(|e| format!("{e}"))?])
        .map_err(|e| e.to_string())?;

    let updater = builder.build().map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("No update available")?;

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
