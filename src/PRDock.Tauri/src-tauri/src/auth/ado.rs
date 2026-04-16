//! ADO auth resolver — az CLI token fetching + PAT header formatting.

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

#[cfg(test)]
mod tests {
    use super::*;

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
