//! Reads the tail of a GitHub Actions job log with a byte cap and a deadline
//! that cover the body, before any of it becomes a string.
//!
//! GitHub answers the log endpoint with a redirect to a short-lived storage
//! URL. The redirect is followed by hand so the token never goes to the
//! storage host and the second request can ask for the tail only.

use reqwest::header::{HeaderMap, CONTENT_LENGTH, CONTENT_RANGE, LOCATION, RANGE, RETRY_AFTER};
use reqwest::{redirect, Response, StatusCode};
use std::sync::LazyLock;
use std::time::Duration;

/// Bytes read at most when storage ignores the range and streams the whole
/// log; the tail kept is still `max_bytes`.
const HARD_CEILING: u64 = 64 * 1024 * 1024;

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .redirect(redirect::Policy::none())
        .user_agent("BorgDock")
        .build()
        .expect("log client")
});

pub struct TailRequest<'a> {
    pub api_base: &'a str,
    pub token: &'a str,
    pub owner: &'a str,
    pub repo: &'a str,
    pub job_id: u64,
    pub max_bytes: usize,
    pub timeout: Duration,
}

#[derive(Debug)]
pub struct LogTail {
    pub text: String,
    pub bytes_read: u64,
    pub total_bytes: Option<u64>,
    pub truncated: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum LogError {
    /// The log will not become readable by retrying (deleted, expired, no access).
    Unavailable(String),
    /// Retrying later may work.
    Failed {
        reason: String,
        retry_after_secs: Option<u64>,
    },
}

fn failed(reason: impl Into<String>) -> LogError {
    LogError::Failed {
        reason: reason.into(),
        retry_after_secs: None,
    }
}

pub async fn read_tail(request: TailRequest<'_>) -> Result<LogTail, LogError> {
    let seconds = request.timeout.as_millis().div_ceil(1000);
    tokio::time::timeout(request.timeout, read_tail_inner(&request))
        .await
        .unwrap_or_else(|_| {
            Err(failed(format!(
                "Reading the log took longer than {seconds} s"
            )))
        })
}

async fn read_tail_inner(request: &TailRequest<'_>) -> Result<LogTail, LogError> {
    let url = format!(
        "{}/repos/{}/{}/actions/jobs/{}/logs",
        request.api_base.trim_end_matches('/'),
        request.owner,
        request.repo,
        request.job_id
    );
    let response = CLIENT
        .get(&url)
        .bearer_auth(request.token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| failed(format!("Could not reach GitHub: {}", without_url(&e))))?;

    match response.status() {
        status if status.is_redirection() => {
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| failed("GitHub redirected without a location"))?
                .to_string();
            read_storage(&location, request.max_bytes).await
        }
        StatusCode::OK => read_body(response, request.max_bytes, None).await,
        status => Err(api_error(status, response.headers())),
    }
}

async fn read_storage(location: &str, max_bytes: usize) -> Result<LogTail, LogError> {
    let ranged = CLIENT
        .get(location)
        .header(RANGE, format!("bytes=-{max_bytes}"))
        .send()
        .await
        .map_err(|e| failed(format!("Could not reach log storage: {}", without_url(&e))))?;
    match ranged.status() {
        StatusCode::PARTIAL_CONTENT => {
            let total = total_from_content_range(ranged.headers());
            read_body(ranged, max_bytes, total).await
        }
        StatusCode::OK => {
            // Some storage ignores suffix ranges. With the length known, ask for
            // the tail by its start instead of streaming the whole log.
            let length = header_u64(ranged.headers(), CONTENT_LENGTH.as_str());
            match length {
                Some(length) if length > max_bytes as u64 => {
                    drop(ranged);
                    read_from(location, length - max_bytes as u64, length, max_bytes).await
                }
                _ => read_body(ranged, max_bytes, None).await,
            }
        }
        // A suffix range on an empty log.
        StatusCode::RANGE_NOT_SATISFIABLE => Ok(LogTail {
            text: String::new(),
            bytes_read: 0,
            total_bytes: Some(0),
            truncated: false,
        }),
        status => Err(storage_error(status)),
    }
}

