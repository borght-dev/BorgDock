//! ADO auth resolver — az CLI token fetching + PAT header formatting.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use crate::git::hidden_command;
use serde::Serialize;
use std::io;

/// Errors that `ado_resolve_auth_header` may surface to the UI.
/// Serialized as a tagged enum so TS can discriminate.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum AdoAuthError {
    AzNotInstalled,
    AzNotLoggedIn,
    TokenFetchFailed(String),
    MissingPat,
    InvalidMethod(String),
}

/// Pure classifier for az-cli failures. Extracted for testability —
/// `az_cli_token` delegates to this after running the command.
pub(crate) fn classify_az_error(
    spawn_err: Option<io::ErrorKind>,
    exit_code: Option<i32>,
    stderr: &str,
) -> AdoAuthError {
    if spawn_err == Some(io::ErrorKind::NotFound) {
        return AdoAuthError::AzNotInstalled;
    }
    if spawn_err.is_some() {
        return AdoAuthError::TokenFetchFailed(format!(
            "failed to spawn az: {:?}",
            spawn_err.unwrap()
        ));
    }
    let lowered = stderr.to_ascii_lowercase();
    if lowered.contains("az login")
        || lowered.contains("please run 'az login'")
        || lowered.contains("not logged in")
    {
        return AdoAuthError::AzNotLoggedIn;
    }
    AdoAuthError::TokenFetchFailed(format!(
        "az exited {} — {}",
        exit_code.unwrap_or(-1),
        stderr.trim()
    ))
}

const ADO_RESOURCE_ID: &str = "499b84ac-1321-427f-aa17-267ca6975798";

/// Fetch an Azure DevOps bearer token via `az account get-access-token`.
/// Returns the raw token on success, or a classified `AdoAuthError`.
pub fn az_cli_token() -> Result<String, AdoAuthError> {
    let result = hidden_command("az")
        .args([
            "account",
            "get-access-token",
            "--resource",
            ADO_RESOURCE_ID,
            "--query",
            "accessToken",
            "-o",
            "tsv",
        ])
        .output();

    let output = match result {
        Ok(o) => o,
        Err(e) => return Err(classify_az_error(Some(e.kind()), None, "")),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(classify_az_error(None, output.status.code(), &stderr));
    }

    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if token.is_empty() {
        return Err(AdoAuthError::TokenFetchFailed(
            "az returned empty token".to_string(),
        ));
    }
    Ok(token)
}

/// Cheap "is az installed?" probe — runs `az --version` and returns
/// whether it exited successfully. Does not test login state; that
/// surfaces naturally when a token fetch is attempted.
#[tauri::command]
pub fn az_cli_available() -> bool {
    hidden_command("az")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Compose a `Basic` Authorization header value for an ADO PAT.
/// ADO accepts an empty username, so the encoded payload is `":<pat>"`.
pub(crate) fn format_pat_header(pat: &str) -> String {
    format!("Basic {}", STANDARD.encode(format!(":{pat}")))
}

/// Pure dispatch — extracted for testability. `az_cli_token` is only
/// called by the public Tauri command below, which wraps this.
pub(crate) fn resolve_header_internal(
    method: &str,
    pat: Option<String>,
) -> Result<String, AdoAuthError> {
    match method {
        "azCli" => {
            let token = az_cli_token()?;
            Ok(format!("Bearer {token}"))
        }
        "pat" => match pat.as_deref().map(str::trim) {
            Some(p) if !p.is_empty() => Ok(format_pat_header(p)),
            _ => Err(AdoAuthError::MissingPat),
        },
        other => Err(AdoAuthError::InvalidMethod(other.to_string())),
    }
}

/// Tauri command — returns a ready-to-use `Authorization` header value
/// based on the caller-supplied auth method and optional PAT.
#[tauri::command]
pub fn ado_resolve_auth_header(
    auth_method: String,
    pat: Option<String>,
) -> Result<String, AdoAuthError> {
    resolve_header_internal(&auth_method, pat)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_pat_header_prepends_colon_and_base64_encodes() {
        // ":hello" → "OmhlbGxv" (standard base64)
        let header = format_pat_header("hello");
        assert_eq!(header, "Basic OmhlbGxv");
    }

    #[test]
    fn resolve_header_pat_mode_returns_basic() {
        let result = resolve_header_internal("pat", Some("abc123".to_string()));
        assert_eq!(result.unwrap(), "Basic OmFiYzEyMw==");
    }

    #[test]
    fn resolve_header_pat_mode_missing_pat_errors() {
        let result = resolve_header_internal("pat", None);
        assert!(matches!(result.unwrap_err(), AdoAuthError::MissingPat));
    }

    #[test]
    fn resolve_header_pat_mode_empty_pat_errors() {
        let result = resolve_header_internal("pat", Some("".to_string()));
        assert!(matches!(result.unwrap_err(), AdoAuthError::MissingPat));
    }

    #[test]
    fn resolve_header_invalid_method_errors() {
        let result = resolve_header_internal("xyz", None);
        match result.unwrap_err() {
            AdoAuthError::InvalidMethod(m) => assert_eq!(m, "xyz"),
            _ => panic!("expected InvalidMethod"),
        }
    }

    #[test]
    fn classify_spawn_not_found_is_not_installed() {
        let err = classify_az_error(Some(io::ErrorKind::NotFound), None, "");
        assert!(matches!(err, AdoAuthError::AzNotInstalled));
    }

    #[test]
    fn classify_spawn_permission_denied_is_token_fetch_failed() {
        let err = classify_az_error(Some(io::ErrorKind::PermissionDenied), None, "");
        assert!(matches!(err, AdoAuthError::TokenFetchFailed(_)));
    }

    #[test]
    fn classify_az_login_stderr_is_not_logged_in() {
        let err = classify_az_error(
            None,
            Some(1),
            "ERROR: Please run 'az login' to setup account.",
        );
        assert!(matches!(err, AdoAuthError::AzNotLoggedIn));
    }

    #[test]
    fn classify_generic_stderr_is_token_fetch_failed() {
        let err = classify_az_error(None, Some(2), "some other error");
        match err {
            AdoAuthError::TokenFetchFailed(msg) => {
                assert!(msg.contains("az exited 2"));
                assert!(msg.contains("some other error"));
            }
            _ => panic!("expected TokenFetchFailed"),
        }
    }
}
