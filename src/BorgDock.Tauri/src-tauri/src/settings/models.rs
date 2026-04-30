use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub setup_complete: bool,
    #[serde(default)]
    pub git_hub: GitHubSettings,
    #[serde(default)]
    pub repos: Vec<RepoSettings>,
    #[serde(default, rename = "ui")]
    pub ui: UiSettings,
    #[serde(default)]
    pub notifications: NotificationSettings,
    #[serde(default)]
    pub claude_code: ClaudeCodeSettings,
    #[serde(default)]
    pub claude_review: ClaudeReviewSettings,
    #[serde(default)]
    pub updates: UpdateSettings,
    #[serde(default)]
    pub agent_overview: AgentOverviewSettings,
    #[serde(default)]
    pub azure_dev_ops: AzureDevOpsSettings,
    #[serde(default)]
    pub sql: SqlSettings,
    #[serde(default)]
    pub claude_api: ClaudeApiSettings,
    #[serde(default)]
    pub repo_priority: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubSettings {
    #[serde(default = "default_gh_cli")]
    pub auth_method: String,
    #[serde(skip_serializing)]
    pub personal_access_token: Option<String>,
    #[serde(default = "default_poll_interval")]
    pub poll_interval_seconds: u32,
    #[serde(default)]
    pub username: String,
}

fn default_gh_cli() -> String {
    "ghCli".to_string()
}

fn default_poll_interval() -> u32 {
    60
}

