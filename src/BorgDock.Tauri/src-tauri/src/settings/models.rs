use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// Bumped by `settings::migrate` after each one-off migration has run.
    /// See `settings::CURRENT_SCHEMA_VERSION`.
    #[serde(default)]
    pub schema_version: u32,
    #[serde(default)]
    pub setup_complete: bool,
    #[serde(default)]
    pub git_hub: GitHubSettings,
    #[serde(default)]
    pub repos: Vec<RepoSettings>,
    #[serde(default)]
    pub remote_worktree_repos: Vec<RemoteWorktreeRepoSettings>,
    #[serde(default, rename = "ui")]
    pub ui: UiSettings,
    #[serde(default)]
    pub notifications: NotificationSettings,
    #[serde(default)]
    pub agents: AgentSettings,
    #[serde(default)]
    pub summaries: SummarySettings,
    #[serde(default)]
    pub claude_review: ClaudeReviewSettings,
    #[serde(default)]
    pub updates: UpdateSettings,
    #[serde(default)]
    pub pr_detail: PrDetailSettings,
    #[serde(default)]
    pub azure_dev_ops: AzureDevOpsSettings,
    #[serde(default)]
    pub sql: SqlSettings,
    #[serde(default)]
    pub repo_priority: std::collections::HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_palette_roots: Option<Vec<FilePaletteRoot>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePaletteRoot {
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
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
    /// GitHub CLI login used for this repository. Missing/empty preserves the
    /// historic active-account behaviour.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub github_account: Option<String>,
}

