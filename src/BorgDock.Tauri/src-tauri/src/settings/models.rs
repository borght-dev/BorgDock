use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
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
    pub ci_failures: CiFailureSettings,
    #[serde(default)]
    pub repo_priority: std::collections::HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workstreams: Option<WorkstreamSettings>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct WorkstreamSettings {
    /// A folder a sync client shares between machines. Absent: this machine only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    /// What this machine is called in a workstream's log. Absent: the computer's name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_label: Option<String>,
    /// Read once by `settings::migrate` (v3), never written: the
    /// `workstream.*` activity categories replaced it.
    #[serde(default, skip_serializing)]
    pub notifications: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
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
#[cfg_attr(test, derive(specta::Type))]
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
    /// Deployments the activity journal follows for this repository.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deployments: Option<RepoDeployments>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct RepoDeployments {
    #[serde(default)]
    pub enabled: bool,
    /// Glob patterns such as `dev`, `*-a`, `acc*`, `prod*`.
    #[serde(default)]
    pub environments: Vec<String>,
}

/// A read-only repository whose worktree list is fetched over SSH.
///
/// Remote repositories deliberately live outside `repos`: those entries feed
/// local checkout, file, editor, and terminal operations, while this list is
/// only an additional source for the worktree palette.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
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
#[cfg_attr(test, derive(specta::Type))]
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
    /// Main-window PR list layout ("comfortable" | "compact").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pr_density: Option<String>,
    /// Collapse every UI transition to instant (adds `.reduce-motion` to <html>).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reduce_motion: Option<bool>,
    /// Focus section layout in the Workbench layout ("list" | "board").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub focus_layout: Option<String>,
    /// Days without an update after which an open PR counts as stale.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stale_after_days: Option<u32>,
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
            windows_terminal_profile: None,
            quick_review_hotkey: String::new(),
            start_minimized_to_tray: false,
            restore_last_selection: true,
            pr_density: None,
            reduce_motion: None,
            focus_layout: None,
            stale_after_days: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct NotificationSettings {
    /// Read once by `settings::migrate` (v3), never written: activity categories replaced it.
    #[serde(default, skip_serializing)]
    pub toast_on_check_status_change: Option<bool>,
    // The TS type spells "PR" as an uppercase acronym; serde's auto camelCase
    // would emit `toastOnNewPr` (lowercase r), which never matches the
    // frontend key. The explicit `rename` keeps both sides in sync; the
    // `alias` lets settings.json files saved before this fix still load.
    #[serde(default, rename = "toastOnNewPR", alias = "toastOnNewPr")]
    pub toast_on_new_pr: bool,
    #[serde(default, skip_serializing)]
    pub toast_on_review_update: Option<bool>,
    #[serde(default, skip_serializing)]
    pub toast_on_mergeable: Option<bool>,
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
    /// A related CI failure reaches `ciFailures.notifyThreshold` PRs with no owner.
    #[serde(default, skip_serializing)]
    pub ci_failure_group_grows: Option<bool>,
    /// The owner of a related CI failure went quiet.
    #[serde(default, skip_serializing)]
    pub ci_failure_owner_stale: Option<bool>,
    /// A related CI failure's fix merged while PRs are still red.
    #[serde(default, skip_serializing)]
    pub ci_failure_fix_merged: Option<bool>,
    /// The activity journal: popups, push and read behaviour per category.
    #[serde(default)]
    pub activity: ActivityNotificationSettings,
}

/// One category's channels. Absent: the category's default.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityCategoryChannels {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub popup: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub push: Option<bool>,
}

/// The phone channel. The webhook URL and token live in the keychain as
/// `borgdock:activity-push`, never here.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityPushSettings {
    #[serde(default)]
    pub enabled: bool,
    /// `home-assistant`; later `ntfy`, `pushover`, `json`.
    #[serde(default = "default_push_preset")]
    pub preset: String,
    /// Push once I have been away from the laptop this long.
    #[serde(default = "default_away_minutes")]
    pub away_minutes: u32,
    /// Send "W3 asks a question" without the item's title.
    #[serde(default)]
    pub hide_titles: bool,
}

fn default_push_preset() -> String {
    "home-assistant".to_string()
}

fn default_away_minutes() -> u32 {
    10
}

