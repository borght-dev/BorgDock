use crate::agent_overview::state::{apply_event, apply_tick};
use crate::agent_overview::types::{
    CwdInfo, RawEvent, SessionDelta, SessionRecord, SessionState,
};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::UnboundedSender;

/// Configurable timing thresholds (mirrored in AgentOverviewSettings).
#[derive(Debug, Clone, Copy)]
pub struct StoreThresholds {
    pub idle_after: Duration,
    pub ended_after: Duration,
    pub finished_to_awaiting_after: Duration,
    pub history_retention: Duration,
}

impl Default for StoreThresholds {
    fn default() -> Self {
        Self {
            idle_after: Duration::from_secs(300),
            ended_after: Duration::from_secs(1800),
            finished_to_awaiting_after: Duration::from_secs(30),
            history_retention: Duration::from_secs(14_400),
        }
    }
}

/// Shared session store. Reads from many threads (commands, bootstrap, notify);
/// writes only from the event-loop task. The lock is `pub(crate)` so the
/// notify tracker and other crate-local consumers can read it directly, but
/// not so external callers can bypass the store API.
#[derive(Clone, Default)]
pub struct SessionStore {
    pub(crate) inner: Arc<RwLock<HashMap<String, SessionRecord>>>,
}

impl SessionStore {
    pub fn snapshot(&self) -> Vec<SessionRecord> {
        let now = Instant::now();
        self.inner
            .read()
            .map(|m| m.values().cloned().map(|r| seal_for_emit(r, now)).collect())
            .unwrap_or_default()
    }

    /// Snapshot for in-process consumers (notify tracker, etc.) — returns the
    /// raw cloned records with their `Instant` fields intact. Never serialize
    /// the result; use `snapshot()` for that.
    pub fn internal_snapshot(&self) -> Vec<SessionRecord> {
        self.inner
            .read()
            .map(|m| m.values().cloned().collect())
            .unwrap_or_default()
    }

    pub fn ingest_event(
        &self,
        event: RawEvent,
        cwd: Option<CwdInfo>,
        deltas: &UnboundedSender<SessionDelta>,
        now: Instant,
    ) {
        let mut map = match self.inner.write() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        let session_id = event.session_id.clone();
        // Compute the per-(repo, worktree) index BEFORE we mutably borrow the
        // map — otherwise the borrow checker complains. The count includes
        // both Ended history entries and live sessions; that's fine because
        // labels remain unique for the lifetime of the store regardless.
        let info = cwd.clone().unwrap_or_else(|| CwdInfo {
            cwd: PathBuf::from("<unknown>"),
            repo: "unknown".into(),
            worktree: "?".into(),
            branch: "?".into(),
        });
        let needs_init = !map.contains_key(&session_id);
        let label_index = if needs_init {
            map.values()
                .filter(|r| r.repo == info.repo && r.worktree == info.worktree)
                .count() as u32
                + 1
        } else {
            0
        };
        let entry = map.entry(session_id.clone()).or_insert_with(|| {
            SessionRecord {
                session_id: session_id.clone(),
                cwd: info.cwd.clone(),
                repo: info.repo.clone(),
                worktree: info.worktree.clone(),
                branch: info.branch.clone(),
                label: format!(
                    "{} · {} #{}",
                    short_repo(&info.repo),
                    info.worktree,
                    label_index,
                ),
                state: SessionState::Working,
                state_since: now,
                last_event_at: now,
                last_user_msg: None,
                task: None,
                model: None,
                tokens_used: 0,
                tokens_max: 200_000,
                last_api_stop_reason: None,
                pending_tool_uses: HashSet::new(),
                state_since_ms: 0,
                last_event_ms: 0,
            }
        });

        let changed = apply_event(entry, &event, now);
        if changed {
            let snap = seal_for_emit(entry.clone(), now);
            let _ = deltas.send(SessionDelta::Upsert { session: snap });
        }
    }

    pub fn run_tick(
        &self,
        thresholds: StoreThresholds,
        deltas: &UnboundedSender<SessionDelta>,
        now: Instant,
    ) {
        let mut to_remove: Vec<String> = Vec::new();
        let mut emits: Vec<SessionDelta> = Vec::new();
        {
            let mut map = match self.inner.write() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            for (id, rec) in map.iter_mut() {
                let changed = apply_tick(
                    rec, now,
                    thresholds.idle_after,
                    thresholds.ended_after,
                    thresholds.finished_to_awaiting_after,
                );
                if rec.state == SessionState::Ended
                    && now.saturating_duration_since(rec.last_event_at) > thresholds.history_retention
                {
                    to_remove.push(id.clone());
                } else if changed {
                    emits.push(SessionDelta::Upsert { session: seal_for_emit(rec.clone(), now) });
                }
            }
            for id in &to_remove {
                map.remove(id);
            }
        }
        for d in emits {
            let _ = deltas.send(d);
        }
        for id in to_remove {
            let _ = deltas.send(SessionDelta::Remove { session_id: id });
        }
    }

    pub fn upsert_bootstrap(&self, rec: SessionRecord, deltas: &UnboundedSender<SessionDelta>) {
        let now = Instant::now();
        let snap = seal_for_emit(rec.clone(), now);
        match self.inner.write() {
            Ok(mut m) => {
                m.insert(rec.session_id.clone(), rec);
            }
            Err(p) => {
                let mut m = p.into_inner();
                m.insert(rec.session_id.clone(), rec);
            }
        }
        let _ = deltas.send(SessionDelta::Upsert { session: snap });
    }
}

