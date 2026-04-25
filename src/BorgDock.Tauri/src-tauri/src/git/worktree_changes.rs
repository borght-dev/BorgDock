use git2::Repository;
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

/// Resolve the base branch using the documented fallback chain.
/// Order: origin/HEAD symbolic ref → repo config init.defaultBranch →
/// local `main` if it exists → `master` (last resort, even if absent).
pub fn resolve_base_branch(repo: &Repository) -> Result<(String, BaseBranchSource), String> {
    // 1. origin/HEAD symbolic ref.
    if let Ok(reference) = repo.find_reference("refs/remotes/origin/HEAD") {
        if let Some(target) = reference.symbolic_target() {
            if let Some(short) = target.strip_prefix("refs/remotes/origin/") {
                return Ok((short.to_string(), BaseBranchSource::OriginHead));
            }
        }
    }

    // 2. repo-level `init.defaultBranch`.
    if let Ok(cfg) = repo.config() {
        if let Ok(name) = cfg.get_string("init.defaultBranch") {
            let trimmed = name.trim();
            if !trimmed.is_empty() {
                return Ok((trimmed.to_string(), BaseBranchSource::InitDefault));
            }
        }
    }

    // 3. Local `main` if present.
    if repo.find_branch("main", git2::BranchType::Local).is_ok() {
        return Ok(("main".into(), BaseBranchSource::FallbackMain));
    }

    // 4. Hard fallback: master, even if it doesn't exist (caller will surface
    //    `merge_base_unavailable: true` when no merge-base resolves).
    Ok(("master".into(), BaseBranchSource::FallbackMaster))
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

    use git2::Repository;
    use tempfile::TempDir;

    fn init_bare_repo(tmp: &TempDir) -> Repository {
        Repository::init(tmp.path()).expect("init repo")
    }

    // Helper used by multiple tests below.
    pub(crate) fn create_orphan_branch(repo: &Repository, name: &str) {
        let sig = git2::Signature::now("t", "t@t").unwrap();
        let tree_oid = {
            let mut idx = repo.index().unwrap();
            idx.write_tree().unwrap()
        };
        let tree = repo.find_tree(tree_oid).unwrap();
        repo.commit(
            Some(&format!("refs/heads/{name}")),
            &sig,
            &sig,
            "init",
            &tree,
            &[],
        ).unwrap();
    }

    #[test]
    fn base_branch_falls_back_to_master_when_nothing_else_resolves() {
        let tmp = TempDir::new().unwrap();
        let repo = init_bare_repo(&tmp);
        // No commits, no remote, no init.defaultBranch — fallback should be master.
        let (name, source) = resolve_base_branch(&repo).unwrap();
        assert_eq!(name, "master");
        assert!(matches!(source, BaseBranchSource::FallbackMaster));
    }

    #[test]
    fn base_branch_uses_init_default_branch_when_set() {
        let tmp = TempDir::new().unwrap();
        let repo = init_bare_repo(&tmp);
        repo.config().unwrap().set_str("init.defaultBranch", "trunk").unwrap();
        let (name, source) = resolve_base_branch(&repo).unwrap();
        assert_eq!(name, "trunk");
        assert!(matches!(source, BaseBranchSource::InitDefault));
    }

    #[test]
    fn base_branch_prefers_origin_head_over_init_default() {
        let tmp = TempDir::new().unwrap();
        let repo = init_bare_repo(&tmp);
        repo.config().unwrap().set_str("init.defaultBranch", "trunk").unwrap();
        // Simulate `origin/HEAD -> origin/develop` by writing the symbolic ref directly.
        repo.reference_symbolic(
            "refs/remotes/origin/HEAD",
            "refs/remotes/origin/develop",
            true,
            "test setup",
        ).unwrap();
        let (name, source) = resolve_base_branch(&repo).unwrap();
        assert_eq!(name, "develop");
        assert!(matches!(source, BaseBranchSource::OriginHead));
    }

    #[test]
    fn base_branch_falls_back_to_main_when_only_main_branch_exists() {
        let tmp = TempDir::new().unwrap();
        let repo = init_bare_repo(&tmp);
        create_orphan_branch(&repo, "main");
        let (name, source) = resolve_base_branch(&repo).unwrap();
        assert_eq!(name, "main");
        assert!(matches!(source, BaseBranchSource::FallbackMain));
    }
}
