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

        // Status-entry delta flags aren't reliable for binary detection because
        // git2's status scan doesn't read file content. Use the real diff result
        // from count_line_changes (which calls diff_index_to_workdir) as the
        // authoritative binary flag; fall back to the status delta hint.
        let status_binary = head_to_index
            .as_ref()
            .or(index_to_workdir.as_ref())
            .map(|d| d.new_file().is_binary() || d.old_file().is_binary())
            .unwrap_or(false);

        let (additions, deletions, diff_binary) =
            count_line_changes(&repo, &effective_path).unwrap_or((0, 0, false));

        let is_binary = status_binary || diff_binary;

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

    let (vs_base, merge_base_unavailable) = compute_vs_base(&repo, &base_branch);

    Ok(WorktreeChangeSet {
        vs_head,
        vs_base,
        base_branch,
        base_branch_source,
        detached_head,
        merge_base_unavailable,
    })
}

/// Returns (additions, deletions, is_binary).
/// Running a real diff (not just status) is necessary for binary detection,
/// since git2 status entries don't read file content to set the binary flag.
fn count_line_changes(repo: &Repository, path: &str) -> Result<(u32, u32, bool), String> {
    use std::cell::Cell;

    let mut opts = git2::DiffOptions::new();
    opts.pathspec(path)
        .context_lines(0)
        .include_untracked(true)
        .show_untracked_content(true);
    let diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| format!("diff_index_to_workdir failed: {e}"))?;
    let adds: Cell<u32> = Cell::new(0);
    let dels: Cell<u32> = Cell::new(0);
    let is_binary: Cell<bool> = Cell::new(false);
    diff.foreach(
        &mut |delta, _| {
            if delta.new_file().is_binary() || delta.old_file().is_binary() {
                is_binary.set(true);
            }
            true
        },
        Some(&mut |_, _| {
            is_binary.set(true);
            true
        }),
        None,
        Some(&mut |_, _, line| {
            match line.origin() {
                '+' => adds.set(adds.get() + 1),
                '-' => dels.set(dels.get() + 1),
                _ => {}
            }
            true
        }),
    )
    .map_err(|e| format!("diff foreach failed: {e}"))?;
    Ok((adds.get(), dels.get(), is_binary.get()))
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

fn compute_vs_base(repo: &Repository, base_branch: &str) -> (Vec<FileChange>, bool) {
    // Resolve HEAD commit.
    let head_commit = match repo.head().and_then(|h| h.peel_to_commit()) {
        Ok(c) => c,
        Err(_) => return (Vec::new(), false), // unborn HEAD — nothing to compare.
    };
    let head_tree = match head_commit.tree() {
        Ok(t) => t,
        Err(_) => return (Vec::new(), false),
    };

    // Resolve base ref (try local first, then remote).
    let base_oid = repo
        .find_branch(base_branch, git2::BranchType::Local)
        .or_else(|_| repo.find_branch(&format!("origin/{base_branch}"), git2::BranchType::Remote))
        .ok()
        .and_then(|b| b.into_reference().peel_to_commit().ok())
        .map(|c| c.id());
    let base_oid = match base_oid {
        Some(id) => id,
        None => return (Vec::new(), true), // base ref not found → merge_base_unavailable.
    };

    // If HEAD already IS base (e.g. base branch points at HEAD), no commits-ahead.
    if head_commit.id() == base_oid {
        return (Vec::new(), false);
    }

    // Find merge-base. With a shallow clone or disjoint history this can fail.
    let merge_base = match repo.merge_base(head_commit.id(), base_oid) {
        Ok(id) => id,
        Err(_) => return (Vec::new(), true),
    };
    let base_tree = match repo.find_commit(merge_base).and_then(|c| c.tree()) {
        Ok(t) => t,
        Err(_) => return (Vec::new(), true),
    };

    // Diff merge-base tree → HEAD tree (commits ahead of base).
    let mut opts = git2::DiffOptions::new();
    opts.context_lines(3);
    let mut diff = match repo.diff_tree_to_tree(Some(&base_tree), Some(&head_tree), Some(&mut opts)) {
        Ok(d) => d,
        Err(_) => return (Vec::new(), false),
    };
    let mut find_opts = git2::DiffFindOptions::new();
    find_opts.renames(true).copies(false);
    let _ = diff.find_similar(Some(&mut find_opts));

    let mut out: Vec<FileChange> = Vec::new();
    let _ = diff.foreach(
        &mut |delta, _| {
            let new_path = delta
                .new_file()
                .path()
                .map(|p| p.to_string_lossy().to_string());
            let old_path = delta
                .old_file()
                .path()
                .map(|p| p.to_string_lossy().to_string());

            let path = new_path
                .clone()
                .or_else(|| old_path.clone())
                .unwrap_or_default();
            let previous_path = match (&old_path, &new_path) {
                (Some(o), Some(n)) if o != n => Some(o.clone()),
                _ => None,
            };
            let status = match delta.status() {
                git2::Delta::Added => FileChangeStatus::Added,
                git2::Delta::Deleted => FileChangeStatus::Deleted,
                git2::Delta::Renamed => FileChangeStatus::Renamed,
                _ => FileChangeStatus::Modified,
            };
            let is_binary = delta.new_file().is_binary() || delta.old_file().is_binary();
            let is_submodule = delta.new_file().mode() == git2::FileMode::Commit
                || delta.old_file().mode() == git2::FileMode::Commit;
            out.push(FileChange {
                path,
                previous_path,
                status,
                additions: 0,
                deletions: 0,
                is_binary,
                is_submodule,
            });
            true
        },
        None,
        None,
        None,
    );

    (out, false)
}

