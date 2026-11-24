use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "lowercase")]
pub enum UpdatePhase {
    #[default]
    Idle,
    Checking,
    /// A newer version is known and waits for its download.
    Available,
    Downloading,
    /// Downloaded and verified: installed on restart, or when the app exits.
    Ready,
    Installing,
}

impl UpdatePhase {
    /// No check starts in these phases.
    pub(super) fn is_busy(self) -> bool {
        matches!(
            self,
            Self::Checking | Self::Downloading | Self::Ready | Self::Installing
        )
    }
}

/// What every window shows about updates.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub phase: UpdatePhase,
    pub current_version: String,
    /// The newer version, once a check found one.
    pub version: Option<String>,
    /// 0..100 while downloading.
    pub progress: u8,
    /// When the last check finished, successful or not (RFC 3339).
    pub last_checked_at: Option<String>,
    /// Why the last check, download or install failed; the next success clears it.
    pub last_error: Option<String>,
}

impl UpdateStatus {
    /// Claims the check. Answers the phase to return to if it fails, or
    /// `None` while another check, a download or a restart is underway.
    pub(super) fn begin_check(&mut self) -> Option<UpdatePhase> {
        if self.phase.is_busy() {
            return None;
        }
        let resume = self.phase;
        self.phase = UpdatePhase::Checking;
        Some(resume)
    }

    /// `download`: the download starts right away, so windows never show a
    /// Download button that is about to go.
    pub(super) fn found(&mut self, version: &str, at: &str, download: bool) {
        self.phase = if download {
            UpdatePhase::Downloading
        } else {
            UpdatePhase::Available
        };
        self.version = Some(version.to_string());
        self.progress = 0;
        self.last_checked_at = Some(at.to_string());
        self.last_error = None;
    }

    pub(super) fn up_to_date(&mut self, at: &str) {
        self.phase = UpdatePhase::Idle;
        self.version = None;
        self.progress = 0;
        self.last_checked_at = Some(at.to_string());
        self.last_error = None;
    }

    pub(super) fn check_failed(&mut self, resume: UpdatePhase, error: String, at: &str) {
        self.phase = resume;
        self.last_checked_at = Some(at.to_string());
        self.last_error = Some(error);
    }

    /// Claims the download of the version a check found.
    pub(super) fn begin_download(&mut self) -> bool {
        if self.phase != UpdatePhase::Available {
            return false;
        }
        self.phase = UpdatePhase::Downloading;
        self.progress = 0;
        true
    }

    pub(super) fn progressed(&mut self, percent: u8) {
        if self.phase == UpdatePhase::Downloading {
            self.progress = percent.min(100);
        }
    }

    pub(super) fn downloaded(&mut self) {
        self.phase = UpdatePhase::Ready;
        self.progress = 100;
        self.last_error = None;
    }

    pub(super) fn download_failed(&mut self, error: String) {
        self.phase = UpdatePhase::Available;
        self.progress = 0;
        self.last_error = Some(error);
    }

    pub(super) fn begin_install(&mut self) {
        self.phase = UpdatePhase::Installing;
    }

    pub(super) fn install_failed(&mut self, error: String) {
        self.phase = UpdatePhase::Ready;
        self.last_error = Some(error);
    }
}

