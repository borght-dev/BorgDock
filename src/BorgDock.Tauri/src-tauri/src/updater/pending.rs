use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// A downloaded, verified update: installed on restart, or when the app exits.
pub struct PendingUpdate<T> {
    update: Mutex<Option<T>>,
    installing: AtomicBool,
}

impl<T> Default for PendingUpdate<T> {
    fn default() -> Self {
        Self {
            update: Mutex::new(None),
            installing: AtomicBool::new(false),
        }
    }
}

pub(super) enum Restart<T> {
    Install(T),
    AlreadyInstalling,
    NothingDownloaded,
}

impl<T> PendingUpdate<T> {
    pub(super) fn stage(&self, update: T) {
        *self.update.lock().unwrap() = Some(update);
    }

    fn take(&self) -> Option<T> {
        self.update.lock().unwrap().take()
    }

    /// The installer launch takes seconds (writing it out, SmartScreen), and
    /// the app exits only once it has started. A second click in that window
    /// must not report a failure: the first one is about to restart the app.
    pub(super) fn begin_restart(&self) -> Restart<T> {
        let mut update = self.update.lock().unwrap();
        match update.take() {
            Some(update) => {
                self.installing.store(true, Ordering::SeqCst);
                Restart::Install(update)
            }
            None if self.installing.load(Ordering::SeqCst) => Restart::AlreadyInstalling,
            None => Restart::NothingDownloaded,
        }
    }

    pub(super) fn restart_failed(&self, update: T) {
        self.stage(update);
        self.installing.store(false, Ordering::SeqCst);
    }

    pub(super) fn install_with(&self, install: impl FnOnce(T)) {
        if let Some(update) = self.take() {
            install(update);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{PendingUpdate, Restart};

    #[test]
    fn second_restart_while_installing_is_not_a_failure() {
        let pending = PendingUpdate::default();
        assert!(matches!(
            pending.begin_restart(),
            Restart::<&str>::NothingDownloaded
        ));

        pending.stage("verified update");
        assert!(matches!(
            pending.begin_restart(),
            Restart::Install("verified update")
        ));
        assert!(matches!(
            pending.begin_restart(),
            Restart::AlreadyInstalling
        ));

        pending.restart_failed("verified update");
        assert!(matches!(
            pending.begin_restart(),
            Restart::Install("verified update")
        ));
    }

    #[test]
    fn downloaded_update_waits_until_exit() {
        let pending = PendingUpdate::default();
        pending.stage("verified update");
        let mut installed = Vec::new();

        assert!(installed.is_empty());
        pending.install_with(|update| installed.push(update));
        pending.install_with(|update| installed.push(update));

        assert_eq!(installed, ["verified update"]);
    }
}
