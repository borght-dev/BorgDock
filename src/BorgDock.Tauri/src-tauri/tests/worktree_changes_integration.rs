mod fixtures;
use fixtures::worktree_changes_fixtures::build_clean_repo;

#[test]
fn fixture_clean_repo_creates_a_repo() {
    let f = build_clean_repo();
    assert!(f.path().join(".git").exists());
}