impl Default for GitHubSettings {
    fn default() -> Self {
        Self {
            auth_method: "ghCli".to_string(),
            personal_access_token: None,
            poll_interval_seconds: 60,
            username: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoSettings {
    #[serde(default)]
    pub owner: String,
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub worktree_base_path: String,
    #[serde(default = "default_worktree_subfolder")]
    pub worktree_subfolder: String,
    pub fix_prompt_template: Option<String>,
    #[serde(default)]
    pub favorite_worktree_paths: Vec<String>,
}

fn default_true() -> bool {
    true
}

fn default_worktree_subfolder() -> String {
    ".worktrees".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSettings {
    #[serde(default = "default_sidebar_edge")]
    pub sidebar_edge: String,
    #[serde(default = "default_sidebar_mode")]
    pub sidebar_mode: String,
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width_px: u32,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_global_hotkey")]
    pub global_hotkey: String,
    #[serde(default = "default_flyout_hotkey")]
    pub flyout_hotkey: String,
    #[serde(default = "default_editor_command")]
    pub editor_command: String,
    #[serde(default)]
    pub run_at_startup: bool,
    #[serde(default)]
    pub worktree_palette_favorites_only: bool,
    #[serde(default)]
    pub file_palette_favorites_only: bool,
    #[serde(default)]
    pub file_palette_roots_collapsed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_palette_changes_collapsed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_palette_changes_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_palette_scope: Option<String>,
    /// Remembered diff layout for file-viewer windows ("unified" | "split").
    /// Users pick this via the Split/Unified toolbar or Ctrl+Shift+M; the
    /// next viewer window opens in the same layout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_viewer_default_view_mode: Option<String>,
    /// Override for the Windows Terminal profile used when launching "Claude"
    /// or similar wt-based shells. Empty/None = auto-detect from wt settings.json.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub windows_terminal_profile: Option<String>,
}

fn default_sidebar_edge() -> String {
    "right".to_string()
}

fn default_sidebar_mode() -> String {
    "pinned".to_string()
}

fn default_sidebar_width() -> u32 {
    800
}

fn default_theme() -> String {
    "system".to_string()
}

fn default_global_hotkey() -> String {
    "Ctrl+Win+Shift+G".to_string()
}

fn default_flyout_hotkey() -> String {
    "Ctrl+Win+Shift+F".to_string()
}

fn default_editor_command() -> String {
    "code".to_string()
}


impl Default for UiSettings {
    fn default() -> Self {
        Self {
            sidebar_edge: "right".to_string(),
            sidebar_mode: "pinned".to_string(),
            sidebar_width_px: 800,
            theme: "system".to_string(),
            global_hotkey: "Ctrl+Win+Shift+G".to_string(),
            flyout_hotkey: "Ctrl+Win+Shift+F".to_string(),
            editor_command: "code".to_string(),
            run_at_startup: false,
            worktree_palette_favorites_only: false,
            file_palette_favorites_only: false,
            file_palette_roots_collapsed: false,
            file_palette_changes_collapsed: None,
            file_palette_changes_mode: None,
            file_palette_scope: None,
            file_viewer_default_view_mode: None,
            windows_terminal_profile: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSettings {
    #[serde(default = "default_true")]
    pub toast_on_check_status_change: bool,
    #[serde(default)]
    pub toast_on_new_pr: bool,
    #[serde(default = "default_true")]
    pub toast_on_review_update: bool,
    #[serde(default = "default_true")]
    pub toast_on_mergeable: bool,
    #[serde(default)]
    pub only_my_prs: bool,
    #[serde(default = "default_true")]
    pub review_nudge_enabled: bool,
    #[serde(default = "default_nudge_interval")]
    pub review_nudge_interval_minutes: u32,
    #[serde(default = "default_true")]
    pub review_nudge_escalation: bool,
    #[serde(default = "default_dedup_window")]
    pub deduplication_window_seconds: u32,
}

fn default_nudge_interval() -> u32 {
    60
}

fn default_dedup_window() -> u32 {
    60
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            toast_on_check_status_change: true,
            toast_on_new_pr: false,
            toast_on_review_update: true,
            toast_on_mergeable: true,
            only_my_prs: false,
            review_nudge_enabled: true,
            review_nudge_interval_minutes: 60,
            review_nudge_escalation: true,
            deduplication_window_seconds: 60,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCodeSettings {
    #[serde(default = "default_post_fix_action")]
    pub default_post_fix_action: String,
    pub claude_code_path: Option<String>,
}

fn default_post_fix_action() -> String {
    "commitAndNotify".to_string()
}

impl Default for ClaudeCodeSettings {
    fn default() -> Self {
        Self {
            default_post_fix_action: "commitAndNotify".to_string(),
            claude_code_path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeApiSettings {
    #[serde(skip_serializing)]
    pub api_key: Option<String>,
    #[serde(default = "default_claude_model")]
    pub model: String,
    #[serde(default = "default_claude_max_tokens")]
    pub max_tokens: u32,
}

fn default_claude_model() -> String {
    "claude-sonnet-4-6".to_string()
}

fn default_claude_max_tokens() -> u32 {
    1024
}

impl Default for ClaudeApiSettings {
    fn default() -> Self {
        Self {
            api_key: None,
            model: "claude-sonnet-4-6".to_string(),
            max_tokens: 1024,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeReviewSettings {
    #[serde(default = "default_bot_username")]
    pub bot_username: String,
}

fn default_bot_username() -> String {
    "claude[bot]".to_string()
}

impl Default for ClaudeReviewSettings {
    fn default() -> Self {
        Self {
            bot_username: "claude[bot]".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettings {
    #[serde(default = "default_true")]
    pub auto_check_enabled: bool,
    #[serde(default = "default_true")]
    pub auto_download: bool,
}

impl Default for UpdateSettings {
    fn default() -> Self {
        Self {
            auto_check_enabled: true,
            auto_download: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureDevOpsSettings {
    #[serde(default)]
    pub organization: String,
    #[serde(default)]
    pub project: String,
    #[serde(default = "default_ado_auth_method")]
    pub auth_method: String,
    #[serde(default)]
    pub auth_auto_detected: bool,
    #[serde(skip_serializing)]
    pub personal_access_token: Option<String>,
    #[serde(default = "default_ado_poll_interval")]
    pub poll_interval_seconds: u32,
    #[serde(default)]
    pub favorite_query_ids: Vec<String>,
    pub last_selected_query_id: Option<String>,
    #[serde(default)]
    pub tracked_work_item_ids: Vec<i32>,
    #[serde(default)]
    pub working_on_work_item_ids: Vec<i32>,
    #[serde(default)]
    pub work_item_worktree_paths: std::collections::HashMap<i32, String>,
    #[serde(default)]
    pub recent_work_item_ids: Vec<i32>,
}

fn default_ado_auth_method() -> String {
    "azCli".to_string()
}

fn default_ado_poll_interval() -> u32 {
    120
}

impl Default for AzureDevOpsSettings {
    fn default() -> Self {
        Self {
            organization: String::new(),
            project: String::new(),
            auth_method: default_ado_auth_method(),
            auth_auto_detected: false,
            personal_access_token: None,
            poll_interval_seconds: 120,
            favorite_query_ids: Vec::new(),
            last_selected_query_id: None,
            tracked_work_item_ids: Vec::new(),
            working_on_work_item_ids: Vec::new(),
            work_item_worktree_paths: std::collections::HashMap::new(),
            recent_work_item_ids: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlSettings {
    #[serde(default)]
    pub connections: Vec<SqlServerConnection>,
    pub last_used_connection: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlServerConnection {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub server: String,
    #[serde(default = "default_sql_port")]
    pub port: u16,
    #[serde(default)]
    pub database: String,
    #[serde(default = "default_sql_auth")]
    pub authentication: String,
    pub username: Option<String>,
    #[serde(skip_serializing)]
    pub password: Option<String>,
    #[serde(default = "default_true")]
    pub trust_server_certificate: bool,
}

fn default_sql_port() -> u16 {
    1433
}

fn default_sql_auth() -> String {
    "windows".to_string()
}

impl Default for SqlServerConnection {
    fn default() -> Self {
        Self {
            name: String::new(),
            server: String::new(),
            port: 1433,
            database: String::new(),
            authentication: "windows".to_string(),
            username: None,
            password: None,
            trust_server_certificate: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOverviewSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub auto_open_on_startup: bool,
    #[serde(default)]
    pub window_state: Option<WindowGeometry>,
    #[serde(default)]
    pub repo_short_names: std::collections::HashMap<String, String>,
    #[serde(default = "default_notify_after")]
    pub awaiting_notify_after_seconds: u32,
    #[serde(default = "default_notify_escalate")]
    pub awaiting_notify_escalate_seconds: u32,
    #[serde(default = "default_idle_threshold")]
    pub idle_threshold_seconds: u32,
    #[serde(default = "default_ended_threshold")]
    pub ended_threshold_seconds: u32,
    #[serde(default = "default_history_retention")]
    pub history_retention_seconds: u32,
    #[serde(default = "default_export_interval")]
    pub otel_export_interval_ms: u32,
}

fn default_notify_after() -> u32 { 30 }
fn default_notify_escalate() -> u32 { 120 }
fn default_idle_threshold() -> u32 { 300 }
fn default_ended_threshold() -> u32 { 1800 }
fn default_history_retention() -> u32 { 14_400 }
fn default_export_interval() -> u32 { 2000 }

impl Default for AgentOverviewSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            auto_open_on_startup: false,
            window_state: None,
            repo_short_names: std::collections::HashMap::new(),
            awaiting_notify_after_seconds: default_notify_after(),
            awaiting_notify_escalate_seconds: default_notify_escalate(),
            idle_threshold_seconds: default_idle_threshold(),
            ended_threshold_seconds: default_ended_threshold(),
            history_retention_seconds: default_history_retention(),
            otel_export_interval_ms: default_export_interval(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[cfg(test)]
mod agent_overview_settings_tests {
    use super::*;

    #[test]
    fn defaults_serialize_to_camel_case() {
        let s: AgentOverviewSettings = Default::default();
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["enabled"], false);
        assert_eq!(json["autoOpenOnStartup"], false);
        assert_eq!(json["awaitingNotifyAfterSeconds"], 30);
        assert_eq!(json["historyRetentionSeconds"], 14400);
    }

    #[test]
    fn round_trips_with_overrides() {
        let json = serde_json::json!({
            "enabled": true,
            "awaitingNotifyAfterSeconds": 45,
            "repoShortNames": { "FSP-Horizon": "FH" }
        });
        let s: AgentOverviewSettings = serde_json::from_value(json).unwrap();
        assert!(s.enabled);
        assert_eq!(s.awaiting_notify_after_seconds, 45);
        assert_eq!(s.repo_short_names.get("FSP-Horizon").unwrap(), "FH");
    }
}
