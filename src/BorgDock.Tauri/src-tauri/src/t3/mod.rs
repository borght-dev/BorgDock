//! T3 Code integration over its orchestration protocol 2.
//!
//! - `hosts`: which T3 server a command talks to, and BorgDock's token for it.
//! - `client`: the transport (HTTP for read models, WebSocket RPC for commands).
//! - `shell`: what a host reports, reduced to what BorgDock shows.
//! - `desktop`: the T3 Code app on this machine (find it, bring it forward).
//! - `commands`: the Tauri commands built on the four above.

pub mod client;
pub mod commands;
pub mod desktop;
pub mod hosts;
pub mod shell;
