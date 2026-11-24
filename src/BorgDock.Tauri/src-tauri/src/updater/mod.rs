//! Update checks. Rust owns the schedule and the status: every window reads
//! the same `UpdateStatus` (`update_status`) and follows `update-status-changed`.
//! A webview's timers stop while the machine sleeps and each window had its
//! own answer; `borgdock.log` says what every check found (`grep updater:`).

mod pending;
mod schedule;
mod status;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

pub use pending::PendingUpdate;
use pending::Restart;
use schedule::Attempt;
pub use status::{UpdatePhase, UpdateStatus};

pub type DownloadedUpdate = (Update, Vec<u8>);

pub const CHANGED_EVENT: &str = "update-status-changed";
/// A check or download that never answers would leave its phase forever, and
/// no check starts during one.
const CHECK_TIMEOUT: Duration = Duration::from_secs(60);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(15 * 60);

/// The whole status, after every change to it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type, tauri_specta::Event))]
#[serde(transparent)]
pub struct UpdateStatusChanged(pub UpdateStatus);

#[derive(Default)]
pub struct Updates {
    status: Mutex<UpdateStatus>,
    last_attempt: Mutex<Option<Attempt>>,
    /// What the last check found, so its download needs no second check.
    found: Mutex<Option<Update>>,
    pending: PendingUpdate<DownloadedUpdate>,
}

#[derive(Clone, Copy)]
enum Trigger {
    Automatic,
    Manual,
}

impl fmt::Display for Trigger {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Automatic => "automatic",
            Self::Manual => "manual",
        })
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn status(app: &AppHandle) -> UpdateStatus {
    lock(&app.state::<Updates>().status).clone()
}

/// Every change to the status goes through here, so every window hears of it.
fn change<T>(app: &AppHandle, apply: impl FnOnce(&mut UpdateStatus) -> T) -> T {
    let updates = app.state::<Updates>();
    let (result, changed) = {
        let mut status = lock(&updates.status);
        let before = status.clone();
        let result = apply(&mut status);
        (result, (*status != before).then(|| status.clone()))
    };
    if let Some(status) = changed {
        if let Err(error) = app.emit(CHANGED_EVENT, UpdateStatusChanged(status)) {
            log::warn!("updater: could not emit {CHANGED_EVENT}: {error}");
        }
    }
    result
}

fn record_attempt(app: &AppHandle, succeeded: bool) {
    *lock(&app.state::<Updates>().last_attempt) = Some(Attempt {
        at: Utc::now(),
        succeeded,
    });
}

fn now_text() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

async fn update_settings() -> Result<crate::settings::models::UpdateSettings, String> {
    tokio::task::spawn_blocking(crate::settings::load_settings_internal)
        .await
        .map_err(|e| e.to_string())?
        .map(|settings| settings.updates)
}

async fn find_update(app: &AppHandle) -> Result<Option<Update>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match tokio::time::timeout(CHECK_TIMEOUT, updater.check()).await {
        Ok(found) => found.map_err(|e| e.to_string()),
        Err(_) => Err("the release feed did not answer in time".to_string()),
    }
}

/// One check, and the download of what it found when `download` is set.
async fn check(app: &AppHandle, trigger: Trigger, download: bool) -> UpdateStatus {
    let Some(resume) = change(app, UpdateStatus::begin_check) else {
        return status(app);
    };
    log::info!("updater: checking ({trigger})");
    let found = find_update(app).await;
    let at = now_text();
    let updates = app.state::<Updates>();
    match found {
        Ok(Some(update)) => {
            log::info!(
                "updater: current={} latest={}",
                update.current_version,
                update.version
            );
            *lock(&updates.found) = Some(update.clone());
            record_attempt(app, true);
            change(app, |status| status.found(&update.version, &at, download));
            if download {
                fetch(app, update).await;
            }
        }
        Ok(None) => {
            log::info!(
                "updater: up to date (current={})",
                app.package_info().version
            );
            *lock(&updates.found) = None;
            record_attempt(app, true);
            change(app, |status| status.up_to_date(&at));
        }
        Err(error) => {
            log::warn!("updater: check failed: {error}");
            record_attempt(app, false);
            change(app, |status| {
                status.check_failed(resume, format!("Check failed: {error}"), &at)
            });
        }
    }
    status(app)
}

