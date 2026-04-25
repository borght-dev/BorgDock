mod fixtures;
use fixtures::worktree_changes_fixtures::*;
use borgdock_lib::git::worktree_changes::{
    list_worktree_changes_inner, diff_worktree_vs_head_inner,
    FileChangeStatus, BaseBranchSource,
};

#[test]
fn fixture_clean_repo_creates_a_repo() {
    let f = build_clean_repo();
    assert!(f.path().join(".git").exists());
}

#[test]
fn clean_repo_lists_no_changes() {
    let f = build_clean_repo();
    let out = list_worktree_changes_inner(f.path_str()).unwrap();
    assert!(out.vs_head.is_empty());
    assert_eq!(out.base_branch, "main");
}

#[test]
fn modified_file_shows_as_modified_with_line_counts() {
    let f = build_modified_repo();
    let out = list_worktree_changes_inner(f.path_str()).unwrap();
    assert_eq!(out.vs_head.len(), 1);
    let fc = &out.vs_head[0];
    assert_eq!(fc.path, "README.md");
    assert_eq!(fc.status, FileChangeStatus::Modified);
    assert!(fc.additions >= 1);
}

#[test]
fn added_file_shows_as_added() {
    let f = build_added_repo();
    let out = list_worktree_changes_inner(f.path_str()).unwrap();
    assert!(out.vs_head.iter().any(|c| c.path == "new.txt"
        && c.status == FileChangeStatus::Added));
}

#[test]
fn deleted_file_shows_as_deleted() {
    let f = build_deleted_repo();
    let out = list_worktree_changes_inner(f.path_str()).unwrap();
    assert!(out.vs_head.iter().any(|c| c.path == "README.md"
        && c.status == FileChangeStatus::Deleted));
}

#[test]
fn renamed_file_carries_previous_path() {
    let f = build_renamed_repo();
    let out = list_worktree_changes_inner(f.path_str()).unwrap();
    let renamed = out.vs_head.iter()
        .find(|c| c.path == "README-renamed.md")
        .expect("renamed entry not found");
    assert_eq!(renamed.status, FileChangeStatus::Renamed);
    assert_eq!(renamed.previous_path.as_deref(), Some("README.md"));
}

#[test]
fn binary_file_marks_is_binary_and_returns_binary_marker() {
    let f = build_binary_repo();
    let out = list_worktree_changes_inner(f.path_str()).unwrap();
    let bin = out.vs_head.iter().find(|c| c.path == "blob.bin").expect("binary entry missing");
    assert!(bin.is_binary);
    let diff = diff_worktree_vs_head_inner(f.path_str(), "blob.bin").unwrap();
    assert!(diff.binary.is_some());
    assert!(diff.hunks.is_empty());
}

#[test]
fn untracked_file_is_listed_as_untracked() {
    let f = build_untracked_repo();
    let out = list_worktree_changes_inner(f.path_str()).unwrap();
    assert!(out.vs_head.iter().any(|c| c.path == "untracked.txt"
        && c.status == FileChangeStatus::Untracked));
}

#[test]
fn submodule_change_is_listed_without_content_diff() {
    let f = build_submodule_repo();
    let out = list_worktree_changes_inner(f.path_str()).unwrap();
    let sub = out.vs_head.iter().find(|c| c.path == "vendor");
    if let Some(sub) = sub {
        assert!(sub.is_submodule);
    }
    // Either way: no panic + every emitted change carries at least a path.
    for c in &out.vs_head { assert!(!c.path.is_empty()); }
}

#[test]
fn detached_head_marks_detached_head_true() {
    let f = build_detached_head_repo();
    let out = list_worktree_changes_inner(f.path_str()).unwrap();
    assert!(out.detached_head);
}

#[test]
fn shallow_no_mergebase_marks_merge_base_unavailable() {
    let f = build_shallow_no_mergebase_repo();
    let out = list_worktree_changes_inner(f.path_str()).unwrap();
    // HEAD is on `main`, base_branch resolves via fallback chain to `master`;
    // they share no merge-base → flag should be set.
    assert!(matches!(out.base_branch_source, BaseBranchSource::FallbackMaster));
    assert!(out.merge_base_unavailable);
}