/// The bytes from `start` to the end; falls back to streaming the whole log
/// when this range is ignored too.
async fn read_from(
    location: &str,
    start: u64,
    length: u64,
    max_bytes: usize,
) -> Result<LogTail, LogError> {
    let response = CLIENT
        .get(location)
        .header(RANGE, format!("bytes={start}-"))
        .send()
        .await
        .map_err(|e| failed(format!("Could not reach log storage: {}", without_url(&e))))?;
    match response.status() {
        StatusCode::PARTIAL_CONTENT | StatusCode::OK => {
            let total = total_from_content_range(response.headers()).or(Some(length));
            read_body(response, max_bytes, total).await
        }
        status => Err(storage_error(status)),
    }
}

/// Storage answers 404 when GitHub never uploaded the log (a job cancelled
/// before it finished) or deleted it, and 403 when the signed link expired.
fn storage_error(status: StatusCode) -> LogError {
    match status {
        StatusCode::NOT_FOUND => {
            LogError::Unavailable("The log was never stored or is gone".into())
        }
        StatusCode::FORBIDDEN => failed("The log link expired before it was read"),
        status => failed(format!("Log storage answered {}", status.as_u16())),
    }
}

fn api_error(status: StatusCode, headers: &HeaderMap) -> LogError {
    let rate_limited = header_u64(headers, "x-ratelimit-remaining") == Some(0);
    match status {
        StatusCode::NOT_FOUND => {
            LogError::Unavailable("GitHub has no log for this job (deleted or expired)".into())
        }
        StatusCode::GONE => LogError::Unavailable("The log has expired".into()),
        StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS if rate_limited => LogError::Failed {
            reason: "GitHub's rate limit is used up".into(),
            retry_after_secs: retry_after(headers),
        },
        StatusCode::TOO_MANY_REQUESTS => LogError::Failed {
            reason: "GitHub asked to slow down".into(),
            retry_after_secs: retry_after(headers).or(Some(60)),
        },
        StatusCode::FORBIDDEN => LogError::Unavailable("No access to this job's log".into()),
        StatusCode::UNAUTHORIZED => failed("GitHub rejected the token"),
        status => failed(format!("GitHub answered {}", status.as_u16())),
    }
}

/// Seconds to wait: `Retry-After`, else until `x-ratelimit-reset`.
fn retry_after(headers: &HeaderMap) -> Option<u64> {
    if let Some(seconds) = headers
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse().ok())
    {
        return Some(seconds);
    }
    let reset = header_u64(headers, "x-ratelimit-reset")?;
    let now = chrono::Utc::now().timestamp().max(0) as u64;
    Some(reset.saturating_sub(now).max(1))
}

fn header_u64(headers: &HeaderMap, name: &str) -> Option<u64> {
    headers.get(name)?.to_str().ok()?.trim().parse().ok()
}

/// `total` from `Content-Range: bytes 100-199/200`.
fn total_from_content_range(headers: &HeaderMap) -> Option<u64> {
    let value = headers.get(CONTENT_RANGE)?.to_str().ok()?;
    value.rsplit('/').next()?.trim().parse().ok()
}

async fn read_body(
    mut response: Response,
    max_bytes: usize,
    ranged_total: Option<u64>,
) -> Result<LogTail, LogError> {
    let total_bytes =
        ranged_total.or_else(|| header_u64(response.headers(), CONTENT_LENGTH.as_str()));
    let mut buffer: Vec<u8> = Vec::with_capacity(max_bytes.min(1 << 20));
    let mut bytes_read: u64 = 0;
    let mut dropped = false;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| failed(format!("The log download broke off: {}", without_url(&e))))?
    {
        bytes_read += chunk.len() as u64;
        buffer.extend_from_slice(&chunk);
        // Trim in batches so the copy cost stays linear.
        if buffer.len() > max_bytes.saturating_mul(2) {
            buffer.drain(..buffer.len() - max_bytes);
            dropped = true;
        }
        if bytes_read >= HARD_CEILING {
            dropped = true;
            break;
        }
    }
    if buffer.len() > max_bytes {
        buffer.drain(..buffer.len() - max_bytes);
        dropped = true;
    }
    let truncated = dropped || total_bytes.is_some_and(|total| total > bytes_read);
    let mut text = String::from_utf8_lossy(&buffer).into_owned();
    if truncated {
        // The tail starts mid-line; the partial first line is noise.
        if let Some(newline) = text.find('\n') {
            text.drain(..=newline);
        }
    }
    Ok(LogTail {
        text,
        bytes_read,
        total_bytes,
        truncated,
    })
}

