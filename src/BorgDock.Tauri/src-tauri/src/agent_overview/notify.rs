use crate::agent_overview::types::{SessionRecord, SessionState};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct NotifyTracker {
    /// session.id → (first-fire?, escalate-fire?)
    fires: HashMap<String, (bool, bool)>,
}

#[derive(Debug)]
pub enum NotifyAction {
    None,
    Toast {
        session_id: String,
        repo: String,
        worktree: String,
        since_ms: u128,
        escalation: bool,
    },
}

impl NotifyTracker {
    pub fn evaluate(
        &mut self,
        records: &[SessionRecord],
        first_threshold: Duration,
        escalate_threshold: Duration,
        now: Instant,
    ) -> Vec<NotifyAction> {
        let mut out = Vec::new();
        for r in records {
            if r.state != SessionState::Awaiting {
                self.fires.remove(&r.session_id);
                continue;
            }
            let in_state = now.saturating_duration_since(r.state_since);
            let entry = self.fires.entry(r.session_id.clone()).or_insert((false, false));
            if !entry.0 && in_state >= first_threshold {
                entry.0 = true;
                out.push(NotifyAction::Toast {
                    session_id: r.session_id.clone(),
                    repo: r.repo.clone(),
                    worktree: r.worktree.clone(),
                    since_ms: in_state.as_millis(),
                    escalation: false,
                });
            } else if entry.0 && !entry.1 && in_state >= escalate_threshold {
                entry.1 = true;
                out.push(NotifyAction::Toast {
                    session_id: r.session_id.clone(),
                    repo: r.repo.clone(),
                    worktree: r.worktree.clone(),
                    since_ms: in_state.as_millis(),
                    escalation: true,
                });
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::path::PathBuf;

    fn rec(id: &str, state_since_ago: Duration, state: SessionState) -> SessionRecord {
        let now = Instant::now();
        SessionRecord {
            session_id: id.into(),
            cwd: PathBuf::from("/x"),
            repo: "BD".into(),
            worktree: "master".into(),
            branch: "master".into(),
            label: format!("BD · master #{id}"),
            state,
            state_since: now - state_since_ago,
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
    }

    #[test]
    fn fires_first_then_escalate_then_silent() {
        let mut t = NotifyTracker::default();
        let now = Instant::now();
        let r = rec("a", Duration::from_secs(31), SessionState::Awaiting);
        let out = t.evaluate(&[r.clone()], Duration::from_secs(30), Duration::from_secs(120), now);
        assert!(matches!(out[0], NotifyAction::Toast { escalation: false, .. }));

        let r2 = rec("a", Duration::from_secs(40), SessionState::Awaiting);
        let out = t.evaluate(&[r2], Duration::from_secs(30), Duration::from_secs(120), now);
        assert!(out.is_empty());

        let r3 = rec("a", Duration::from_secs(121), SessionState::Awaiting);
        let out = t.evaluate(&[r3], Duration::from_secs(30), Duration::from_secs(120), now);
        assert!(matches!(out[0], NotifyAction::Toast { escalation: true, .. }));
    }
}
