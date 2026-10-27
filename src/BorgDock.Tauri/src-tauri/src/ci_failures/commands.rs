use super::log::{self as job_log, LogError, TailRequest};
use super::signal::Signal;
use super::{extract, sanitize};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const GITHUB_API: &str = "https://api.github.com";
const DEFAULT_MAX_BYTES: u32 = 2 * 1024 * 1024;
const LIMIT_MAX_BYTES: u32 = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS: u32 = 15_000;
const LIMIT_TIMEOUT_MS: u32 = 120_000;

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct JobLogRequest {
    /// Used for the one API request and dropped; never logged.
    pub token: String,
    pub owner: String,
    pub repo: String,
    pub job_id: u64,
    /// The job step GitHub reports as failed, to narrow extraction to it.
    pub failed_step: Option<String>,
    /// Tail bytes kept; 2 MiB when absent.
    pub max_bytes: Option<u32>,
    /// Deadline for the whole read, body included; 15 s when absent.
    pub timeout_ms: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "kebab-case")]
pub enum EvidenceState {
    Ready,
    /// Retrying won't help: the log is gone or not ours to read.
    Unavailable,
    /// Retrying later may help; see `retry_after_secs`.
    Failed,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct JobLogEvidence {
    pub state: EvidenceState,
    pub reason: Option<String>,
    pub signals: Vec<Signal>,
    /// The failed step's section was found and extraction kept to it.
    pub step_found: bool,
    pub bytes_read: u64,
    pub total_bytes: Option<u64>,
    /// Only the tail of the log was read.
    pub truncated: bool,
    pub retry_after_secs: Option<u64>,
}

impl JobLogEvidence {
    fn without_log(state: EvidenceState, reason: String, retry_after_secs: Option<u64>) -> Self {
        Self {
            state,
            reason: Some(reason),
            signals: Vec::new(),
            step_found: false,
            bytes_read: 0,
            total_bytes: None,
            truncated: false,
            retry_after_secs,
        }
    }
}

/// The failure signals in a GitHub Actions job's log: the tail is read with a
/// byte cap and a deadline, sanitized, and parsed off the async runtime. The
/// raw log never leaves Rust. Read failures are an evidence state, not an
/// error, so the caller can show why there is no evidence.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_read_job_log(request: JobLogRequest) -> Result<JobLogEvidence, String> {
    read_job_log(GITHUB_API, request).await
}

/// Sanitized copies of `texts`, for evidence read through the GitHub client
/// (annotations, check-run output) rather than from a log.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn ci_sanitize_texts(texts: Vec<String>) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || texts.iter().map(|text| sanitize::scrub(text)).collect())
        .await
        .map_err(|e| format!("Task join error: {e}"))
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

async fn read_job_log(api_base: &str, request: JobLogRequest) -> Result<JobLogEvidence, String> {
    if !valid_name(&request.owner) || !valid_name(&request.repo) {
        return Err("Invalid repository name".into());
    }
    let max_bytes = request
        .max_bytes
        .unwrap_or(DEFAULT_MAX_BYTES)
        .clamp(1024, LIMIT_MAX_BYTES);
    let timeout_ms = request
        .timeout_ms
        .unwrap_or(DEFAULT_TIMEOUT_MS)
        .clamp(1000, LIMIT_TIMEOUT_MS);
    let tail = job_log::read_tail(TailRequest {
        api_base,
        token: &request.token,
        owner: &request.owner,
        repo: &request.repo,
        job_id: request.job_id,
        max_bytes: max_bytes as usize,
        timeout: Duration::from_millis(u64::from(timeout_ms)),
    })
    .await;
    let tail = match tail {
        Ok(tail) => tail,
        Err(LogError::Unavailable(reason)) => {
            ::log::info!("ci job log unavailable: job={} {reason}", request.job_id);
            return Ok(JobLogEvidence::without_log(
                EvidenceState::Unavailable,
                reason,
                None,
            ));
        }
        Err(LogError::Failed {
            reason,
            retry_after_secs,
        }) => {
            ::log::warn!("ci job log read failed: job={} {reason}", request.job_id);
            return Ok(JobLogEvidence::without_log(
                EvidenceState::Failed,
                reason,
                retry_after_secs,
            ));
        }
    };
    ::log::info!(
        "ci job log read: job={} bytes={} total={:?} truncated={}",
        request.job_id,
        tail.bytes_read,
        tail.total_bytes,
        tail.truncated
    );
    let failed_step = request.failed_step;
    let text = tail.text;
    let (signals, step_found) =
        tokio::task::spawn_blocking(move || signals_from(&text, failed_step.as_deref()))
            .await
            .map_err(|e| format!("Task join error: {e}"))?;
    Ok(JobLogEvidence {
        state: EvidenceState::Ready,
        reason: tail.truncated.then(|| {
            format!(
                "Read the last {} of {}",
                size(tail.bytes_read.min(u64::from(max_bytes))),
                tail.total_bytes
                    .map(size)
                    .unwrap_or_else(|| "a longer log".into())
            )
        }),
        signals,
        step_found,
        bytes_read: tail.bytes_read,
        total_bytes: tail.total_bytes,
        truncated: tail.truncated,
        retry_after_secs: None,
    })
}

/// Sanitize, extract, then sanitize each signal again: extraction joins
/// lines, which could rebuild a credential the line-wise pass missed.
pub fn signals_from(text: &str, failed_step: Option<&str>) -> (Vec<Signal>, bool) {
    let clean = sanitize::scrub(text);
    let extraction = extract::extract(&clean, failed_step);
    let mut signals = extraction.signals;
    for signal in &mut signals {
        signal.map_text(&sanitize::scrub);
    }
    (signals, extraction.step_found)
}

fn size(bytes: u64) -> String {
    const MIB: f64 = 1024.0 * 1024.0;
    if bytes as f64 >= MIB {
        format!("{:.1} MiB", bytes as f64 / MIB)
    } else {
        format!("{} KiB", bytes.div_ceil(1024))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_path_tricks_in_names() {
        let request = JobLogRequest {
            token: "t".into(),
            owner: "../../user".into(),
            repo: "r".into(),
            job_id: 1,
            failed_step: None,
            max_bytes: None,
            timeout_ms: None,
        };
        assert!(read_job_log("http://127.0.0.1:9", request).await.is_err());
    }

    #[tokio::test]
    async fn an_unreachable_api_is_a_failed_state() {
        let request = JobLogRequest {
            token: "t".into(),
            owner: "o".into(),
            repo: "r".into(),
            job_id: 1,
            failed_step: None,
            max_bytes: None,
            timeout_ms: Some(2000),
        };
        let evidence = read_job_log("http://127.0.0.1:9", request).await.unwrap();
        assert_eq!(evidence.state, EvidenceState::Failed);
        assert!(evidence.signals.is_empty());
    }

    #[test]
    fn signals_are_sanitized() {
        let log =
            "src/app.ts(1,1): error TS2322: token ghp_abcdefghijklmnopqrstuvwxyz0123456789 leaked";
        let (signals, _) = signals_from(log, None);
        assert_eq!(signals.len(), 1);
        assert!(!signals[0].message.contains("ghp_"));
        assert!(signals[0].message.contains("[REDACTED:github-token]"));
    }

    #[test]
    fn sizes_read_as_people_write_them() {
        assert_eq!(size(2 * 1024 * 1024), "2.0 MiB");
        assert_eq!(size(1500), "2 KiB");
    }
}
