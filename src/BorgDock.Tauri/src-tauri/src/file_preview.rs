//! Serves an HTML file of a pull request to a sandboxed frame, so the page
//! can run its scripts without reaching BorgDock.
//!
//! The page comes from a loopback HTTP origin, never from a Tauri custom
//! protocol. Tauri counts a registered custom protocol as a local origin
//! (`Webview::is_local_url`), this app has no ACL manifest for its own
//! commands, and on Windows wry adds the IPC initialization script, invoke key
//! included, to every subframe. A frame served from a custom protocol could
//! therefore call any command. `http://127.0.0.1:<port>` is a remote origin:
//! Tauri rejects its IPC calls because no capability names it.
//!
//! The port comes from a short fixed list so the app's CSP can name each one
//! in `frame-src`; a page that navigates its own frame cannot reach another
//! local server.

use base64::Engine;
use serde::Deserialize;
use std::collections::{HashMap, VecDeque};
use std::net::Ipv4Addr;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::OnceCell;

/// The ports a preview may be served from. `tauri.conf.json` lists the same
/// origins in `frame-src`; `csp_names_every_preview_port` keeps them equal.
pub const PREVIEW_PORTS: [u16; 4] = [41847, 41848, 41849, 41850];

const MAX_PREVIEWS: usize = 6;
const MAX_PREVIEW_BYTES: usize = 12 * 1024 * 1024;
const MAX_REQUEST_HEAD: usize = 8 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);

/// One file of a preview: its path in the repository and its bytes.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PreviewFile {
    pub path: String,
    pub base64: String,
}

struct Preview {
    token: String,
    files: HashMap<String, Arc<Vec<u8>>>,
}

type Shelf = Arc<Mutex<VecDeque<Preview>>>;

/// The previews on offer and the server that hands them out, started with
/// the first preview.
#[derive(Default)]
pub struct FilePreviews {
    shelf: Shelf,
    port: OnceCell<u16>,
}

/// A path as the page asks for it: forward slashes, no empty or dot segments.
fn clean_path(path: &str) -> Option<String> {
    let segments: Vec<&str> = path.split('/').collect();
    let valid = !segments.is_empty()
        && segments
            .iter()
            .all(|s| !s.is_empty() && *s != "." && *s != ".." && !s.contains('\\'));
    valid.then(|| segments.join("/"))
}

fn content_type(path: &str) -> &'static str {
    let extension = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match extension.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "txt" | "md" | "csv" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// What a previewed page may do. `sandbox` without `allow-same-origin` gives
/// it an opaque origin; it loads its own files and public HTTPS assets, and
/// opens no connection other than to its own files.
fn content_security_policy(port: u16) -> String {
    let own = format!("http://127.0.0.1:{port}");
    format!(
        "sandbox allow-scripts; default-src 'none'; \
         script-src 'unsafe-inline' 'unsafe-eval' {own} https:; \
         style-src 'unsafe-inline' {own} https:; \
         img-src {own} data: blob: https:; \
         font-src {own} data: https:; \
         media-src {own} data: blob: https:; \
         connect-src {own}; worker-src blob:; \
         frame-src 'none'; form-action 'none'; base-uri 'none'"
    )
}

fn put(shelf: &Shelf, files: Vec<PreviewFile>, entry: &str) -> Result<(String, String), String> {
    let entry = clean_path(entry).ok_or("The preview's path is not valid.")?;
    let mut decoded = HashMap::new();
    let mut total = 0usize;
    for file in files {
        let path = clean_path(&file.path).ok_or("A preview file's path is not valid.")?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(file.base64.as_bytes())
            .map_err(|_| "A preview file is not valid base64.".to_string())?;
        total += bytes.len();
        if total > MAX_PREVIEW_BYTES {
            return Err("The preview is too large.".into());
        }
        decoded.insert(path, Arc::new(bytes));
    }
    if !decoded.contains_key(&entry) {
        return Err("The preview does not contain its own page.".into());
    }
    let token = uuid::Uuid::new_v4().simple().to_string();
    let mut previews = shelf.lock().map_err(|e| e.to_string())?;
    previews.push_back(Preview {
        token: token.clone(),
        files: decoded,
    });
    while previews.len() > MAX_PREVIEWS {
        previews.pop_front();
    }
    Ok((token, entry))
}

