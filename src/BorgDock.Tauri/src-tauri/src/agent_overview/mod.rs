//! Agent Overview — live dashboard of Claude Code sessions, fed by an
//! embedded OTLP log/event receiver. See spec at
//! `docs/superpowers/specs/2026-04-30-agent-overview-design.md`.

pub mod bootstrap;
pub mod commands;
pub mod cwd_resolver;
pub mod meta_store;
pub mod models;
pub mod notify;
pub mod otlp_server;
pub mod settings_merge;
pub mod state;
pub mod store;
pub mod types;
pub mod window;

pub use commands::{
    dismiss_agent_session, disable_agent_overview_telemetry, focus_session_pane,
    list_agent_sessions, mark_agent_session_seen, set_agent_overview_enabled,
    snooze_agent_session, AgentDeltaSender,
};
pub use window::open_agent_overview_window;