pub fn diff_worktree_vs_head_inner(
    worktree_path: &str,
    file_path: &str,
) -> Result<UnifiedDiff, String> {
    let repo = Repository::open(worktree_path).map_err(|e| e.to_string())?;
    let mut opts = git2::DiffOptions::new();
    opts.pathspec(file_path)
        .context_lines(3)
        .include_untracked(true)
        .show_untracked_content(true);

    // index → workdir captures the user's uncommitted edits.
    let mut diff = repo
        .diff_index_to_workdir(None, Some(&mut opts))
        .map_err(|e| e.to_string())?;
    let mut find_opts = git2::DiffFindOptions::new();
    find_opts.renames(true);
    let _ = diff.find_similar(Some(&mut find_opts));

    Ok(unified_diff_from_diff(&diff, file_path))
}

pub fn diff_worktree_vs_base_inner(
    worktree_path: &str,
    base_branch: &str,
    file_path: &str,
) -> Result<UnifiedDiff, String> {
    let repo = Repository::open(worktree_path).map_err(|e| e.to_string())?;
    let head_commit = repo
        .head()
        .and_then(|r| r.peel_to_commit())
        .map_err(|e| e.to_string())?;
    let head_tree = head_commit.tree().map_err(|e| e.to_string())?;

    let base_commit_oid = repo
        .find_branch(base_branch, git2::BranchType::Local)
        .or_else(|_| repo.find_branch(&format!("origin/{base_branch}"), git2::BranchType::Remote))
        .map_err(|e| format!("base branch not found: {e}"))?
        .into_reference()
        .peel_to_commit()
        .map_err(|e| e.to_string())?
        .id();
    let merge_base = repo
        .merge_base(head_commit.id(), base_commit_oid)
        .map_err(|e| format!("merge_base unavailable: {e}"))?;
    let base_tree = repo
        .find_commit(merge_base)
        .and_then(|c| c.tree())
        .map_err(|e| e.to_string())?;

    let mut opts = git2::DiffOptions::new();
    opts.pathspec(file_path).context_lines(3);
    let mut diff = repo
        .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), Some(&mut opts))
        .map_err(|e| e.to_string())?;
    let mut find_opts = git2::DiffFindOptions::new();
    find_opts.renames(true);
    let _ = diff.find_similar(Some(&mut find_opts));

    Ok(unified_diff_from_diff(&diff, file_path))
}