/// A reqwest error without its URL: storage URLs carry a signature.
fn without_url(error: &reqwest::Error) -> String {
    let mut message = error.to_string();
    if let Some(url) = error.url() {
        message = message.replace(url.as_str(), "<url>");
    }
    message
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// One canned answer per request, in order; each records the request head.
    async fn serve(answers: Vec<Vec<u8>>) -> (String, tokio::task::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let handle = tokio::spawn(async move {
            let mut heads = Vec::new();
            for answer in answers {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut head = Vec::new();
                let mut byte = [0u8; 1];
                while !head.ends_with(b"\r\n\r\n") {
                    if socket.read(&mut byte).await.unwrap() == 0 {
                        break;
                    }
                    head.push(byte[0]);
                }
                heads.push(String::from_utf8_lossy(&head).into_owned());
                let _ = socket.write_all(&answer).await;
                let _ = socket.shutdown().await;
            }
            heads
        });
        (base, handle)
    }

    fn answer(status: &str, headers: &[(&str, String)], body: &[u8]) -> Vec<u8> {
        let mut text = format!("HTTP/1.1 {status}\r\nConnection: close\r\n");
        for (name, value) in headers {
            text.push_str(&format!("{name}: {value}\r\n"));
        }
        text.push_str(&format!("Content-Length: {}\r\n\r\n", body.len()));
        let mut bytes = text.into_bytes();
        bytes.extend_from_slice(body);
        bytes
    }

    fn request(base: &str, max_bytes: usize) -> TailRequest<'_> {
        TailRequest {
            api_base: base,
            token: "ghp_secret",
            owner: "o",
            repo: "r",
            job_id: 42,
            max_bytes,
            timeout: Duration::from_secs(5),
        }
    }

    #[tokio::test]
    async fn follows_the_redirect_and_reads_the_ranged_tail() {
        let (storage, storage_heads) = serve(vec![answer(
            "206 Partial Content",
            &[("Content-Range", "bytes 90-99/100".into())],
            b"line\nlast\n",
        )])
        .await;
        let location = format!("{storage}/log?sig=abc");
        let (api, api_heads) =
            serve(vec![answer("302 Found", &[("Location", location)], b"")]).await;

        let tail = read_tail(request(&api, 10)).await.unwrap();
        assert_eq!(tail.text, "last\n");
        assert_eq!(tail.total_bytes, Some(100));
        assert!(tail.truncated);

        let api_head = api_heads.await.unwrap().remove(0);
        assert!(api_head.starts_with("GET /repos/o/r/actions/jobs/42/logs"));
        assert!(api_head
            .to_lowercase()
            .contains("authorization: bearer ghp_secret"));
        let storage_head = storage_heads.await.unwrap().remove(0).to_lowercase();
        assert!(storage_head.contains("range: bytes=-10"));
        assert!(!storage_head.contains("authorization"));
    }

    fn numbered_lines() -> Vec<u8> {
        (0..5000)
            .map(|i| format!("line {i}\n"))
            .collect::<String>()
            .into_bytes()
    }

    #[tokio::test]
    async fn asks_for_the_tail_by_its_start_when_storage_ignores_the_suffix_range() {
        let body = numbered_lines();
        let start = body.len() - 64;
        let (storage, heads) = serve(vec![
            answer("200 OK", &[], &body),
            answer(
                "206 Partial Content",
                &[(
                    "Content-Range",
                    format!("bytes {start}-{}/{}", body.len() - 1, body.len()),
                )],
                &body[start..],
            ),
        ])
        .await;
        let (api, _) = serve(vec![answer(
            "302 Found",
            &[("Location", format!("{storage}/log"))],
            b"",
        )])
        .await;

        let tail = read_tail(request(&api, 64)).await.unwrap();
        assert!(tail.truncated);
        assert_eq!(tail.bytes_read, 64);
        assert_eq!(tail.total_bytes, Some(body.len() as u64));
        assert!(tail.text.ends_with("line 4999\n"));
        let second = heads.await.unwrap().remove(1).to_lowercase();
        assert!(second.contains(&format!("range: bytes={start}-")));
    }

    #[tokio::test]
    async fn keeps_only_the_tail_when_storage_ignores_every_range() {
        let body = numbered_lines();
        let (storage, _) = serve(vec![
            answer("200 OK", &[], &body),
            answer("200 OK", &[], &body),
        ])
        .await;
        let (api, _) = serve(vec![answer(
            "302 Found",
            &[("Location", format!("{storage}/log"))],
            b"",
        )])
        .await;

        let tail = read_tail(request(&api, 64)).await.unwrap();
        assert!(tail.truncated);
        assert_eq!(tail.bytes_read, body.len() as u64);
        assert!(tail.text.ends_with("line 4999\n"));
        assert!(tail.text.len() <= 64);
        assert!(tail.text.starts_with("line "));
    }

    #[tokio::test]
    async fn a_small_log_is_whole() {
        let (storage, _) = serve(vec![answer(
            "206 Partial Content",
            &[("Content-Range", "bytes 0-5/6".into())],
            b"a\nb\nc\n",
        )])
        .await;
        let (api, _) = serve(vec![answer(
            "302 Found",
            &[("Location", format!("{storage}/log"))],
            b"",
        )])
        .await;
        let tail = read_tail(request(&api, 1024)).await.unwrap();
        assert_eq!(tail.text, "a\nb\nc\n");
        assert!(!tail.truncated);
    }

    #[tokio::test]
    async fn maps_api_failures() {
        let cases = vec![
            (
                answer("404 Not Found", &[], b""),
                LogError::Unavailable("GitHub has no log for this job (deleted or expired)".into()),
            ),
            (
                answer("410 Gone", &[], b""),
                LogError::Unavailable("The log has expired".into()),
            ),
            (
                answer("403 Forbidden", &[], b""),
                LogError::Unavailable("No access to this job's log".into()),
            ),
            (
                answer(
                    "403 Forbidden",
                    &[
                        ("x-ratelimit-remaining", "0".into()),
                        ("Retry-After", "30".into()),
                    ],
                    b"",
                ),
                LogError::Failed {
                    reason: "GitHub's rate limit is used up".into(),
                    retry_after_secs: Some(30),
                },
            ),
            (
                answer("429 Too Many Requests", &[("Retry-After", "7".into())], b""),
                LogError::Failed {
                    reason: "GitHub asked to slow down".into(),
                    retry_after_secs: Some(7),
                },
            ),
            (
                answer("502 Bad Gateway", &[], b""),
                failed("GitHub answered 502"),
            ),
        ];
        for (response, expected) in cases {
            let (api, _) = serve(vec![response]).await;
            assert_eq!(read_tail(request(&api, 10)).await.unwrap_err(), expected);
        }
    }

    #[tokio::test]
    async fn an_expired_storage_link_can_be_retried() {
        let (storage, _) = serve(vec![answer("403 Forbidden", &[], b"")]).await;
        let (api, _) = serve(vec![answer(
            "302 Found",
            &[("Location", format!("{storage}/log"))],
            b"",
        )])
        .await;
        assert_eq!(
            read_tail(request(&api, 10)).await.unwrap_err(),
            failed("The log link expired before it was read")
        );
    }

    #[tokio::test]
    async fn a_log_missing_from_storage_is_unavailable() {
        let (storage, _) = serve(vec![answer(
            "404 The specified blob does not exist.",
            &[],
            b"",
        )])
        .await;
        let (api, _) = serve(vec![answer(
            "302 Found",
            &[("Location", format!("{storage}/log"))],
            b"",
        )])
        .await;
        assert_eq!(
            read_tail(request(&api, 10)).await.unwrap_err(),
            LogError::Unavailable("The log was never stored or is gone".into())
        );
    }

    #[tokio::test]
    async fn a_stalled_body_times_out() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buffer = [0u8; 1024];
            let _ = socket.read(&mut buffer).await;
            let _ = socket
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 1000\r\n\r\npartial")
                .await;
            tokio::time::sleep(Duration::from_secs(10)).await;
        });
        let mut slow = request(&base, 10);
        slow.timeout = Duration::from_millis(300);
        assert_eq!(
            read_tail(slow).await.unwrap_err(),
            failed("Reading the log took longer than 1 s")
        );
    }
}
