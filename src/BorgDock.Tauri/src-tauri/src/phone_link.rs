//! The link to BorgDock for iPhone's server. The desktop asks the server for
//! a code, the phone approves it, and the desktop gets a session that may only
//! send presence, share reads, share its watched repositories and sign out. Contract:
//! `src/BorgDock.Server/shared/src/borgdock.ts`, "Owners, desktop link and read sync".
//!
//! Every request goes through here: the webview's CSP can't reach a server
//! address the user types. The session token lives in the keychain as
//! `borgdock:phone-link`; the poll secret of a pending link never leaves Rust.

use reqwest::{Method, RequestBuilder, StatusCode};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use crate::settings::models::RepoSettings;

pub const LINK_SERVICE: &str = "borgdock:phone-link";
const PRESENCE_EVERY: Duration = Duration::from_secs(60);
/// A list the server refused (an older server) is offered again after this long.
const REPOSITORIES_RETRY: Duration = Duration::from_secs(10 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const UNLINKED: &str = "Your iPhone unlinked this desktop. Link it again in Settings.";
const CANCELED: &str = "This link was canceled. Start again.";
pub const CHANGED_EVENT: &str = "phone-link-changed";

static WAKE: LazyLock<tokio::sync::Notify> = LazyLock::new(tokio::sync::Notify::new);
static APP: OnceLock<AppHandle> = OnceLock::new();

/// Links waiting for the phone, by link id.
static PENDING: LazyLock<Mutex<HashMap<String, Pending>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// The watched repositories last offered to the server, and whether it took them.
static SENT_REPOSITORIES: LazyLock<Mutex<Option<SentRepositories>>> =
    LazyLock::new(|| Mutex::new(None));

#[derive(Debug, Clone)]
struct SentRepositories {
    session_id: String,
    repositories: Vec<String>,
    at: Instant,
    accepted: bool,
}

#[derive(Debug, Clone)]
struct Pending {
    server: String,
    poll_secret: String,
    expires_at: String,
}

/// A link stored or forgotten, `at` the moment it happened.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type, tauri_specta::Event))]
#[serde(rename_all = "camelCase")]
pub struct PhoneLinkChanged {
    pub linked: bool,
    pub at: String,
}

fn announce(linked: bool) {
    let Some(app) = APP.get() else { return };
    let at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    if let Err(error) = app.emit(CHANGED_EVENT, PhoneLinkChanged { linked, at }) {
        log::warn!("phone link: could not emit {CHANGED_EVENT}: {error}");
    }
}

/// Takes the link off the waiting list; `None` once it was canceled.
fn take_pending(link_id: &str) -> Result<Option<Pending>, String> {
    Ok(PENDING.lock().map_err(|e| e.to_string())?.remove(link_id))
}

fn still_waiting(pending: &Pending, now: chrono::DateTime<chrono::Utc>) -> bool {
    chrono::DateTime::parse_from_rfc3339(&pending.expires_at).map_or(true, |at| at > now)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    server: String,
    token: String,
    session_id: String,
    server_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkStartWire {
    link_id: String,
    code: String,
    poll_secret: String,
    expires_at: String,
    link: String,
}

#[derive(Debug, PartialEq, Deserialize)]
#[serde(tag = "status", rename_all = "lowercase")]
enum LinkStatusWire {
    Pending,
    #[serde(rename_all = "camelCase")]
    Approved {
        token: String,
        session_id: String,
        server_name: String,
    },
    Expired,
}

/// A started link: show `code` as text and `qrSvg` (the QR of `link`) to the phone.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PhoneLinkStart {
    pub link_id: String,
    pub code: String,
    pub expires_at: String,
    pub link: String,
    pub qr_svg: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum PhoneLinkPoll {
    Pending,
    #[serde(rename_all = "camelCase")]
    Approved {
        server_name: String,
    },
    Expired,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PhoneLinkState {
    pub linked: bool,
    pub server: Option<String>,
    pub server_name: Option<String>,
}

/// The server's `ActivityTarget`: what an activity entry is about.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PhoneActivityTarget {
    /// `owner/repo#n`.
    Pr {
        key: String,
    },
    /// An Azure DevOps work item id.
    Item {
        id: i64,
    },
    /// A raw T3 thread id.
    #[serde(rename_all = "camelCase")]
    Thread {
        id: String,
        item_id: Option<i64>,
    },
    #[serde(rename_all = "camelCase")]
    Ci {
        group_id: String,
    },
    None,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PhoneReadsSince {
    pub until: String,
    pub targets: Vec<PhoneActivityTarget>,
}

#[derive(Debug, PartialEq)]
enum Failure {
    Unauthorized,
    Gone,
    Other(String),
}

impl From<Failure> for String {
    fn from(failure: Failure) -> Self {
        match failure {
            Failure::Unauthorized => UNLINKED.to_string(),
            Failure::Gone => "The server no longer knows this link.".to_string(),
            Failure::Other(message) => message,
        }
    }
}

pub fn normalize_server(raw: &str) -> Result<String, String> {
    let server = raw.trim().trim_end_matches('/');
    if !server.starts_with("https://") && !server.starts_with("http://") {
        return Err("The server address must start with https://".to_string());
    }
    Ok(server.to_string())
}

fn device_name() -> String {
    let host = gethostname::gethostname()
        .to_string_lossy()
        .trim()
        .to_string();
    let host = host.strip_suffix(".local").unwrap_or(&host).to_string();
    if host.is_empty() {
        "BorgDock desktop".to_string()
    } else {
        host
    }
}

fn request(method: Method, url: String) -> RequestBuilder {
    crate::http::client()
        .request(method, url)
        .timeout(REQUEST_TIMEOUT)
        .header("X-Dispatch-Intent", "1")
}

fn start_request(server: &str, device: &str) -> RequestBuilder {
    request(Method::POST, format!("{server}/api/desktop/links"))
        .json(&json!({ "deviceName": device }))
}

fn poll_request(server: &str, link_id: &str, poll_secret: &str) -> RequestBuilder {
    request(
        Method::GET,
        format!(
            "{server}/api/desktop/links/{}?secret={}",
            urlencoding::encode(link_id),
            urlencoding::encode(poll_secret)
        ),
    )
}

fn authed(session: &Session, method: Method, path: &str) -> RequestBuilder {
    request(method, format!("{}{path}", session.server)).bearer_auth(&session.token)
}

fn repositories_request(session: &Session, repositories: &[String]) -> RequestBuilder {
    authed(session, Method::PUT, "/api/desktop/repositories")
        .json(&json!({ "repositories": repositories }))
}

/// The repositories this desktop watches, as the server names them: the
/// enabled ones, `owner/name`, each once whatever its case, sorted.
fn watched_repositories(repos: &[RepoSettings]) -> Vec<String> {
    let mut names: Vec<String> = repos
        .iter()
        .filter(|repo| repo.enabled)
        .map(|repo| (repo.owner.trim(), repo.name.trim()))
        .filter(|(owner, name)| !owner.is_empty() && !name.is_empty())
        .map(|(owner, name)| format!("{owner}/{name}"))
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    names
}

/// A new link, a restart or a changed list goes out at once; a list the
/// server refused is offered again after `REPOSITORIES_RETRY`.
fn should_send_repositories(
    last: Option<&SentRepositories>,
    session_id: &str,
    repositories: &[String],
    now: Instant,
) -> bool {
    match last {
        Some(sent) if sent.session_id == session_id && sent.repositories == repositories => {
            !sent.accepted && now.duration_since(sent.at) >= REPOSITORIES_RETRY
        }
        _ => true,
    }
}

fn reads_path(since: &str) -> String {
    format!("/api/activity/reads?since={}", urlencoding::encode(since))
}

/// The server's `{ error }` (or `{ message }`) when it gave one.
fn error_text(status: StatusCode, body: &str) -> String {
    let said = serde_json::from_str::<Value>(body).ok().and_then(|value| {
        ["error", "message"]
            .iter()
            .find_map(|key| value[*key].as_str().map(str::to_string))
    });
    match said {
        Some(text) => format!("The server answered {status}: {text}"),
        None => format!("The server answered {status}"),
    }
}

async fn send(builder: RequestBuilder) -> Result<String, Failure> {
    let response = builder
        .send()
        .await
        .map_err(|e| Failure::Other(format!("Could not reach the server: {}", e.without_url())))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    match status {
        StatusCode::UNAUTHORIZED => Err(Failure::Unauthorized),
        StatusCode::NOT_FOUND | StatusCode::GONE => Err(Failure::Gone),
        status if status.is_success() => Ok(body),
        status => Err(Failure::Other(error_text(status, &body))),
    }
}

async fn send_json<T: DeserializeOwned>(builder: RequestBuilder) -> Result<T, Failure> {
    let body = send(builder).await?;
    serde_json::from_str(&body)
        .map_err(|e| Failure::Other(format!("The server sent something unexpected: {e}")))
}

/// Targets of kinds this build doesn't know are left out, not an error.
fn parse_reads(body: &str) -> Result<PhoneReadsSince, String> {
    #[derive(Deserialize)]
    struct Wire {
        until: String,
        targets: Vec<Value>,
    }
    let wire: Wire = serde_json::from_str(body)
        .map_err(|e| format!("The server sent something unexpected: {e}"))?;
    Ok(PhoneReadsSince {
        until: wire.until,
        targets: wire
            .targets
            .into_iter()
            .filter_map(|target| serde_json::from_value(target).ok())
            .collect(),
    })
}

fn qr_svg(text: &str) -> Result<String, String> {
    use qrcode::render::svg;
    let code = qrcode::QrCode::new(text.as_bytes()).map_err(|e| format!("QR code: {e}"))?;
    Ok(code
        .render::<svg::Color>()
        .min_dimensions(184, 184)
        .dark_color(svg::Color("#000000"))
        .light_color(svg::Color("#ffffff"))
        .build())
}

fn read_session_blocking() -> Result<Option<Session>, String> {
    let Some(text) = crate::keychain::get_credential_blocking(LINK_SERVICE)? else {
        return Ok(None);
    };
    Ok(serde_json::from_str::<Session>(&text).ok())
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

async fn read_session() -> Result<Option<Session>, String> {
    blocking(read_session_blocking).await
}

async fn forget_session() -> Result<(), String> {
    blocking(
        || match crate::keychain::entry(LINK_SERVICE)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("Failed to remove the link: {error}")),
        },
    )
    .await?;
    announce(false);
    Ok(())
}

async fn linked_session() -> Result<Session, String> {
    read_session()
        .await?
        .ok_or_else(|| "This desktop isn't linked to BorgDock for iPhone.".to_string())
}

/// A session the server no longer accepts is forgotten, so Settings shows "Link".
async fn call(builder: RequestBuilder) -> Result<String, String> {
    match send(builder).await {
        Err(Failure::Unauthorized) => {
            log::warn!("phone link: the server refused the session; forgetting it");
            forget_session().await?;
            Err(UNLINKED.to_string())
        }
        result => result.map_err(String::from),
    }
}

async fn send_presence(session: &Session) -> Result<(), String> {
    let Some(idle) = crate::platform::idle::seconds_since_input() else {
        return Ok(());
    };
    let body = json!({ "device": device_name(), "idleSeconds": idle });
    call(authed(session, Method::POST, "/api/presence").json(&body))
        .await
        .map(|_| ())
}

/// The server searches the repositories this desktop watches, so the phone
/// lists the same pull requests.
async fn send_repositories(session: &Session, repos: &[RepoSettings]) -> Result<(), String> {
    let repositories = watched_repositories(repos);
    let wanted = should_send_repositories(
        SENT_REPOSITORIES
            .lock()
            .map_err(|e| e.to_string())?
            .as_ref(),
        &session.session_id,
        &repositories,
        Instant::now(),
    );
    if !wanted {
        return Ok(());
    }
    let result = call(repositories_request(session, &repositories)).await;
    *SENT_REPOSITORIES.lock().map_err(|e| e.to_string())? = Some(SentRepositories {
        session_id: session.session_id.clone(),
        repositories,
        at: Instant::now(),
        accepted: result.is_ok(),
    });
    result.map(|_| ())
}

/// Presence (while sharing) and the watched repositories (when they changed).
async fn sync_with_server() -> Result<(), String> {
    let (settings, session) = blocking(|| {
        Ok((
            crate::settings::load_settings_internal()?,
            read_session_blocking()?,
        ))
    })
    .await?;
    let Some(session) = session else {
        return Ok(());
    };
    if settings.notifications.activity.phone_link.share_desk {
        send_presence(&session).await?;
    }
    send_repositories(&session, &settings.repos).await
}

/// Every minute while linked; right away after a link.
pub fn start(app: AppHandle) {
    let _ = APP.set(app);
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(error) = sync_with_server().await {
                log::warn!("phone link sync failed: {error}");
            }
            tokio::select! {
                _ = WAKE.notified() => {}
                _ = tokio::time::sleep(PRESENCE_EVERY) => {}
            }
        }
    });
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn phone_link_start(server: String) -> Result<PhoneLinkStart, String> {
    let server = normalize_server(&server)?;
    let wire: LinkStartWire = send_json(start_request(&server, &device_name())).await?;
    let qr_svg = qr_svg(&wire.link)?;
    let mut pending = PENDING.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now();
    pending.retain(|_, link| still_waiting(link, now));
    pending.insert(
        wire.link_id.clone(),
        Pending {
            server,
            poll_secret: wire.poll_secret,
            expires_at: wire.expires_at.clone(),
        },
    );
    drop(pending);
    Ok(PhoneLinkStart {
        link_id: wire.link_id,
        code: wire.code,
        expires_at: wire.expires_at,
        link: wire.link,
        qr_svg,
    })
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn phone_link_poll(link_id: String) -> Result<PhoneLinkPoll, String> {
    let pending = PENDING
        .lock()
        .map_err(|e| e.to_string())?
        .get(&link_id)
        .cloned()
        .ok_or_else(|| "This link is no longer waiting. Start again.".to_string())?;
    let status = match send_json::<LinkStatusWire>(poll_request(
        &pending.server,
        &link_id,
        &pending.poll_secret,
    ))
    .await
    {
        Err(Failure::Gone) => LinkStatusWire::Expired,
        result => result?,
    };
    let answer = match status {
        LinkStatusWire::Pending => return Ok(PhoneLinkPoll::Pending),
        LinkStatusWire::Expired => PhoneLinkPoll::Expired,
        LinkStatusWire::Approved {
            token,
            session_id,
            server_name,
        } => {
            if take_pending(&link_id)?.is_none() {
                return Err(CANCELED.to_string());
            }
            let session = Session {
                server: pending.server,
                token,
                session_id,
                server_name: server_name.clone(),
            };
            let text = serde_json::to_string(&session).map_err(|e| e.to_string())?;
            blocking(move || {
                crate::keychain::entry(LINK_SERVICE)?
                    .set_password(&text)
                    .map_err(|e| format!("Failed to store the link: {e}"))
            })
            .await?;
            WAKE.notify_one();
            announce(true);
            PhoneLinkPoll::Approved { server_name }
        }
    };
    take_pending(&link_id)?;
    Ok(answer)
}

/// Stops waiting for the phone: a poll still on its way stores no session.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn phone_link_cancel(link_id: String) -> Result<(), String> {
    take_pending(&link_id).map(|_| ())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn phone_link_state() -> Result<PhoneLinkState, String> {
    let session = read_session().await?;
    Ok(PhoneLinkState {
        linked: session.is_some(),
        server: session.as_ref().map(|s| s.server.clone()),
        server_name: session.map(|s| s.server_name),
    })
}

/// Signs the session out on the server when it can; forgets it either way.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn phone_link_unlink() -> Result<(), String> {
    if let Some(session) = read_session().await? {
        if let Err(failure) = send(authed(&session, Method::POST, "/api/auth/logout")).await {
            log::warn!("phone link: sign-out failed: {}", String::from(failure));
        }
    }
    forget_session().await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn phone_link_send_reads(
    targets: Vec<PhoneActivityTarget>,
    before: String,
) -> Result<(), String> {
    let session = linked_session().await?;
    let body = json!({ "targets": targets, "before": before });
    call(authed(&session, Method::POST, "/api/activity/read-targets").json(&body))
        .await
        .map(|_| ())
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn phone_link_reads_since(since: String) -> Result<PhoneReadsSince, String> {
    let session = linked_session().await?;
    let body = call(authed(&session, Method::GET, &reads_path(&since))).await?;
    parse_reads(&body)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session() -> Session {
        Session {
            server: "https://mini.example.ts.net/borgdock".into(),
            token: "tok".into(),
            session_id: "s1".into(),
            server_name: "Mac mini".into(),
        }
    }

    fn body_of(request: &reqwest::Request) -> Value {
        serde_json::from_slice(request.body().unwrap().as_bytes().unwrap()).unwrap()
    }

    #[test]
    fn a_server_address_loses_its_trailing_slash_and_needs_a_scheme() {
        assert_eq!(
            normalize_server(" https://mini.example/borgdock/ ").unwrap(),
            "https://mini.example/borgdock"
        );
        assert!(normalize_server("mini.example").is_err());
    }

    #[test]
    fn starting_a_link_posts_the_device_name_with_the_intent_header() {
        let request = start_request("https://mini.example/borgdock", "KVDBORGHT")
            .build()
            .unwrap();
        assert_eq!(request.method(), Method::POST);
        assert_eq!(
            request.url().as_str(),
            "https://mini.example/borgdock/api/desktop/links"
        );
        assert_eq!(request.headers()["x-dispatch-intent"], "1");
        assert!(request.headers().get("authorization").is_none());
        assert_eq!(body_of(&request), json!({ "deviceName": "KVDBORGHT" }));
    }

    #[test]
    fn polling_puts_the_secret_in_the_query() {
        let request = poll_request("https://mini.example/borgdock", "l 1", "a&b")
            .build()
            .unwrap();
        assert_eq!(
            request.url().as_str(),
            "https://mini.example/borgdock/api/desktop/links/l%201?secret=a%26b"
        );
    }

    #[test]
    fn signed_requests_carry_the_bearer_token_and_the_intent_header() {
        let session = session();
        let request = authed(
            &session,
            Method::GET,
            &reads_path("2026-10-31T10:00:00.000Z"),
        )
        .build()
        .unwrap();
        assert_eq!(
            request.url().as_str(),
            "https://mini.example.ts.net/borgdock/api/activity/reads?since=2026-10-31T10%3A00%3A00.000Z"
        );
        assert_eq!(request.headers()["authorization"], "Bearer tok");
        assert_eq!(request.headers()["x-dispatch-intent"], "1");
    }

    #[test]
    fn read_targets_serialize_as_the_server_names_them() {
        let targets = vec![
            PhoneActivityTarget::Pr {
                key: "borght-dev/BorgDock#12".into(),
            },
            PhoneActivityTarget::Item { id: 42 },
            PhoneActivityTarget::Thread {
                id: "th".into(),
                item_id: Some(42),
            },
            PhoneActivityTarget::Ci {
                group_id: "g1".into(),
            },
        ];
        assert_eq!(
            serde_json::to_value(&targets).unwrap(),
            json!([
                { "kind": "pr", "key": "borght-dev/BorgDock#12" },
                { "kind": "item", "id": 42 },
                { "kind": "thread", "id": "th", "itemId": 42 },
                { "kind": "ci", "groupId": "g1" },
            ])
        );
    }

    #[test]
    fn link_statuses_parse() {
        let parse = |text: &str| serde_json::from_str::<LinkStatusWire>(text).unwrap();
        assert_eq!(parse(r#"{"status":"pending"}"#), LinkStatusWire::Pending);
        assert_eq!(parse(r#"{"status":"expired"}"#), LinkStatusWire::Expired);
        assert_eq!(
            parse(r#"{"status":"approved","token":"t","sessionId":"s","serverName":"Mac mini"}"#),
            LinkStatusWire::Approved {
                token: "t".into(),
                session_id: "s".into(),
                server_name: "Mac mini".into(),
            }
        );
        let start: LinkStartWire = serde_json::from_str(
            r#"{"linkId":"l","code":"ABCD-1234","pollSecret":"p","expiresAt":"2026-10-31T10:10:00.000Z","link":"borgdock://link-desktop?server=x&code=ABCD-1234"}"#,
        )
        .unwrap();
        assert_eq!(start.code, "ABCD-1234");
        assert_eq!(start.poll_secret, "p");
    }

    #[test]
    fn reads_since_skips_target_kinds_it_does_not_know() {
        let reads = parse_reads(
            r#"{"until":"2026-10-31T10:00:00.000Z","targets":[{"kind":"pr","key":"o/r#1"},{"kind":"workstream","id":"w"},{"kind":"none"}]}"#,
        )
        .unwrap();
        assert_eq!(reads.until, "2026-10-31T10:00:00.000Z");
        assert_eq!(
            reads.targets,
            vec![
                PhoneActivityTarget::Pr {
                    key: "o/r#1".into()
                },
                PhoneActivityTarget::None,
            ]
        );
    }

    #[test]
    fn server_errors_say_what_the_server_said() {
        assert_eq!(
            error_text(
                StatusCode::FORBIDDEN,
                r#"{"error":"Desktop sessions can't do that."}"#
            ),
            "The server answered 403 Forbidden: Desktop sessions can't do that."
        );
        assert_eq!(
            error_text(StatusCode::BAD_GATEWAY, "<html>"),
            "The server answered 502 Bad Gateway"
        );
    }

    #[test]
    fn a_pending_link_stops_waiting_when_it_expires() {
        let link = Pending {
            server: String::new(),
            poll_secret: String::new(),
            expires_at: "2026-10-31T10:10:00.000Z".into(),
        };
        let at = |time: &str| chrono::DateTime::parse_from_rfc3339(time).unwrap().to_utc();
        assert!(still_waiting(&link, at("2026-10-31T10:09:00Z")));
        assert!(!still_waiting(&link, at("2026-10-31T10:11:00Z")));
    }

    #[test]
    fn a_canceled_link_cannot_be_claimed_by_a_poll_on_its_way() {
        let waiting = Pending {
            server: "https://mini.example/borgdock".into(),
            poll_secret: "p".into(),
            expires_at: "2099-01-01T00:00:00.000Z".into(),
        };
        PENDING
            .lock()
            .unwrap()
            .insert("cancel-me".into(), waiting.clone());
        PENDING.lock().unwrap().insert("keep-me".into(), waiting);
        tauri::async_runtime::block_on(phone_link_cancel("cancel-me".into())).unwrap();
        assert!(take_pending("cancel-me").unwrap().is_none());
        assert!(take_pending("keep-me").unwrap().is_some());
    }

    fn repo(owner: &str, name: &str, enabled: bool) -> RepoSettings {
        serde_json::from_value(json!({ "owner": owner, "name": name, "enabled": enabled })).unwrap()
    }

    #[test]
    fn watched_repositories_are_the_enabled_ones_each_once_sorted() {
        let repos = vec![
            repo("globex", "portal", true),
            repo("acme", "shop", true),
            repo("Acme", "Shop", true),
            repo("acme", "archive", false),
            repo("", "orphan", true),
        ];
        assert_eq!(
            watched_repositories(&repos),
            vec!["acme/shop", "globex/portal"]
        );
    }

    #[test]
    fn repositories_go_out_on_a_new_link_or_a_change_and_a_refused_list_waits() {
        let list = vec!["acme/shop".to_string()];
        let t0 = Instant::now();
        let sent = |accepted: bool| SentRepositories {
            session_id: "s1".into(),
            repositories: list.clone(),
            at: t0,
            accepted,
        };
        assert!(
            should_send_repositories(None, "s1", &list, t0),
            "after a restart"
        );
        assert!(!should_send_repositories(
            Some(&sent(true)),
            "s1",
            &list,
            t0 + REPOSITORIES_RETRY
        ));
        assert!(
            should_send_repositories(Some(&sent(true)), "s2", &list, t0),
            "a new link"
        );
        let changed = vec!["acme/shop".to_string(), "globex/portal".to_string()];
        assert!(should_send_repositories(
            Some(&sent(true)),
            "s1",
            &changed,
            t0
        ));
        assert!(!should_send_repositories(
            Some(&sent(false)),
            "s1",
            &list,
            t0 + Duration::from_secs(60)
        ));
        assert!(should_send_repositories(
            Some(&sent(false)),
            "s1",
            &list,
            t0 + REPOSITORIES_RETRY
        ));
    }

    #[test]
    fn repositories_are_put_with_the_session() {
        let request = repositories_request(&session(), &["acme/shop".to_string()])
            .build()
            .unwrap();
        assert_eq!(request.method(), Method::PUT);
        assert_eq!(
            request.url().as_str(),
            "https://mini.example.ts.net/borgdock/api/desktop/repositories"
        );
        assert_eq!(request.headers()["authorization"], "Bearer tok");
        assert_eq!(body_of(&request), json!({ "repositories": ["acme/shop"] }));
    }

    #[test]
    fn the_link_qr_is_an_svg() {
        let svg = qr_svg("borgdock://link-desktop?server=https%3A%2F%2Fx&code=ABCD").unwrap();
        assert!(svg.contains("<svg"));
    }
}