fn unified_diff_from_diff(diff: &git2::Diff, file_path: &str) -> UnifiedDiff {
    use std::cell::RefCell;

    let current_hunk: RefCell<Option<DiffHunk>> = RefCell::new(None);
    let hunks: RefCell<Vec<DiffHunk>> = RefCell::new(Vec::new());
    let binary: RefCell<Option<BinaryMarker>> = RefCell::new(None);
    let is_submodule: RefCell<bool> = RefCell::new(false);
    let previous_path: RefCell<Option<String>> = RefCell::new(None);

    let _ = diff.foreach(
        &mut |delta, _| {
            if delta.new_file().mode() == git2::FileMode::Commit
                || delta.old_file().mode() == git2::FileMode::Commit
            {
                *is_submodule.borrow_mut() = true;
            }
            let old_p = delta.old_file().path().map(|p| p.to_string_lossy().to_string());
            let new_p = delta.new_file().path().map(|p| p.to_string_lossy().to_string());
            if let (Some(o), Some(n)) = (old_p.as_ref(), new_p.as_ref()) {
                if o != n {
                    *previous_path.borrow_mut() = Some(o.clone());
                }
            }
            if delta.new_file().is_binary() || delta.old_file().is_binary() {
                *binary.borrow_mut() = Some(BinaryMarker {
                    old_size: Some(delta.old_file().size()),
                    new_size: Some(delta.new_file().size()),
                });
            }
            true
        },
        None,
        Some(&mut |_, hunk| {
            if let Some(h) = current_hunk.borrow_mut().take() {
                hunks.borrow_mut().push(h);
            }
            let header = String::from_utf8_lossy(hunk.header())
                .trim_end()
                .to_string();
            *current_hunk.borrow_mut() = Some(DiffHunk {
                header,
                old_start: hunk.old_start(),
                old_count: hunk.old_lines(),
                new_start: hunk.new_start(),
                new_count: hunk.new_lines(),
                lines: Vec::new(),
            });
            true
        }),
        Some(&mut |_, _hunk, line| {
            let kind = match line.origin() {
                '+' => DiffLineKind::Add,
                '-' => DiffLineKind::Delete,
                _ => DiffLineKind::Context,
            };
            let content = String::from_utf8_lossy(line.content())
                .trim_end_matches('\n')
                .to_string();
            let dl = DiffLine {
                kind,
                content,
                old_line_number: line.old_lineno(),
                new_line_number: line.new_lineno(),
            };
            if let Some(h) = current_hunk.borrow_mut().as_mut() {
                h.lines.push(dl);
            }
            true
        }),
    );
    if let Some(h) = current_hunk.borrow_mut().take() {
        hunks.borrow_mut().push(h);
    }

    UnifiedDiff {
        file_path: file_path.to_string(),
        previous_path: previous_path.into_inner(),
        hunks: hunks.into_inner(),
        binary: binary.into_inner(),
        is_submodule: is_submodule.into_inner(),
    }
}

#[tauri::command]
pub async fn list_worktree_changes(worktree_path: String) -> Result<WorktreeChangeSet, String> {
    tokio::task::spawn_blocking(move || list_worktree_changes_inner(&worktree_path))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn diff_worktree_vs_head(
    worktree_path: String,
    file_path: String,
) -> Result<UnifiedDiff, String> {
    tokio::task::spawn_blocking(move || diff_worktree_vs_head_inner(&worktree_path, &file_path))
        .await
        .map_err(|e| format!("Task join error: {e}"))?
}

#[tauri::command]
pub async fn diff_worktree_vs_base(
    worktree_path: String,
    base_branch: String,
    file_path: String,
) -> Result<UnifiedDiff, String> {
    tokio::task::spawn_blocking(move || {
        diff_worktree_vs_base_inner(&worktree_path, &base_branch, &file_path)
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
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

    #[test]
    fn list_worktree_changes_marks_merge_base_unavailable_for_orphan_repo() {
        let tmp = TempDir::new().unwrap();
        let repo = init_bare_repo(&tmp);
        // Branch 'main' exists but has no shared ancestry with HEAD (HEAD == main).
        create_orphan_branch(&repo, "main");
        drop(repo);

        let result = list_worktree_changes_inner(tmp.path().to_str().unwrap()).unwrap();
        // HEAD == base → merge_base IS HEAD, so vs_base is empty but
        // merge_base_unavailable is false (merge-base resolved trivially).
        assert!(result.vs_base.is_empty());
        assert!(!result.merge_base_unavailable);
    }

    #[test]
    fn diff_worktree_vs_head_returns_empty_hunks_for_nonexistent_file() {
        let tmp = TempDir::new().unwrap();
        let repo = init_bare_repo(&tmp);
        create_orphan_branch(&repo, "main");
        drop(repo);

        let result = diff_worktree_vs_head_inner(
            tmp.path().to_str().unwrap(),
            "nonexistent.rs",
        ).unwrap();
        assert!(result.hunks.is_empty());
        assert!(result.binary.is_none());
        assert_eq!(result.file_path, "nonexistent.rs");
    }
}
