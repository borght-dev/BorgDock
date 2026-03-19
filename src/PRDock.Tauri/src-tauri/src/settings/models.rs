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
    pub azure_dev_ops: AzureDevOpsSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubSettings {
    #[serde(default = "default_gh_cli")]
    pub auth_method: String,
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
    #[serde(default = "default_editor_command")]
    pub editor_command: String,
    #[serde(default)]
    pub run_at_startup: bool,
    #[serde(default = "default_badge_style")]
    pub badge_style: String,
    #[serde(default = "default_indicator_style")]
    pub indicator_style: String,
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

fn default_editor_command() -> String {
    "code".to_string()
}

fn default_badge_style() -> String {
    "GlassCapsule".to_string()
}

fn default_indicator_style() -> String {
    "SegmentRing".to_string()
}

impl Default for UiSettings {
    fn default() -> Self {
        Self {
            sidebar_edge: "right".to_string(),
            sidebar_mode: "pinned".to_string(),
            sidebar_width_px: 800,
            theme: "system".to_string(),
            global_hotkey: "Ctrl+Win+Shift+G".to_string(),
            editor_command: "code".to_string(),
            run_at_startup: false,
            badge_style: "GlassCapsule".to_string(),
            indicator_style: "SegmentRing".to_string(),
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
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self {
            toast_on_check_status_change: true,
            toast_on_new_pr: false,
            toast_on_review_update: true,
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

fn default_ado_poll_interval() -> u32 {
    120
}

impl Default for AzureDevOpsSettings {
    fn default() -> Self {
        Self {
            organization: String::new(),
            project: String::new(),
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
