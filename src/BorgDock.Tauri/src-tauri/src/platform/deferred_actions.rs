use std::collections::HashSet;
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

type Action = Box<dyn FnOnce() + Send>;

struct PendingAction {
    key: &'static str,
    action: Action,
}

pub struct DeferredActions {
    sender: mpsc::Sender<PendingAction>,
    pending: Arc<Mutex<HashSet<&'static str>>>,
}

impl DeferredActions {
    // Tauri's main-thread dispatcher runs inline on the GUI thread. A worker
    // escapes the shortcut plugin's locked callback before posting GUI work.
    pub fn new(
        dispatch: impl Fn(Action) -> Result<(), String> + Send + 'static,
        report_error: impl Fn(&str, &str) + Send + 'static,
        timeout: Duration,
    ) -> std::io::Result<Self> {
        let (sender, receiver) = mpsc::channel::<PendingAction>();
        let pending = Arc::new(Mutex::new(HashSet::new()));
        let worker_pending = pending.clone();
        std::thread::Builder::new()
            .name("window-actions".into())
            .spawn(move || {
                for PendingAction { key, action } in receiver {
                    let (done, completed) = mpsc::channel();
                    let result = dispatch(Box::new(move || {
                        action();
                        let _ = done.send(());
                    }));
                    if result.is_ok() {
                        match completed.recv_timeout(timeout) {
                            Ok(()) => {}
                            Err(mpsc::RecvTimeoutError::Timeout) => {
                                report_error(
                                    key,
                                    "GUI action has not completed; keeping later actions queued",
                                );
                                let _ = completed.recv();
                            }
                            Err(mpsc::RecvTimeoutError::Disconnected) => {
                                report_error(key, "GUI action dropped before completing");
                            }
                        }
                    }
                    if let Ok(mut pending) = worker_pending.lock() {
                        pending.remove(key);
                    }
                    if let Err(error) = result {
                        report_error(key, &error);
                    }
                }
            })?;
        Ok(Self { sender, pending })
    }

    pub fn push(
        &self,
        key: &'static str,
        action: impl FnOnce() + Send + 'static,
    ) -> Result<bool, String> {
        let mut pending = self.pending.lock().map_err(|e| e.to_string())?;
        if !pending.insert(key) {
            return Ok(false);
        }
        if self
            .sender
            .send(PendingAction {
                key,
                action: Box::new(action),
            })
            .is_err()
        {
            pending.remove(key);
            return Err("window action worker stopped".into());
        }
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WAIT: Duration = Duration::from_secs(2);

    #[test]
    fn callback_can_return_before_a_gui_action_reenters_its_lock() {
        let callback_thread = std::thread::current().id();
        let (posted, gui) = mpsc::channel();
        let queue = DeferredActions::new(
            move |action| {
                assert_ne!(std::thread::current().id(), callback_thread);
                posted.send(action).unwrap();
                Ok(())
            },
            |_, error| panic!("{error}"),
            WAIT,
        )
        .unwrap();
        let shortcut_lock = Arc::new(Mutex::new(()));
        let (executed, result) = mpsc::channel();
        {
            let _callback_guard = shortcut_lock.lock().unwrap();
            let reentrant_lock = shortcut_lock.clone();
            queue
                .push("worktrees", move || {
                    let _nested_callback = reentrant_lock
                        .try_lock()
                        .expect("shortcut callback still holds its lock");
                    executed.send(()).unwrap();
                })
                .unwrap();
            let action = gui.recv_timeout(WAIT).expect("GUI action was not posted");
            drop(_callback_guard);
            action();
        }
        result
            .recv_timeout(WAIT)
            .expect("GUI action did not execute");
    }

    #[test]
    fn repeated_requests_coalesce_until_the_gui_action_actually_finishes() {
        let (posted, gui) = mpsc::channel();
        let queue = DeferredActions::new(
            move |action| {
                posted.send(action).unwrap();
                Ok(())
            },
            |_, error| panic!("{error}"),
            WAIT,
        )
        .unwrap();
        assert!(queue.push("worktrees", || {}).unwrap());
        let first = gui.recv_timeout(WAIT).unwrap();
        assert!(!queue.push("worktrees", || panic!("duplicate ran")).unwrap());
        assert!(queue.push("files", || {}).unwrap());
        assert!(gui.recv_timeout(Duration::from_millis(30)).is_err());
        first();
        let second = gui.recv_timeout(WAIT).unwrap();
        assert!(queue.push("worktrees", || {}).unwrap());
        second();
        gui.recv_timeout(WAIT).unwrap()();
    }

    #[test]
    fn failed_dispatch_releases_the_pending_request_for_retry() {
        let (failed, failures) = mpsc::channel();
        let queue = DeferredActions::new(
            |_| Err("dispatcher stopped".into()),
            move |key, error| {
                failed.send((key.to_string(), error.to_string())).unwrap();
            },
            WAIT,
        )
        .unwrap();
        for _ in 0..2 {
            assert!(queue.push("sql", || panic!("failed dispatch ran")).unwrap());
            assert_eq!(
                failures.recv_timeout(WAIT).unwrap(),
                ("sql".into(), "dispatcher stopped".into())
            );
        }
    }

    #[test]
    fn timeout_keeps_actions_serial_until_the_stalled_action_finishes() {
        let (posted, gui) = mpsc::channel();
        let (reported, errors) = mpsc::channel();
        let queue = DeferredActions::new(
            move |action| {
                posted.send(action).unwrap();
                Ok(())
            },
            move |_, _| {
                reported.send(()).unwrap();
            },
            Duration::from_millis(10),
        )
        .unwrap();
        queue.push("worktrees", || {}).unwrap();
        let first = gui.recv_timeout(WAIT).unwrap();
        queue.push("files", || {}).unwrap();
        errors
            .recv_timeout(WAIT)
            .expect("did not observe the actual stalled action");
        assert!(gui.try_recv().is_err());
        assert!(!queue.push("worktrees", || panic!("duplicate ran")).unwrap());
        first();
        gui.recv_timeout(WAIT).unwrap()();
    }
}