/// Downloads `update`; the phase is `downloading` already.
async fn fetch(app: &AppHandle, update: Update) {
    let progress_app = app.clone();
    let mut received: u64 = 0;
    let download = update.download(
        move |chunk_length, content_length| {
            received += chunk_length as u64;
            if let Some(percent) = status::percent(received, content_length) {
                // Only a whole-percent change is a change, so only that is emitted.
                change(&progress_app, |status| status.progressed(percent));
            }
        },
        || {},
    );
    let downloaded = match tokio::time::timeout(DOWNLOAD_TIMEOUT, download).await {
        Ok(bytes) => bytes.map_err(|e| e.to_string()),
        Err(_) => Err("it took too long".to_string()),
    };
    let updates = app.state::<Updates>();
    match downloaded {
        Ok(bytes) => {
            log::info!("updater: downloaded {}", update.version);
            updates.pending.stage((update, bytes));
            *lock(&updates.found) = None;
            change(app, UpdateStatus::downloaded);
        }
        Err(error) => {
            log::warn!("updater: download of {} failed: {error}", update.version);
            // A failed attempt: the schedule tries again after its short wait.
            record_attempt(app, false);
            change(app, |status| {
                status.download_failed(format!("Download failed: {error}"))
            });
        }
    }
}

/// Downloads what the last check found; checks first when it found nothing.
async fn download(app: &AppHandle) -> UpdateStatus {
    let found = lock(&app.state::<Updates>().found).clone();
    let Some(update) = found else {
        return check(app, Trigger::Manual, true).await;
    };
    if change(app, UpdateStatus::begin_download) {
        fetch(app, update).await;
    }
    status(app)
}

async fn automatic_check(app: &AppHandle) {
    // Read from disk on every tick: a toggle in Settings applies without a restart.
    let settings = match update_settings().await {
        Ok(settings) => settings,
        Err(error) => {
            log::warn!("updater: could not read the settings: {error}");
            return;
        }
    };
    let updates = app.state::<Updates>();
    let phase = lock(&updates.status).phase;
    let last = *lock(&updates.last_attempt);
    if schedule::check_due(settings.auto_check_enabled, phase, last, Utc::now()) {
        check(app, Trigger::Automatic, settings.auto_download).await;
    }
}

/// The first automatic check shortly after launch, then one whenever the
/// schedule says so (`schedule::check_due`).
pub fn start(app: AppHandle) {
    let current = app.package_info().version.to_string();
    change(&app, |status| status.current_version = current);
    // A dev build must not download a release and install it over the
    // installed app on exit. Settings → Updates → Check for updates still works.
    if cfg!(debug_assertions) {
        log::info!("updater: automatic checks are off in a debug build");
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(schedule::FIRST_CHECK_AFTER).await;
        loop {
            automatic_check(&app).await;
            tokio::time::sleep(schedule::TICK).await;
        }
    });
}

pub fn install_pending_update(app: &AppHandle) {
    app.state::<Updates>()
        .pending
        .install_with(|(update, bytes)| {
            if let Err(error) = update.install(bytes) {
                log::error!("updater: install on exit failed: {error}");
            }
        });
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn update_status(app: AppHandle) -> UpdateStatus {
    status(&app)
}

/// Check now. A failed check is in the status (`lastError`), not an error.
#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn check_for_update(app: AppHandle) -> UpdateStatus {
    let download = match update_settings().await {
        Ok(settings) => settings.auto_download,
        Err(error) => {
            log::warn!("updater: could not read the settings: {error}");
            false
        }
    };
    check(&app, Trigger::Manual, download).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn download_update(app: AppHandle) -> UpdateStatus {
    download(&app).await
}

#[tauri::command]
#[cfg_attr(test, specta::specta)]
pub async fn restart_to_apply_update(app: AppHandle) -> Result<(), String> {
    let updates = app.state::<Updates>();
    let (update, bytes) = match updates.pending.begin_restart() {
        Restart::Install(downloaded) => downloaded,
        Restart::AlreadyInstalling => return Ok(()),
        Restart::NothingDownloaded => return Err("No downloaded update ready".into()),
    };
    log::info!("updater: installing {}", update.version);
    change(&app, UpdateStatus::begin_install);
    // On Windows install() starts the installer and exits the process itself.
    let (update, bytes, installed) = tauri::async_runtime::spawn_blocking(move || {
        let installed = update.install(&bytes);
        (update, bytes, installed)
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Err(error) = installed {
        log::error!("updater: install failed: {error}");
        updates.pending.restart_failed((update, bytes));
        change(&app, |status| {
            status.install_failed(format!("Could not start the installer: {error}"))
        });
        return Err(error.to_string());
    }
    app.restart()
}
