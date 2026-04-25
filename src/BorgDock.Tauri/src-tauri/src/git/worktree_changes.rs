use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub previous_path: Option<String>,
    pub status: FileChangeStatus,
    pub additions: u32,
    pub deletions: u32,
    pub is_binary: bool,
    pub is_submodule: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileChangeStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Untracked,
    Submodule,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeChangeSet {
    pub vs_head: Vec<FileChange>,
    pub vs_base: Vec<FileChange>,
    pub base_branch: String,
    pub base_branch_source: BaseBranchSource,
    pub detached_head: bool,
    pub merge_base_unavailable: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BaseBranchSource {
    OriginHead,
    InitDefault,
    FallbackMain,
    FallbackMaster,
    Unknown,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedDiff {
    pub file_path: String,
    pub previous_path: Option<String>,
    pub hunks: Vec<DiffHunk>,
    pub binary: Option<BinaryMarker>,
    pub is_submodule: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub header: String,
    pub old_start: u32,
    pub old_count: u32,
    pub new_start: u32,
    pub new_count: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub content: String,
    pub old_line_number: Option<u32>,
    pub new_line_number: Option<u32>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiffLineKind {
    Add,
    Delete,
    Context,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BinaryMarker {
    pub old_size: Option<u64>,
    pub new_size: Option<u64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_change_serializes_with_camelcase_keys() {
        let fc = FileChange {
            path: "a.rs".into(),
            previous_path: None,
            status: FileChangeStatus::Modified,
            additions: 1,
            deletions: 2,
            is_binary: false,
            is_submodule: false,
        };
        let json = serde_json::to_string(&fc).unwrap();
        assert!(json.contains("\"previousPath\":null"));
        assert!(json.contains("\"isBinary\":false"));
        assert!(json.contains("\"status\":\"modified\""));
    }
}