impl Default for ActivityPushSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            preset: default_push_preset(),
            away_minutes: default_away_minutes(),
            hide_titles: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ActivityNotificationSettings {
    /// Category id (`agent.question`, `pr.review`, …) to its channels.
    #[serde(default)]
    pub categories: std::collections::BTreeMap<String, ActivityCategoryChannels>,
    /// A visit to a thread in T3 marks its entries read.
    #[serde(default = "default_true")]
    pub seen_in_t3: bool,
    /// Opening a PR, item, workstream or CI group marks its entries read.
    #[serde(default = "default_true")]
    pub mark_read_on_open: bool,
    /// The needs-you count on the taskbar icon.
    #[serde(default = "default_true")]
    pub taskbar_badge: bool,
    #[serde(default)]
    pub push: ActivityPushSettings,
    /// BorgDock for iPhone. The session token lives in the keychain as
    /// `borgdock:phone-link`, never here.
    #[serde(default)]
    pub phone_link: PhoneLinkSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct PhoneLinkSettings {
    #[serde(default = "default_phone_server")]
    pub server_url: String,
    /// Tell the server how long I have been idle, so the phone stays quiet while I'm at my desk.
    #[serde(default = "default_true")]
    pub share_desk: bool,
    /// Send what I read here and mark what I read on the phone.
    #[serde(default = "default_true")]
    pub share_reads: bool,
}

pub const DEFAULT_PHONE_SERVER: &str = "https://gomocha-mac-mini-nl.tail5e171a.ts.net/borgdock";

fn default_phone_server() -> String {
    DEFAULT_PHONE_SERVER.to_string()
}

impl Default for PhoneLinkSettings {
    fn default() -> Self {
        Self {
            server_url: default_phone_server(),
            share_desk: true,
            share_reads: true,
        }
    }
}

impl Default for ActivityNotificationSettings {
    fn default() -> Self {
        Self {
            categories: Default::default(),
            seen_in_t3: true,
            mark_read_on_open: true,
            taskbar_badge: true,
            push: ActivityPushSettings::default(),
            phone_link: PhoneLinkSettings::default(),
        }
    }
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
            toast_on_check_status_change: None,
            toast_on_new_pr: false,
            toast_on_review_update: None,
            toast_on_mergeable: None,
            only_my_prs: false,
            play_merge_sound: true,
            review_nudge_enabled: true,
            review_nudge_interval_minutes: 60,
            review_nudge_escalation: true,
            deduplication_window_seconds: 60,
            channels: NotificationChannels::default(),
            last_test_fired_at: None,
            ci_failure_group_grows: None,
            ci_failure_owner_stale: None,
            ci_failure_fix_merged: None,
            activity: ActivityNotificationSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct NotificationChannels {
    /// Never read; dropped on the next save.
    #[serde(default, skip_serializing)]
    pub tray: Option<bool>,
    #[serde(default, skip_serializing)]
    pub system: Option<bool>,
    #[serde(default = "default_true")]
    pub sound: bool,
    #[serde(default, skip_serializing)]
    pub email_digest: Option<bool>,
}

impl Default for NotificationChannels {
    fn default() -> Self {
        Self {
            tray: None,
            system: None,
            sound: true,
            email_digest: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AgentSettings {
    /// Terminal agent for Fix / Resolve / Monitor: "claude" or "codex".
    #[serde(default = "default_agent_provider")]
    pub default_provider: String,
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
    /// First messages Dispatch starts an agent with; an absent one uses the default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dispatch_prompts: Option<DispatchPrompts>,
    /// When Dispatch's "Sync all" runs by itself. Absent: never.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dispatch_sync_schedule: Option<DispatchSyncSchedule>,
    /// Read once by `settings::migrate` (v3), never written: the `agent.*`
    /// activity categories replaced it.
    #[serde(default, skip_serializing)]
    pub dispatch_notifications: Option<bool>,
    /// T3 servers on other machines that Dispatch follows.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub t3_hosts: Vec<T3HostSettings>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct T3HostSettings {
    pub id: String,
    pub label: String,
    pub base_url: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct DispatchPrompts {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pickup: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub qa: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sync: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suggest: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workstream_review: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workstream_work: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct DispatchSyncSchedule {
    #[serde(default)]
    pub enabled: bool,
    /// Local time of day, `HH:MM`.
    #[serde(default)]
    pub time: String,
    /// Days it runs on, 0 = Sunday.
    #[serde(default)]
    pub weekdays: Vec<u8>,
}

fn default_agent_provider() -> String {
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
            default_post_fix_action: "commitAndNotify".to_string(),
            claude_path: None,
            codex_path: None,
            codex_model: None,
            t3_path: None,
            t3_model: default_t3_model(),
            t3_model_instance: default_t3_model_instance(),
            dispatch_prompts: None,
            dispatch_sync_schedule: None,
            dispatch_notifications: None,
            t3_hosts: Vec::new(),
        }
    }
}

/// Related CI failures: whether evidence is collected and within which limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct CiFailureSettings {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub include_default_branch: bool,
    #[serde(default)]
    pub cross_repo_suggestions: bool,
    #[serde(default = "default_ci_retention_days")]
    pub retention_days: u32,
    #[serde(default = "default_ci_max_log_mib")]
    pub max_log_mib: u32,
    #[serde(default = "default_ci_log_timeout_seconds")]
    pub log_timeout_seconds: u32,
    #[serde(default = "default_ci_daily_evidence_limit")]
    pub daily_evidence_limit: u32,
    #[serde(default = "default_ci_lease_hours")]
    pub lease_hours: u32,
    #[serde(default = "default_ci_notify_threshold")]
    pub notify_threshold: u32,
}

fn default_ci_retention_days() -> u32 {
    30
}
fn default_ci_max_log_mib() -> u32 {
    2
}
fn default_ci_log_timeout_seconds() -> u32 {
    15
}
fn default_ci_daily_evidence_limit() -> u32 {
    300
}
fn default_ci_lease_hours() -> u32 {
    24
}
fn default_ci_notify_threshold() -> u32 {
    3
}

impl Default for CiFailureSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            include_default_branch: true,
            cross_repo_suggestions: false,
            retention_days: default_ci_retention_days(),
            max_log_mib: default_ci_max_log_mib(),
            log_timeout_seconds: default_ci_log_timeout_seconds(),
            daily_evidence_limit: default_ci_daily_evidence_limit(),
            lease_hours: default_ci_lease_hours(),
            notify_threshold: default_ci_notify_threshold(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(test, derive(specta::Type))]
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
#[cfg_attr(test, derive(specta::Type))]
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
#[cfg_attr(test, derive(specta::Type))]
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
#[cfg_attr(test, derive(specta::Type))]
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
#[cfg_attr(test, derive(specta::Type))]
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
#[cfg_attr(test, derive(specta::Type))]
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
#[cfg_attr(test, derive(specta::Type))]
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
        assert!(s.notifications.channels.sound);
        assert!(s.notifications.activity.seen_in_t3);
        assert!(!s.notifications.activity.push.enabled);
        assert!(s.notifications.last_test_fired_at.is_none());
        assert!(s.remote_worktree_repos.is_empty());
    }

    #[test]
    fn round_trip_preserves_new_fields() {
        let mut s = AppSettings::default();
        s.azure_dev_ops.link_match_by = "both".to_string();
        s.ui.quick_review_hotkey = "Ctrl+Alt+R".to_string();
        s.ui.start_minimized_to_tray = true;
        s.ui.reduce_motion = Some(true);
        s.ui.focus_layout = Some("board".to_string());
        s.ui.stale_after_days = Some(10);
        s.notifications.channels.sound = false;
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
        assert_eq!(back.ui.reduce_motion, Some(true));
        assert!(json.contains("\"reduceMotion\":true"));
        // The Workbench flag is gone since 3.0.0; it is never written back.
        assert!(!json.contains("layoutV3"));
        assert_eq!(back.ui.focus_layout.as_deref(), Some("board"));
        assert_eq!(back.ui.stale_after_days, Some(10));
        assert!(json.contains("\"focusLayout\":\"board\""));
        assert!(json.contains("\"staleAfterDays\":10"));
        assert!(!back.notifications.channels.sound);
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
    fn legacy_layout_v3_key_is_ignored() {
        // Settings saved by 2.x carry `ui.layoutV3` (the Workbench opt-in,
        // removed at the 3.0.0 cutover). They still load, and the key is
        // dropped on the next save.
        let s: AppSettings =
            serde_json::from_str(r#"{"ui":{"layoutV3":true,"focusLayout":"board"}}"#).unwrap();
        assert_eq!(s.ui.focus_layout.as_deref(), Some("board"));
        let json = serde_json::to_string(&s).unwrap();
        assert!(!json.contains("layoutV3"));
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
        assert!(json["notifications"]["channels"]["sound"]
            .as_bool()
            .unwrap());
        assert!(json["notifications"]["activity"]["seenInT3"]
            .as_bool()
            .unwrap());
    }

    #[test]
    fn agent_and_summary_defaults_are_current() {
        let s: AppSettings = serde_json::from_str("{}").unwrap();
        assert_eq!(s.agents.default_provider, "claude");
        assert_eq!(s.agents.t3_model_instance, "claudeAgent");
        assert_eq!(s.summaries.provider, "claude");
        assert_eq!(s.summaries.model, "sonnet");
        assert!(s.summaries.enabled);
    }
}