fn take(shelf: &Shelf, token: &str) {
    if let Ok(mut previews) = shelf.lock() {
        previews.retain(|preview| preview.token != token);
    }
}

fn find(shelf: &Shelf, token: &str, path: &str) -> Option<Arc<Vec<u8>>> {
    let previews = shelf.lock().ok()?;
    previews
        .iter()
        .find(|preview| preview.token == token)?
        .files
        .get(path)
        .cloned()
}

enum Answer {
    File {
        path: String,
        body: Arc<Vec<u8>>,
        head_only: bool,
    },
    Refused(u16, &'static str),
}

/// What to answer to a request head. Only `GET` and `HEAD` for a file of a
/// live preview, asked of this server by its own address: another host name
/// means a page elsewhere pointed its DNS at this machine.
fn answer(shelf: &Shelf, port: u16, head: &str) -> Answer {
    let mut lines = head.split("\r\n");
    let mut request = lines.next().unwrap_or("").split(' ');
    let method = request.next().unwrap_or("");
    let target = request.next().unwrap_or("");
    if method != "GET" && method != "HEAD" {
        return Answer::Refused(405, "Method Not Allowed");
    }
    let host = lines
        .filter_map(|line| line.split_once(':'))
        .find(|(name, _)| name.eq_ignore_ascii_case("host"))
        .map(|(_, value)| value.trim());
    if host != Some(format!("127.0.0.1:{port}").as_str()) {
        return Answer::Refused(403, "Forbidden");
    }
    let path = target.split(['?', '#']).next().unwrap_or("");
    let Some((token, file)) = path.trim_start_matches('/').split_once('/') else {
        return Answer::Refused(404, "Not Found");
    };
    let Some(file) = urlencoding::decode(file)
        .ok()
        .and_then(|file| clean_path(&file))
    else {
        return Answer::Refused(404, "Not Found");
    };
    match find(shelf, token, &file) {
        Some(body) => Answer::File {
            path: file,
            body,
            head_only: method == "HEAD",
        },
        None => Answer::Refused(404, "Not Found"),
    }
}

async fn read_head(stream: &mut TcpStream) -> Option<String> {
    let mut head = Vec::new();
    let mut chunk = [0u8; 1024];
    while !head.windows(4).any(|w| w == b"\r\n\r\n") {
        if head.len() > MAX_REQUEST_HEAD {
            return None;
        }
        let read = stream.read(&mut chunk).await.ok()?;
        if read == 0 {
            return None;
        }
        head.extend_from_slice(&chunk[..read]);
    }
    String::from_utf8(head).ok()
}

async fn serve(mut stream: TcpStream, shelf: Shelf, port: u16) {
    let Ok(Some(head)) = tokio::time::timeout(REQUEST_TIMEOUT, read_head(&mut stream)).await
    else {
        return;
    };
    let (response, body) = match answer(&shelf, port, &head) {
        Answer::File {
            path,
            body,
            head_only,
        } => (
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\n\
                 Content-Security-Policy: {}\r\nX-Content-Type-Options: nosniff\r\n\
                 Referrer-Policy: no-referrer\r\nCache-Control: no-store\r\n\
                 Access-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
                content_type(&path),
                body.len(),
                content_security_policy(port),
            ),
            (!head_only).then_some(body),
        ),
        Answer::Refused(status, reason) => (
            format!("HTTP/1.1 {status} {reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"),
            None,
        ),
    };
    let _ = stream.write_all(response.as_bytes()).await;
    if let Some(body) = body {
        let _ = stream.write_all(&body).await;
    }
    let _ = stream.shutdown().await;
}

/// Listens on the first free preview port and answers until the app exits.
async fn start(shelf: Shelf, ports: &[u16]) -> Result<u16, String> {
    for &port in ports {
        let Ok(listener) = TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await else {
            continue;
        };
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        tokio::spawn(serve(stream, shelf.clone(), port));
                    }
                    Err(_) => tokio::time::sleep(Duration::from_millis(50)).await,
                }
            }
        });
        return Ok(port);
    }
    Err("Every preview port is in use. Close another BorgDock and try again.".into())
}

