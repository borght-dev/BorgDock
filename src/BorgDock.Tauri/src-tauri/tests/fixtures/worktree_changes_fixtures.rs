use git2::{Repository, Signature};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

pub struct Fixture {
    pub tmp: TempDir,
}

impl Fixture {
    pub fn path(&self) -> &Path { self.tmp.path() }
    pub fn path_str(&self) -> &str { self.tmp.path().to_str().unwrap() }
}

fn sig() -> Signature<'static> {
    Signature::now("test", "test@test.example").unwrap()
}

fn write(path: &Path, contents: &[u8]) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, contents).unwrap();
}

fn commit_all(repo: &Repository, msg: &str) -> git2::Oid {
    let mut idx = repo.index().unwrap();
    idx.add_all(["."].iter(), git2::IndexAddOption::DEFAULT, None).unwrap();
    idx.write().unwrap();
    let tree_oid = idx.write_tree().unwrap();
    let tree = repo.find_tree(tree_oid).unwrap();
    let s = sig();
    let parent = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    repo.commit(Some("HEAD"), &s, &s, msg, &tree, &parents).unwrap()
}

/// Repo with a single committed file and no edits.
pub fn build_clean_repo() -> Fixture {
    let tmp = TempDir::new().unwrap();
    let repo = Repository::init(tmp.path()).unwrap();
    write(&tmp.path().join("README.md"), b"hello\n");
    commit_all(&repo, "initial");
    repo.set_head("refs/heads/main").ok();
    Fixture { tmp }
}

/// Repo with one tracked file edited (uncommitted).
pub fn build_modified_repo() -> Fixture {
    let f = build_clean_repo();
    write(&f.path().join("README.md"), b"hello\nworld\n");
    f
}

/// Repo with a new file (added but unstaged).
pub fn build_added_repo() -> Fixture {
    let f = build_clean_repo();
    write(&f.path().join("new.txt"), b"new\n");
    let repo = Repository::open(f.path()).unwrap();
    let mut idx = repo.index().unwrap();
    idx.add_path(Path::new("new.txt")).unwrap();
    idx.write().unwrap();
    f
}

/// Repo with one tracked file deleted (uncommitted).
pub fn build_deleted_repo() -> Fixture {
    let f = build_clean_repo();
    fs::remove_file(f.path().join("README.md")).unwrap();
    f
}

/// Repo with a renamed file (rename detection should pick this up).
pub fn build_renamed_repo() -> Fixture {
    let f = build_clean_repo();
    let old = f.path().join("README.md");
    let new = f.path().join("README-renamed.md");
    fs::rename(&old, &new).unwrap();
    f
}

/// Repo with a binary file edited.
pub fn build_binary_repo() -> Fixture {
    let tmp = TempDir::new().unwrap();
    let repo = Repository::init(tmp.path()).unwrap();
    let bin: Vec<u8> = (0u8..=255).cycle().take(2048).collect();
    write(&tmp.path().join("blob.bin"), &bin);
    commit_all(&repo, "initial");
    repo.set_head("refs/heads/main").ok();
    let bin2: Vec<u8> = (0u8..=255).cycle().take(4096).collect();
    write(&tmp.path().join("blob.bin"), &bin2);
    Fixture { tmp }
}

/// Repo with an untracked file (never staged).
pub fn build_untracked_repo() -> Fixture {
    let f = build_clean_repo();
    write(&f.path().join("untracked.txt"), b"untracked\n");
    f
}

/// Repo containing a submodule entry.
pub fn build_submodule_repo() -> Fixture {
    let tmp = TempDir::new().unwrap();
    let repo = Repository::init(tmp.path()).unwrap();
    write(
        &tmp.path().join(".gitmodules"),
        b"[submodule \"vendor\"]\n\tpath = vendor\n\turl = ./vendor\n",
    );
    fs::create_dir_all(tmp.path().join("vendor")).unwrap();
    write(&tmp.path().join("README.md"), b"top\n");
    commit_all(&repo, "initial with submodule entry");
    repo.set_head("refs/heads/main").ok();
    Fixture { tmp }
}

/// Repo with detached HEAD.
pub fn build_detached_head_repo() -> Fixture {
    let f = build_clean_repo();
    let repo = Repository::open(f.path()).unwrap();
    let head_oid = repo.head().unwrap().peel_to_commit().unwrap().id();
    repo.set_head_detached(head_oid).unwrap();
    f
}

/// Repo where the merge-base genuinely cannot be resolved (orphan history).
pub fn build_shallow_no_mergebase_repo() -> Fixture {
    let tmp = TempDir::new().unwrap();
    let repo = Repository::init(tmp.path()).unwrap();
    write(&tmp.path().join("a.txt"), b"a\n");
    commit_all(&repo, "main 1");
    repo.set_head("refs/heads/main").ok();

    // create an orphan branch `master` with disjoint history.
    let s = sig();
    let mut idx = repo.index().unwrap();
    idx.clear().unwrap();
    write(&tmp.path().join("b.txt"), b"b\n");
    idx.add_path(Path::new("b.txt")).unwrap();
    idx.write().unwrap();
    let tree_oid = idx.write_tree().unwrap();
    let tree = repo.find_tree(tree_oid).unwrap();
    repo.commit(Some("refs/heads/master"), &s, &s, "master root", &tree, &[]).unwrap();
    Fixture { tmp }
}
