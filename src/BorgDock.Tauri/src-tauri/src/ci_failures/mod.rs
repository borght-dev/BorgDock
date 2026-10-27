//! Evidence for related CI failures: the bounded job-log read, extraction and
//! sanitization. Raw logs stay in this module; only sanitized signals cross
//! IPC.

pub mod commands;
pub mod extract;
mod log;
pub mod sanitize;
pub mod signal;
pub mod store;