/// A read-only repository whose worktree list is fetched over SSH.
///
/// Remote repositories deliberately live outside `repos`: those entries feed
/// local checkout, file, editor, and terminal operations, while this list is
/// only an additional source for the worktree palette.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteWorktreeRepoSettings {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub owner: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub ssh_target: String,
    #[serde(default)]
    pub identity_file: String,
    #[serde(default)]
    pub base_path: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
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
    pub file_palette_active_root_path: Option<String>,
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
    #[serde(default)]
    pub quick_review_hotkey: String,
    #[serde(default)]
    pub start_minimized_to_tray: bool,
    #[serde(default = "default_true")]
    pub restore_last_selection: bool,
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
            theme: "system".to_string(),
            global_hotkey: "Ctrl+Win+Shift+G".to_string(),
            flyout_hotkey: "Ctrl+Win+Shift+F".to_string(),
            editor_command: "code".to_string(),
            run_at_startup: false,
            worktree_palette_favorites_only: false,
            file_palette_favorites_only: false,
            file_palette_roots_collapsed: false,
            file_palette_active_root_path: None,
            file_palette_changes_collapsed: None,
            file_palette_changes_mode: None,
            file_palette_scope: None,
            file_viewer_default_view_mode: None,
            windows_terminal_profile: None,
            quick_review_hotkey: String::new(),
            start_minimized_to_tray: false,
            restore_last_selection: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationSettings {
    #[serde(default = "default_true")]
    pub toast_on_check_status_change: bool,
    // The TS type spells "PR" as an uppercase acronym; serde's auto camelCase
    // would emit `toastOnNewPr` (lowercase r), which never matches the
    // frontend key. The explicit `rename` keeps both sides in sync; the
    // `alias` lets settings.json files saved before this fix still load.
    #[serde(default, rename = "toastOnNewPR", alias = "toastOnNewPr")]
    pub toast_on_new_pr: bool,
    #[serde(default = "default_true")]
    pub toast_on_review_update: bool,
    #[serde(default = "default_true")]
    pub toast_on_mergeable: bool,
    #[serde(default, rename = "onlyMyPRs", alias = "onlyMyPrs")]
    pub only_my_prs: bool,
    #[serde(default = "default_true")]
    pub play_merge_sound: bool,
    #[serde(default = "default_true")]
    pub review_nudge_enabled: bool,
    #[serde(default = "default_nudge_interval")]
    pub review_nudge_interval_minutes: u32,
    #[serde(default = "default_true")]
    pub review_nudge_escalation: bool,
    #[serde(default = "default_dedup_window")]
    pub deduplication_window_seconds: u32,
    #[serde(default)]
    pub channels: NotificationChannels,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_test_fired_at: Option<i64>,
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
            play_merge_sound: true,
            review_nudge_enabled: true,
            review_nudge_interval_minutes: 60,
            review_nudge_escalation: true,
            deduplication_window_seconds: 60,
            channels: NotificationChannels::default(),
            last_test_fired_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationChannels {
    #[serde(default = "default_true")]
    pub tray: bool,
    #[serde(default = "default_true")]
    pub system: bool,
    #[serde(default = "default_true")]
    pub sound: bool,
    #[serde(default)]
    pub email_digest: bool,
}

impl Default for NotificationChannels {
    fn default() -> Self {
        Self {
            tray: true,
            system: true,
            sound: true,
            email_digest: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSettings {
    #[serde(default = "default_agent_provider")]
    pub default_provider: String,
    #[serde(default = "default_fallback_provider")]
    pub fallback_provider: String,
    #[serde(default = "default_post_fix_action")]
    pub default_post_fix_action: String,
    pub claude_path: Option<String>,
    pub codex_path: Option<String>,
    pub codex_model: Option<String>,
    pub t3_path: Option<String>,
    #[serde(default = "default_t3_model")]
    pub t3_model: String,
    #[serde(default = "default_t3_model_instance")]
    pub t3_model_instance: String,
}

fn default_agent_provider() -> String {
    "t3".to_string()
}
fn default_fallback_provider() -> String {
    "claude".to_string()
}
fn default_t3_model() -> String {
    "claude-fable-5".to_string()
}
fn default_t3_model_instance() -> String {
    "claudeAgent".to_string()
}

fn default_post_fix_action() -> String {
    "commitAndNotify".to_string()
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            default_provider: default_agent_provider(),
            fallback_provider: default_fallback_provider(),
            default_post_fix_action: "commitAndNotify".to_string(),
            claude_path: None,
            codex_path: None,
            codex_model: None,
            t3_path: None,
            t3_model: default_t3_model(),
            t3_model_instance: default_t3_model_instance(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummarySettings {
    #[serde(default = "default_summary_provider")]
    pub provider: String,
    #[serde(default = "default_summary_model")]
    pub model: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_summary_provider() -> String {
    "claude".to_string()
}
fn default_summary_model() -> String {
    "sonnet".to_string()
}

impl Default for SummarySettings {
    fn default() -> Self {
        Self {
            provider: default_summary_provider(),
            model: default_summary_model(),
            enabled: true,
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
    #[serde(default = "default_link_match_by")]
    pub link_match_by: String,
    #[serde(default = "default_true")]
    pub show_work_item_state_on_pr_card: bool,
    #[serde(default)]
    pub update_pr_status_when_wi_done: bool,
}

fn default_link_match_by() -> String {
    "branch".to_string()
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
            link_match_by: "branch".to_string(),
            show_work_item_state_on_pr_card: true,
            update_pr_status_when_wi_done: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlSettings {
    #[serde(default)]
    pub connections: Vec<SqlServerConnection>,
    pub last_used_connection: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_connection_name: Option<String>,
    #[serde(default = "default_true")]
    pub read_only_by_default: bool,
    #[serde(default = "default_true")]
    pub confirm_destructive_without_where: bool,
}

impl Default for SqlSettings {
    fn default() -> Self {
        Self {
            connections: Vec::new(),
            last_used_connection: None,
            default_connection_name: None,
            read_only_by_default: true,
            confirm_destructive_without_where: true,
        }
    }
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

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrDetailSettings {}

#[cfg(test)]
mod redesign_field_tests {
    use super::*;

    #[test]
    fn missing_fields_get_defaults() {
        let s: AppSettings = serde_json::from_str("{}").expect("empty object should parse");
        assert_eq!(s.azure_dev_ops.link_match_by, "branch");
        assert!(s.azure_dev_ops.show_work_item_state_on_pr_card);
        assert!(!s.azure_dev_ops.update_pr_status_when_wi_done);
        assert_eq!(s.ui.quick_review_hotkey, "");
        assert!(!s.ui.start_minimized_to_tray);
        assert!(s.ui.restore_last_selection);
        assert!(s.sql.default_connection_name.is_none());
        assert!(s.sql.read_only_by_default);
        assert!(s.sql.confirm_destructive_without_where);
        assert!(s.notifications.channels.tray);
        assert!(s.notifications.channels.system);
        assert!(s.notifications.channels.sound);
        assert!(!s.notifications.channels.email_digest);
        assert!(s.notifications.last_test_fired_at.is_none());
        assert!(s.remote_worktree_repos.is_empty());
    }

    #[test]
    fn round_trip_preserves_new_fields() {
        let mut s = AppSettings::default();
        s.azure_dev_ops.link_match_by = "both".to_string();
        s.ui.quick_review_hotkey = "Ctrl+Alt+R".to_string();
        s.ui.start_minimized_to_tray = true;
        s.notifications.channels.email_digest = true;
        s.remote_worktree_repos.push(RemoteWorktreeRepoSettings {
            id: "mac-fsp".to_string(),
            label: "Mac mini".to_string(),
            owner: "Gomocha-FSP".to_string(),
            name: "fsp-horizon".to_string(),
            ssh_target: "koen@example.test".to_string(),
            identity_file: "C:/Users/koen/.ssh/id_ed25519".to_string(),
            base_path: "/Users/koen/Dev/fsp-horizon".to_string(),
            enabled: true,
            favorite_worktree_paths: vec![
                "/Users/koen/Dev/fsp-horizon/.worktrees/feature-a".to_string()
            ],
        });
        let json = serde_json::to_string(&s).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.azure_dev_ops.link_match_by, "both");
        assert_eq!(back.ui.quick_review_hotkey, "Ctrl+Alt+R");
        assert!(back.ui.start_minimized_to_tray);
        assert!(back.notifications.channels.email_digest);
        assert_eq!(back.remote_worktree_repos.len(), 1);
        assert_eq!(
            back.remote_worktree_repos[0].ssh_target,
            "koen@example.test"
        );
        assert_eq!(
            back.remote_worktree_repos[0].favorite_worktree_paths.len(),
            1
        );
    }

    #[test]
    fn remote_repo_without_favorites_defaults_to_empty() {
        let remote: RemoteWorktreeRepoSettings = serde_json::from_str(
            r#"{"id":"mac-fsp","sshTarget":"koen@example.test","basePath":"/repo"}"#,
        )
        .unwrap();

        assert!(remote.favorite_worktree_paths.is_empty());
    }

    #[test]
    fn camel_case_serialization() {
        let s = AppSettings::default();
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["azureDevOps"]["linkMatchBy"], "branch");
        assert!(json["azureDevOps"]["showWorkItemStateOnPrCard"]
            .as_bool()
            .unwrap());
        assert_eq!(json["ui"]["quickReviewHotkey"], "");
        assert!(json["sql"]["readOnlyByDefault"].as_bool().unwrap());
        assert!(json["notifications"]["channels"]["tray"].as_bool().unwrap());
    }

    #[test]
    fn agent_and_summary_defaults_are_current() {
        let s: AppSettings = serde_json::from_str("{}").unwrap();
        assert_eq!(s.agents.default_provider, "t3");
        assert_eq!(s.agents.fallback_provider, "claude");
        assert_eq!(s.summaries.provider, "claude");
        assert_eq!(s.summaries.model, "sonnet");
        assert!(s.summaries.enabled);
    }
}