fn token_of(url: &str) -> Option<&str> {
    let rest = url.strip_prefix("http://127.0.0.1:")?;
    let (_, path) = rest.split_once('/')?;
    path.split('/').next().filter(|token| !token.is_empty())
}

/// Puts `files` on offer and returns the address of `entry`, the page itself.
/// The address holds a random token; only a frame given it can read the files.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn file_preview_publish(
    state: tauri::State<'_, FilePreviews>,
    entry: String,
    files: Vec<PreviewFile>,
) -> Result<String, String> {
    let shelf = state.shelf.clone();
    let port = *state
        .port
        .get_or_try_init(|| start(shelf.clone(), &PREVIEW_PORTS))
        .await?;
    let (token, entry) = put(&shelf, files, &entry)?;
    let path: Vec<String> = entry
        .split('/')
        .map(|segment| urlencoding::encode(segment).into_owned())
        .collect();
    Ok(format!("http://127.0.0.1:{port}/{token}/{}", path.join("/")))
}

/// Takes a preview off offer once its frame is gone.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn file_preview_release(
    state: tauri::State<'_, FilePreviews>,
    url: String,
) -> Result<(), String> {
    if let Some(token) = token_of(&url) {
        take(&state.shelf, token);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(path: &str, text: &str) -> PreviewFile {
        PreviewFile {
            path: path.into(),
            base64: base64::engine::general_purpose::STANDARD.encode(text),
        }
    }

    async fn request(port: u16, head: &str) -> String {
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        stream.write_all(head.as_bytes()).await.unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).await.unwrap();
        response
    }

    async fn served() -> (Shelf, u16, String) {
        let shelf = Shelf::default();
        let port = start(shelf.clone(), &[0]).await.unwrap();
        let (token, _) = put(
            &shelf,
            vec![
                file("docs/plan.html", "<h1>Plan</h1>"),
                file("docs/img/a b.css", "body{}"),
            ],
            "docs/plan.html",
        )
        .unwrap();
        (shelf, port, token)
    }

    fn get(port: u16, path: &str) -> String {
        format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n")
    }

    #[tokio::test]
    async fn serves_a_published_page_sandboxed() {
        let (_shelf, port, token) = served().await;
        let response = request(port, &get(port, &format!("/{token}/docs/plan.html"))).await;
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"), "{response}");
        assert!(response.contains("Content-Type: text/html; charset=utf-8\r\n"));
        assert!(response.contains("Content-Security-Policy: sandbox allow-scripts; "));
        assert!(response.contains("X-Content-Type-Options: nosniff\r\n"));
        assert!(response.ends_with("\r\n\r\n<h1>Plan</h1>"));
    }

    #[tokio::test]
    async fn serves_a_file_beside_the_page_by_its_encoded_path() {
        let (_shelf, port, token) = served().await;
        let response = request(
            port,
            &get(port, &format!("/{token}/docs/img/a%20b.css?v=2")),
        )
        .await;
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"), "{response}");
        assert!(response.contains("Content-Type: text/css; charset=utf-8\r\n"));
        assert!(response.ends_with("body{}"));
    }

    #[tokio::test]
    async fn refuses_what_it_was_not_given() {
        let (shelf, port, token) = served().await;
        for path in [
            format!("/{token}/docs/other.html"),
            format!("/{token}/docs/../docs/plan.html"),
            format!("/{token}/docs/%2e%2e/docs/plan.html"),
            "/00000000000000000000000000000000/docs/plan.html".to_string(),
            format!("/{token}"),
            "/".to_string(),
        ] {
            let response = request(port, &get(port, &path)).await;
            assert!(response.starts_with("HTTP/1.1 404 "), "{path}: {response}");
        }
        take(&shelf, &token);
        let response = request(port, &get(port, &format!("/{token}/docs/plan.html"))).await;
        assert!(response.starts_with("HTTP/1.1 404 "), "{response}");
    }

    #[tokio::test]
    async fn refuses_another_host_name_and_other_methods() {
        let (_shelf, port, token) = served().await;
        let path = format!("/{token}/docs/plan.html");
        let rebound = request(
            port,
            &format!("GET {path} HTTP/1.1\r\nHost: evil.example:{port}\r\n\r\n"),
        )
        .await;
        assert!(rebound.starts_with("HTTP/1.1 403 "), "{rebound}");
        let named = request(
            port,
            &format!("GET {path} HTTP/1.1\r\nHost: localhost:{port}\r\n\r\n"),
        )
        .await;
        assert!(named.starts_with("HTTP/1.1 403 "), "{named}");
        let post = request(
            port,
            &format!("POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"),
        )
        .await;
        assert!(post.starts_with("HTTP/1.1 405 "), "{post}");
    }

    #[tokio::test]
    async fn a_head_request_gets_no_body() {
        let (_shelf, port, token) = served().await;
        let response = request(
            port,
            &format!("HEAD /{token}/docs/plan.html HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n"),
        )
        .await;
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"), "{response}");
        assert!(response.ends_with("\r\n\r\n"), "{response}");
    }

    #[test]
    fn keeps_only_the_newest_previews() {
        let shelf = Shelf::default();
        let tokens: Vec<String> = (0..MAX_PREVIEWS + 2)
            .map(|_| put(&shelf, vec![file("a.html", "x")], "a.html").unwrap().0)
            .collect();
        assert!(find(&shelf, &tokens[0], "a.html").is_none());
        assert!(find(&shelf, &tokens[1], "a.html").is_none());
        assert!(find(&shelf, &tokens[2], "a.html").is_some());
        assert!(find(&shelf, tokens.last().unwrap(), "a.html").is_some());
    }

    #[test]
    fn refuses_a_preview_it_cannot_serve() {
        let shelf = Shelf::default();
        assert!(put(&shelf, vec![file("a.html", "x")], "b.html").is_err());
        assert!(put(&shelf, vec![file("../a.html", "x")], "../a.html").is_err());
        assert!(put(&shelf, vec![file("/a.html", "x")], "/a.html").is_err());
        let bad = PreviewFile {
            path: "a.html".into(),
            base64: "not base64!".into(),
        };
        assert!(put(&shelf, vec![bad], "a.html").is_err());
        let big = PreviewFile {
            path: "a.html".into(),
            base64: base64::engine::general_purpose::STANDARD
                .encode(vec![b'x'; MAX_PREVIEW_BYTES + 1]),
        };
        assert!(put(&shelf, vec![big], "a.html").is_err());
    }

    #[test]
    fn a_page_cannot_connect_anywhere_but_its_own_files() {
        let policy = content_security_policy(41847);
        assert!(policy.starts_with("sandbox allow-scripts; "));
        assert!(!policy.contains("allow-same-origin"));
        assert!(policy.contains("connect-src http://127.0.0.1:41847;"));
        assert!(policy.contains("frame-src 'none'"));
        assert!(policy.contains("form-action 'none'"));
    }

    #[test]
    fn reads_the_token_back_from_an_address() {
        assert_eq!(
            token_of("http://127.0.0.1:41847/abc123/docs/plan.html"),
            Some("abc123")
        );
        assert_eq!(token_of("http://127.0.0.1:41847/"), None);
        assert_eq!(token_of("https://example.com/abc/x.html"), None);
    }

    /// The app's CSP lets a frame show exactly the preview ports. With a
    /// wider `frame-src` a page could navigate its frame to another local
    /// server; with a narrower one a preview stays blank.
    #[test]
    fn csp_names_every_preview_port() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let csp = config["app"]["security"]["csp"].as_str().unwrap();
        let frames = csp
            .split(';')
            .map(str::trim)
            .find_map(|directive| directive.strip_prefix("frame-src "))
            .expect("the CSP has a frame-src");
        let expected: Vec<String> = PREVIEW_PORTS
            .iter()
            .map(|port| format!("http://127.0.0.1:{port}"))
            .collect();
        assert_eq!(frames.split(' ').collect::<Vec<_>>(), expected);
    }
}