/// Convert monotonic Instants into millis-ago for the wire format.
fn seal_for_emit(mut rec: SessionRecord, now: Instant) -> SessionRecord {
    rec.state_since_ms = now.saturating_duration_since(rec.state_since).as_millis();
    rec.last_event_ms = now.saturating_duration_since(rec.last_event_at).as_millis();
    rec
}

/// Public so window.rs can synthesize labels with the same algorithm.
pub fn short_repo(repo: &str) -> String {
    let parts: Vec<&str> = repo.split(|c: char| c == '-' || c == '_' || c == ' ').collect();
    let mut out = String::new();
    if parts.len() > 1 {
        for p in &parts {
            if let Some(c) = p.chars().next() {
                out.push(c.to_ascii_uppercase());
            }
        }
    } else if let Some(first) = repo.chars().next() {
        out.push(first.to_ascii_uppercase());
        for c in repo.chars().skip(1) {
            if c.is_ascii_uppercase() {
                out.push(c);
            }
        }
        if out.len() == 1 {
            for c in repo.chars().skip(1).take(1) {
                out.push(c.to_ascii_uppercase());
            }
        }
    }
    if out.is_empty() {
        out.push_str("?");
    }
    if out.len() > 4 {
        out.truncate(4);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use tokio::sync::mpsc::unbounded_channel;

    fn ev(session: &str, name: &str, attrs: &[(&str, Value)]) -> RawEvent {
        RawEvent {
            session_id: session.into(),
            event_name: name.into(),
            attrs: attrs.iter().map(|(k, v)| (k.to_string(), v.clone())).collect(),
        }
    }

    #[test]
    fn ingest_creates_record_and_emits_upsert() {
        let store = SessionStore::default();
        let (tx, mut rx) = unbounded_channel();
        let cwd = CwdInfo {
            cwd: PathBuf::from("/x"),
            repo: "BorgDock".into(),
            worktree: "master".into(),
            branch: "master".into(),
        };
        store.ingest_event(
            ev("sid", "user_prompt", &[("prompt", Value::String("hi".into()))]),
            Some(cwd),
            &tx,
            Instant::now(),
        );
        let delta = rx.try_recv().unwrap();
        match delta {
            SessionDelta::Upsert { session } => {
                assert_eq!(session.session_id, "sid");
                assert_eq!(session.repo, "BorgDock");
                assert_eq!(session.label, "BD · master #1");
                assert_eq!(session.state, SessionState::Working);
            }
            _ => panic!("expected upsert"),
        }
    }

    #[test]
    fn run_tick_drops_ended_sessions_past_retention() {
        let store = SessionStore::default();
        let (tx, mut rx) = unbounded_channel();
        let now = Instant::now();
        let mut rec = SessionRecord {
            session_id: "sid".into(),
            cwd: PathBuf::from("/x"),
            repo: "BD".into(),
            worktree: "master".into(),
            branch: "master".into(),
            label: "BD · master #1".into(),
            state: SessionState::Ended,
            state_since: now - Duration::from_secs(20_000),
            last_event_at: now - Duration::from_secs(20_000),
            last_user_msg: None,
            task: None,
            model: None,
            tokens_used: 0,
            tokens_max: 200_000,
            last_api_stop_reason: None,
            pending_tool_uses: HashSet::new(),
            state_since_ms: 0,
            last_event_ms: 0,
        };
        rec.session_id = "sid".into();
        store.upsert_bootstrap(rec, &tx);
        let _ = rx.try_recv();

        store.run_tick(StoreThresholds::default(), &tx, now);
        let delta = rx.try_recv().unwrap();
        match delta {
            SessionDelta::Remove { session_id } => assert_eq!(session_id, "sid"),
            _ => panic!("expected remove"),
        }
        assert!(store.inner.read().unwrap().is_empty());
    }

    #[test]
    fn ingest_assigns_unique_label_indices_per_repo_worktree() {
        // Regression: the original implementation hard-coded `#1`, so two
        // sessions in the same repo+worktree got the same label and the UI
        // could not distinguish them.
        let store = SessionStore::default();
        let (tx, mut rx) = unbounded_channel();
        let cwd = CwdInfo {
            cwd: PathBuf::from("/x"),
            repo: "BorgDock".into(),
            worktree: "master".into(),
            branch: "master".into(),
        };

        store.ingest_event(
            ev("sid-a", "user_prompt", &[("prompt", Value::String("first".into()))]),
            Some(cwd.clone()),
            &tx,
            Instant::now(),
        );
        store.ingest_event(
            ev("sid-b", "user_prompt", &[("prompt", Value::String("second".into()))]),
            Some(cwd),
            &tx,
            Instant::now(),
        );

        let mut labels = Vec::new();
        while let Ok(SessionDelta::Upsert { session }) = rx.try_recv() {
            labels.push(session.label);
        }
        // Two sessions in the same repo+worktree should get distinct labels.
        assert!(labels.contains(&"BD · master #1".to_string()), "labels = {:?}", labels);
        assert!(labels.contains(&"BD · master #2".to_string()), "labels = {:?}", labels);
    }

    #[test]
    fn short_repo_initials() {
        assert_eq!(short_repo("BorgDock"), "BD");
        assert_eq!(short_repo("FSP-Horizon"), "FH");
        assert_eq!(short_repo("my_cool_thing"), "MCT");
        assert_eq!(short_repo("BorgDockExtraLongName"), "BDEL");
    }
}
