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

/// Inner sync implementation — returned to callers via the async tauri command
/// in `list_worktree_changes`. Split out so it's straightforward to unit-test
/// without spinning up a tokio runtime.
pub fn list_worktree_changes_inner(worktree_path: &str) -> Result<WorktreeChangeSet, String> {
    let repo = Repository::open(worktree_path)
        .map_err(|e| format!("failed to open worktree at {worktree_path}: {e}"))?;

    let (base_branch, base_branch_source) = resolve_base_branch(&repo)?;

    let mut status_opts = git2::StatusOptions::new();
    status_opts
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let statuses = repo
        .statuses(Some(&mut status_opts))
        .map_err(|e| format!("git statuses failed: {e}"))?;

    let mut vs_head: Vec<FileChange> = Vec::new();
    for entry in statuses.iter() {
        let s = entry.status();
        if s.is_ignored() {
            continue;
        }
        let head_to_index = entry.head_to_index();
        let index_to_workdir = entry.index_to_workdir();

        let path = entry.path().unwrap_or("").to_string();
        let mut previous_path: Option<String> = None;
        let mut effective_path = path.clone();

        let status = if s.is_conflicted() {
            FileChangeStatus::Modified
        } else if s.is_wt_new() && !s.is_index_new() {
            FileChangeStatus::Untracked
        } else if s.is_wt_new() || s.is_index_new() {
            FileChangeStatus::Added
        } else if s.is_wt_deleted() || s.is_index_deleted() {
            FileChangeStatus::Deleted
        } else if s.is_wt_renamed() || s.is_index_renamed() {
            if let Some(diff) = head_to_index.as_ref().or(index_to_workdir.as_ref()) {
                if let (Some(old), Some(new)) =
                    (diff.old_file().path(), diff.new_file().path())
                {
                    let old_s = old.to_string_lossy().to_string();
                    let new_s = new.to_string_lossy().to_string();
                    if old_s != new_s {
                        previous_path = Some(old_s);
                        effective_path = new_s;
                    }
                }
            }
            FileChangeStatus::Renamed
        } else {
            FileChangeStatus::Modified
        };

        let is_submodule = head_to_index
            .as_ref()
            .or(index_to_workdir.as_ref())
            .map(|d| d.new_file().mode() == git2::FileMode::Commit
                || d.old_file().mode() == git2::FileMode::Commit)
            .unwrap_or(false);

        let is_binary = head_to_index
            .as_ref()
            .or(index_to_workdir.as_ref())
            .map(|d| d.new_file().is_binary() || d.old_file().is_binary())
            .unwrap_or(false);

        let (additions, deletions) =
            count_line_changes(&repo, &effective_path).unwrap_or((0, 0));

        vs_head.push(FileChange {
            path: effective_path,
            previous_path,
            status,
            additions,
            deletions,
            is_binary,
            is_submodule,
        });
    }

    let detached_head = repo.head_detached().unwrap_or(false);

    Ok(WorktreeChangeSet {
        vs_head,
        vs_base: Vec::new(),
        base_branch,
        base_branch_source,
        detached_head,
        merge_base_unavailable: false,
    })
}

fn count_line_changes(repo: &Repository, path: &str) -> Result<(u32, u32), String> {
    let mut opts = git2::DiffOptions::new();
    opts.pathspec(path)
        .context_lines(0)
        .include_untracked(true)
        .show_untracked_content(true);
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| format!("diff_index_to_workdir failed: {e}"))?;
    let mut adds = 0u32;
    let mut dels = 0u32;
    diff.foreach(
        &mut |_, _| true,
        None,
        None,
        Some(&mut |_, _, line| {
            match line.origin() {
                '+' => adds += 1,
                '-' => dels += 1,
                _ => {}
            }
            true
        }),
    )
    .map_err(|e| format!("diff foreach failed: {e}"))?;
    Ok((adds, dels))
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

    #[test]
    fn list_worktree_changes_reports_empty_for_clean_repo() {
        let tmp = TempDir::new().unwrap();
        let repo = init_bare_repo(&tmp);
        create_orphan_branch(&repo, "main");
        drop(repo);

        let result = list_worktree_changes_inner(tmp.path().to_str().unwrap()).unwrap();
        assert!(result.vs_head.is_empty());
        assert!(result.vs_base.is_empty());
        assert_eq!(result.base_branch, "main");
        assert!(matches!(result.base_branch_source, BaseBranchSource::FallbackMain));
    }
}