/// Whole percent of a download, once the server said how large it is.
pub(super) fn percent(received: u64, total: Option<u64>) -> Option<u8> {
    let total = total.filter(|total| *total > 0)?;
    Some((received.saturating_mul(100) / total).min(100) as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    const AT: &str = "2026-11-24T09:00:10Z";
    const LATER: &str = "2026-11-24T10:00:10Z";

    fn installed() -> UpdateStatus {
        UpdateStatus {
            current_version: "4.16.0".into(),
            ..UpdateStatus::default()
        }
    }

    #[test]
    fn the_wire_names_are_the_ones_the_windows_read() {
        let mut status = installed();
        status.begin_check();
        status.found("4.17.0", AT, false);
        assert_eq!(
            serde_json::to_value(&status).unwrap(),
            serde_json::json!({
                "phase": "available",
                "currentVersion": "4.16.0",
                "version": "4.17.0",
                "progress": 0,
                "lastCheckedAt": AT,
                "lastError": null,
            })
        );
    }

    #[test]
    fn a_check_that_finds_nothing_says_when_it_looked() {
        let mut status = installed();
        assert_eq!(status.begin_check(), Some(UpdatePhase::Idle));
        assert_eq!(status.phase, UpdatePhase::Checking);
        status.up_to_date(AT);
        assert_eq!(status.phase, UpdatePhase::Idle);
        assert_eq!(status.version, None);
        assert_eq!(status.last_checked_at.as_deref(), Some(AT));
    }

    #[test]
    fn a_failed_check_keeps_its_reason_until_the_next_success() {
        let mut status = installed();
        let resume = status.begin_check().unwrap();
        status.check_failed(resume, "no network".into(), AT);
        assert_eq!(status.phase, UpdatePhase::Idle);
        assert_eq!(status.last_checked_at.as_deref(), Some(AT));
        assert_eq!(status.last_error.as_deref(), Some("no network"));

        let _ = status.begin_check();
        status.up_to_date(LATER);
        assert_eq!(status.last_error, None);
        assert_eq!(status.last_checked_at.as_deref(), Some(LATER));
    }

    #[test]
    fn a_failed_check_does_not_forget_the_version_found_before() {
        let mut status = installed();
        status.begin_check();
        status.found("4.17.0", AT, false);
        let resume = status.begin_check().unwrap();
        status.check_failed(resume, "no network".into(), LATER);
        assert_eq!(status.phase, UpdatePhase::Available);
        assert_eq!(status.version.as_deref(), Some("4.17.0"));
    }

    #[test]
    fn only_one_check_runs_and_none_during_a_download_or_before_a_restart() {
        let mut status = installed();
        assert!(status.begin_check().is_some());
        assert_eq!(status.begin_check(), None, "already checking");

        status.found("4.17.0", AT, true);
        assert_eq!(status.phase, UpdatePhase::Downloading);
        assert_eq!(status.begin_check(), None, "downloading");

        status.downloaded();
        assert_eq!(status.begin_check(), None, "ready");
        status.begin_install();
        assert_eq!(status.begin_check(), None, "installing");
    }

    #[test]
    fn a_download_runs_once_and_reports_whole_percents() {
        let mut status = installed();
        assert!(!status.begin_download(), "nothing found yet");
        status.begin_check();
        status.found("4.17.0", AT, false);

        assert!(status.begin_download());
        assert!(!status.begin_download(), "already downloading");
        status.progressed(42);
        assert_eq!(status.progress, 42);

        status.downloaded();
        assert_eq!(status.phase, UpdatePhase::Ready);
        assert_eq!(status.progress, 100);
        status.progressed(7);
        assert_eq!(
            status.progress, 100,
            "progress after the download is ignored"
        );
    }

    #[test]
    fn a_failed_download_offers_the_version_again() {
        let mut status = installed();
        status.begin_check();
        status.found("4.17.0", AT, true);
        status.progressed(60);
        status.download_failed("Download failed: connection reset".into());
        assert_eq!(status.phase, UpdatePhase::Available);
        assert_eq!(status.progress, 0);
        assert_eq!(status.version.as_deref(), Some("4.17.0"));
        assert!(status.last_error.is_some());

        assert!(status.begin_download());
        status.downloaded();
        assert_eq!(status.last_error, None);
    }

    #[test]
    fn a_failed_install_stays_ready_to_try_again() {
        let mut status = installed();
        status.begin_check();
        status.found("4.17.0", AT, true);
        status.downloaded();
        status.begin_install();
        status.install_failed("Could not start the installer: access denied".into());
        assert_eq!(status.phase, UpdatePhase::Ready);
        assert!(status.last_error.is_some());
    }

    #[test]
    fn percent_needs_a_known_size() {
        assert_eq!(percent(500, None), None);
        assert_eq!(percent(500, Some(0)), None);
        assert_eq!(percent(0, Some(1000)), Some(0));
        assert_eq!(percent(429, Some(1000)), Some(42));
        assert_eq!(percent(1000, Some(1000)), Some(100));
        assert_eq!(percent(1500, Some(1000)), Some(100));
    }
}
