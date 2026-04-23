# File Palette — Changed Files section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent "Changes" section to the File Palette middle pane that shows two grouped lists — Local (working-tree vs HEAD, incl. untracked) and vs default-branch (committed delta, deduped against Local) — for the active worktree root. Clicks open the existing file viewer with the matching baseline preselected.

**Architecture:** One new Rust Tauri command (`git_changed_files`) in `src-tauri/src/git/diff.rs`, one new React component (`ChangesSection.tsx`) in `src/components/file-palette/`, and small extensions to the viewer's URL contract and `FilePaletteApp`'s keyboard nav. Reuses the existing `default_branch_cache`, `repo_toplevel`, and `hidden_command` helpers from `src-tauri/src/git/`.

**Tech Stack:** Rust (Tauri 2, tokio::task::spawn_blocking), React 18 + TypeScript, Vitest + @testing-library/react, Vite (dev via `npm run tauri dev`).

**Reference spec:** `docs/superpowers/specs/2026-04-23-file-palette-changed-files-section-design.md`

**Windows build note (CLAUDE.md):** cargo commands in Git Bash must be prefixed with `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'`. All `cargo` invocations below include it.

---

## File Structure

**Create:**
- `src/BorgDock.Tauri/src/components/file-palette/ChangesSection.tsx` — new React component
- `src/BorgDock.Tauri/src/components/file-palette/__tests__/ChangesSection.test.tsx` — component tests

**Modify:**
- `src/BorgDock.Tauri/src-tauri/src/git/diff.rs` — add `ChangedFile`, `ChangedFilesOutput`, `NameStatusMode`, `parse_name_status`, `git_changed_files`, plus unit tests
- `src/BorgDock.Tauri/src-tauri/src/git/mod.rs` — re-export `git_changed_files`
- `src/BorgDock.Tauri/src-tauri/src/lib.rs` — register command in `invoke_handler`
- `src/BorgDock.Tauri/src-tauri/src/file_palette/windows.rs` — accept optional `baseline` arg on `open_file_viewer_window`, append to URL
- `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.tsx` — read initial `baseline` from URL
- `src/BorgDock.Tauri/src/types/settings.ts` — add `filePaletteChangesCollapsed` to `UiSettings`
- `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx` — render section, flat-nav `selectedIndex`, focus refresh, baseline-aware `openResult`
- `src/BorgDock.Tauri/src/styles/file-palette.css` — styles for the section

All frontend paths use `@/` path aliases where the existing files do.

---

## Task 1: Rust — `parse_name_status` parser + unit tests

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/git/diff.rs`

`git status --porcelain=v1 -z` and `git diff --name-status -z` both use NUL-delimited records but differ slightly. Unified parser takes a `NameStatusMode`.

- `Status` mode: each record begins with two status bytes + space, then path (e.g. `" M src/foo.ts"`). Renames/copies: first record is `"R  old_path"`, next record is the new path (two records per rename). Untracked is `"?? path"`.
- `Diff` mode: each record begins with a single status letter (e.g. `"M"`), then NUL, then path. Renames/copies: first record is `"R100"`, next record is old_path, next is new_path (three records per rename).

- [ ] **Step 1: Add the failing tests**

Append to `src/BorgDock.Tauri/src-tauri/src/git/diff.rs`, in its existing `#[cfg(test)] mod tests { … }` block (create one if none exists at the bottom of the file):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_status_mode_plain_modification() {
        let bytes = b" M src/foo.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Status);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "src/foo.ts");
        assert_eq!(files[0].status, "M");
        assert!(files[0].old_path.is_none());
    }

    #[test]
    fn parses_status_mode_untracked() {
        let bytes = b"?? src/new.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Status);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "src/new.ts");
        assert_eq!(files[0].status, "?");
    }

    #[test]
    fn parses_status_mode_rename_two_records() {
        let bytes = b"R  new.ts\0old.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Status);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "new.ts");
        assert_eq!(files[0].status, "R");
        assert_eq!(files[0].old_path.as_deref(), Some("old.ts"));
    }

    #[test]
    fn parses_status_mode_multiple_files() {
        let bytes = b" M a.ts\0?? b.ts\0D  c.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Status);
        assert_eq!(files.len(), 3);
        assert_eq!(files[0].status, "M");
        assert_eq!(files[1].status, "?");
        assert_eq!(files[2].status, "D");
    }

    #[test]
    fn parses_diff_mode_plain_modification() {
        let bytes = b"M\0src/foo.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "src/foo.ts");
        assert_eq!(files[0].status, "M");
    }

    #[test]
    fn parses_diff_mode_rename_three_records() {
        let bytes = b"R100\0old.ts\0new.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "new.ts");
        assert_eq!(files[0].status, "R");
        assert_eq!(files[0].old_path.as_deref(), Some("old.ts"));
    }

    #[test]
    fn parses_diff_mode_deletion() {
        let bytes = b"D\0gone.ts\0";
        let files = parse_name_status(bytes, NameStatusMode::Diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "gone.ts");
        assert_eq!(files[0].status, "D");
    }

    #[test]
    fn parse_handles_empty_input() {
        assert_eq!(parse_name_status(b"", NameStatusMode::Status).len(), 0);
        assert_eq!(parse_name_status(b"", NameStatusMode::Diff).len(), 0);
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib git::diff::tests 2>&1 | tail -20
```
Expected: all 8 tests fail with `cannot find type NameStatusMode` / `cannot find function parse_name_status`.

- [ ] **Step 3: Add types + parser**

In `src/BorgDock.Tauri/src-tauri/src/git/diff.rs`, above the `#[cfg(test)]` block, add:

```rust
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
    pub old_path: Option<String>,
}

#[derive(Copy, Clone, Debug)]
pub enum NameStatusMode {
    /// `git status --porcelain=v1 -z` — records begin with two status bytes + space + path.
    /// Renames produce two records: `"R  new_path"` then `"old_path"`.
    Status,
    /// `git diff --name-status -z` — records begin with a single status letter + NUL + path.
    /// Renames/copies produce three records: `"R100"` / `"C90"` then old_path then new_path.
    Diff,
}

pub fn parse_name_status(bytes: &[u8], mode: NameStatusMode) -> Vec<ChangedFile> {
    let mut out = Vec::new();
    // Split on NUL; trailing NUL produces an empty last element which we skip.
    let records: Vec<&[u8]> = bytes
        .split(|b| *b == 0)
        .filter(|r| !r.is_empty())
        .collect();

    let mut i = 0;
    while i < records.len() {
        match mode {
            NameStatusMode::Status => {
                let rec = records[i];
                if rec.len() < 3 {
                    i += 1;
                    continue;
                }
                let x = rec[0] as char;
                let y = rec[1] as char;
                // Two-byte code; "?? " means untracked, "R  " means renamed.
                // Status letter priority: index side (X) except untracked (?/?) → '?'.
                let status_char = if x == '?' && y == '?' {
                    '?'
                } else if x != ' ' {
                    x
                } else {
                    y
                };
                let path = String::from_utf8_lossy(&rec[3..]).to_string();
                if status_char == 'R' || status_char == 'C' {
                    // Next record is the old path.
                    let old = records
                        .get(i + 1)
                        .map(|b| String::from_utf8_lossy(b).to_string());
                    out.push(ChangedFile {
                        path,
                        status: status_char.to_string(),
                        old_path: old,
                    });
                    i += 2;
                } else {
                    out.push(ChangedFile {
                        path,
                        status: status_char.to_string(),
                        old_path: None,
                    });
                    i += 1;
                }
            }
            NameStatusMode::Diff => {
                let rec = records[i];
                if rec.is_empty() {
                    i += 1;
                    continue;
                }
                let status_char = rec[0] as char;
                if status_char == 'R' || status_char == 'C' {
                    // Three records: "R100" / "C90", old, new.
                    let old = records
                        .get(i + 1)
                        .map(|b| String::from_utf8_lossy(b).to_string());
                    let new_path = records
                        .get(i + 2)
                        .map(|b| String::from_utf8_lossy(b).to_string())
                        .unwrap_or_default();
                    out.push(ChangedFile {
                        path: new_path,
                        status: status_char.to_string(),
                        old_path: old,
                    });
                    i += 3;
                } else {
                    // Two records: status, path.
                    let path = records
                        .get(i + 1)
                        .map(|b| String::from_utf8_lossy(b).to_string())
                        .unwrap_or_default();
                    out.push(ChangedFile {
                        path,
                        status: status_char.to_string(),
                        old_path: None,
                    });
                    i += 2;
                }
            }
        }
    }
    out
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib git::diff::tests 2>&1 | tail -20
```
Expected: `test result: ok. 8 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/git/diff.rs
git commit -m "$(cat <<'EOF'
feat(git): add parse_name_status parser for git status/diff records

Unified parser for NUL-separated output from `git status --porcelain=v1 -z`
and `git diff --name-status -z`. Handles plain modifications, untracked,
deletions, and rename/copy (two-record for status, three-record for diff).
Foundation for the upcoming git_changed_files command.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rust — `git_changed_files` Tauri command

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/git/diff.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/git/mod.rs`
- Modify: `src/BorgDock.Tauri/src-tauri/src/lib.rs`

- [ ] **Step 1: Add the failing integration test**

Append to the `tests` module in `src-tauri/src/git/diff.rs`:

```rust
    use std::fs;
    use std::process::Command;

    fn init_test_repo(tmp: &std::path::Path) {
        let run = |args: &[&str]| {
            let out = Command::new("git")
                .args(args)
                .current_dir(tmp)
                .output()
                .expect("git");
            assert!(
                out.status.success(),
                "git {:?} failed: {}",
                args,
                String::from_utf8_lossy(&out.stderr)
            );
        };
        run(&["init", "-q", "-b", "master"]);
        run(&["config", "user.email", "t@test"]);
        run(&["config", "user.name", "t"]);
        // Fake origin/master so resolve_default_branch can find it.
        fs::write(tmp.join("seed.txt"), "seed").unwrap();
        run(&["add", "."]);
        run(&["commit", "-q", "-m", "seed"]);
        run(&["update-ref", "refs/remotes/origin/master", "HEAD"]);
        // Set origin/HEAD so resolve_default_branch's first lookup succeeds.
        run(&["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/master"]);
    }

    #[test]
    fn changed_files_reports_local_and_vs_base() {
        let tmp = tempfile::tempdir().unwrap();
        init_test_repo(tmp.path());

        // Commit a file "committed.ts" on a new branch → should land in vsBase.
        Command::new("git").args(["checkout", "-qb", "feature"]).current_dir(tmp.path()).output().unwrap();
        fs::write(tmp.path().join("committed.ts"), "x").unwrap();
        Command::new("git").args(["add", "."]).current_dir(tmp.path()).output().unwrap();
        Command::new("git").args(["commit", "-qm", "committed"]).current_dir(tmp.path()).output().unwrap();

        // Uncommitted: one modified + one untracked.
        fs::write(tmp.path().join("seed.txt"), "modified").unwrap();
        fs::write(tmp.path().join("untracked.ts"), "u").unwrap();

        let result = compute_changed_files(tmp.path().to_string_lossy().as_ref())
            .expect("compute_changed_files");
        assert!(result.in_repo);
        assert_eq!(result.base_ref, "master");

        let local_paths: Vec<&str> = result.local.iter().map(|f| f.path.as_str()).collect();
        assert!(local_paths.contains(&"seed.txt"));
        assert!(local_paths.contains(&"untracked.ts"));

        let vs_base_paths: Vec<&str> = result.vs_base.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(vs_base_paths, vec!["committed.ts"]);
    }

    #[test]
    fn changed_files_dedups_locally_modified_from_vs_base() {
        let tmp = tempfile::tempdir().unwrap();
        init_test_repo(tmp.path());

        Command::new("git").args(["checkout", "-qb", "feature"]).current_dir(tmp.path()).output().unwrap();
        fs::write(tmp.path().join("both.ts"), "a").unwrap();
        Command::new("git").args(["add", "."]).current_dir(tmp.path()).output().unwrap();
        Command::new("git").args(["commit", "-qm", "both"]).current_dir(tmp.path()).output().unwrap();

        // Now modify "both.ts" locally without committing.
        fs::write(tmp.path().join("both.ts"), "a2").unwrap();

        let result = compute_changed_files(tmp.path().to_string_lossy().as_ref()).unwrap();
        // Appears only in local; dedup removed from vs_base.
        assert!(result.local.iter().any(|f| f.path == "both.ts"));
        assert!(result.vs_base.iter().all(|f| f.path != "both.ts"));
    }

    #[test]
    fn changed_files_returns_not_in_repo_for_plain_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let result = compute_changed_files(tmp.path().to_string_lossy().as_ref()).unwrap();
        assert!(!result.in_repo);
        assert_eq!(result.local.len(), 0);
        assert_eq!(result.vs_base.len(), 0);
    }
```

Also add `tempfile = "3"` to `[dev-dependencies]` in `src-tauri/Cargo.toml` if it isn't already. Check first:

```bash
cd src/BorgDock.Tauri/src-tauri && grep -E '^tempfile' Cargo.toml
```
If nothing prints, append under the `[dev-dependencies]` section:

```toml
tempfile = "3"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib git::diff::tests::changed_files 2>&1 | tail -20
```
Expected: three tests fail — `cannot find function compute_changed_files`, `cannot find type ChangedFilesOutput`.

- [ ] **Step 3: Add `ChangedFilesOutput`, `compute_changed_files`, and `git_changed_files`**

In `src-tauri/src/git/diff.rs`, below the existing `compute_diff` function and before the `#[cfg(test)]` block, add:

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFilesOutput {
    pub local: Vec<ChangedFile>,
    pub vs_base: Vec<ChangedFile>,
    pub base_ref: String,
    pub in_repo: bool,
}

#[tauri::command]
pub async fn git_changed_files(root: String) -> Result<ChangedFilesOutput, String> {
    tokio::task::spawn_blocking(move || compute_changed_files(&root))
        .await
        .map_err(|e| format!("task join error: {e}"))?
}

fn compute_changed_files(root: &str) -> Result<ChangedFilesOutput, String> {
    let root_path = PathBuf::from(root);
    let dir = working_dir_for(&root_path);

    let toplevel = match repo_toplevel(&dir) {
        Some(t) => t,
        None => {
            return Ok(ChangedFilesOutput {
                local: Vec::new(),
                vs_base: Vec::new(),
                base_ref: String::new(),
                in_repo: false,
            });
        }
    };

    // 1. Local: `git status --porcelain=v1 -z`
    let status_out = run_git_raw(
        &toplevel,
        &["status", "--porcelain=v1", "-z"],
    )?;
    if !status_out.status.success() {
        return Err(format!(
            "git status failed (exit {}): {}",
            status_out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&status_out.stderr).trim()
        ));
    }
    let local = parse_name_status(&status_out.stdout, NameStatusMode::Status);

    // 2. vs base: merge-base against origin/<default>, then `git diff --name-status -z`.
    //    If default branch cannot be resolved (detached, no origin/HEAD, etc.),
    //    skip vs_base gracefully.
    let (vs_base, base_ref) = match resolve_default_branch(&toplevel) {
        Ok(branch) => {
            let remote_ref = format!("origin/{branch}");
            match run_git_capture(&toplevel, &["merge-base", "HEAD", &remote_ref]) {
                Ok(merge_base) => {
                    let diff_out = run_git_raw(
                        &toplevel,
                        &[
                            "diff",
                            "--name-status",
                            "-z",
                            &format!("{merge_base}..HEAD"),
                        ],
                    )?;
                    if !diff_out.status.success() {
                        (Vec::new(), branch)
                    } else {
                        let all = parse_name_status(&diff_out.stdout, NameStatusMode::Diff);
                        // Dedup: drop any path already in `local`.
                        let local_paths: std::collections::HashSet<&str> =
                            local.iter().map(|f| f.path.as_str()).collect();
                        let filtered: Vec<ChangedFile> = all
                            .into_iter()
                            .filter(|f| !local_paths.contains(f.path.as_str()))
                            .collect();
                        (filtered, branch)
                    }
                }
                Err(_) => (Vec::new(), branch),
            }
        }
        Err(_) => (Vec::new(), String::new()),
    };

    Ok(ChangedFilesOutput {
        local,
        vs_base,
        base_ref,
        in_repo: true,
    })
}
```

- [ ] **Step 4: Register module export**

In `src-tauri/src/git/mod.rs`, extend the re-export line that already exists for `git_file_diff`:

```rust
pub use diff::{git_changed_files, git_file_diff};
```

- [ ] **Step 5: Register command in `invoke_handler`**

In `src-tauri/src/lib.rs`, in the `tauri::generate_handler![...]` block, directly below the existing `git::diff::git_file_diff,` line, add:

```rust
            git::diff::git_changed_files,
```

- [ ] **Step 6: Run tests + cargo check to confirm everything builds and passes**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib git::diff::tests 2>&1 | tail -20
```
Expected: all tests pass (11 total).

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check 2>&1 | tail -10
```
Expected: `Finished` with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/git/diff.rs src/BorgDock.Tauri/src-tauri/src/git/mod.rs src/BorgDock.Tauri/src-tauri/src/lib.rs src/BorgDock.Tauri/src-tauri/Cargo.toml
git commit -m "$(cat <<'EOF'
feat(git): add git_changed_files Tauri command

Returns { local, vsBase, baseRef, inRepo } for a worktree root. Runs
`git status --porcelain=v1 -z` for Local and
`git diff --name-status -z <merge-base>..HEAD` for vs_base (deduped
against local paths). Reuses repo_toplevel / default_branch_cache.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rust — optional `baseline` arg on `open_file_viewer_window`

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/file_palette/windows.rs`

- [ ] **Step 1: Modify the command signature and URL construction**

In `src-tauri/src/file_palette/windows.rs`, replace the `open_file_viewer_window` function signature and URL line:

```rust
#[tauri::command]
pub async fn open_file_viewer_window(
    app: tauri::AppHandle,
    path: String,
    baseline: Option<String>,
) -> Result<(), String> {
    let label = viewer_label_for(&path);
    let encoded = urlencoding::encode(&path).into_owned();
    let baseline_qs = baseline
        .as_deref()
        .filter(|b| !b.is_empty())
        .map(|b| format!("&baseline={}", urlencoding::encode(b)))
        .unwrap_or_default();
```

Then change the `let url = format!(...)` line to:

```rust
            let url = format!("file-viewer.html?path={encoded}{baseline_qs}");
```

(The rest of the function body — `run_on_main_thread`, `WebviewWindowBuilder`, `bring_to_front` — stays unchanged.)

- [ ] **Step 2: Verify it builds**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check 2>&1 | tail -5
```
Expected: `Finished` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/file_palette/windows.rs
git commit -m "$(cat <<'EOF'
feat(file-viewer): accept optional baseline param in open_file_viewer_window

Appends &baseline=<value> to the viewer URL so callers can preselect
the diff baseline when opening a file. Defaults to HEAD when omitted,
preserving existing caller behavior.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Frontend — viewer reads initial baseline from URL

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.tsx`

- [ ] **Step 1: Add a test for URL-provided baseline**

Append a test to `src/BorgDock.Tauri/src/components/file-viewer/__tests__/FileViewerApp.test.tsx` (inside the existing `describe('FileViewerApp', ...)` block):

```tsx
  it('starts in mergeBaseDefault mode when ?baseline=mergeBaseDefault is in the URL', async () => {
    window.history.replaceState(
      null,
      '',
      '/file-viewer.html?path=' +
        encodeURIComponent('E:/a.ts') +
        '&baseline=mergeBaseDefault',
    );
    await setInvoke((cmd, args) => {
      if (cmd === 'read_text_file') return Promise.resolve('export const x = 1;');
      if (cmd === 'git_file_diff') {
        const baseline = (args as { baseline?: string } | undefined)?.baseline;
        // Assert the initial diff fetch uses the URL-provided baseline.
        return Promise.resolve({
          patch: baseline === 'mergeBaseDefault' ? SAMPLE_PATCH : '',
          baselineRef: baseline === 'mergeBaseDefault' ? 'master' : 'HEAD',
          inRepo: true,
        });
      }
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
    render(<FileViewerApp />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /vs master/ })).toHaveClass(
        'fv-seg-btn--active',
      ),
    );
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-viewer 2>&1 | tail -15
```
Expected: the new test fails (the viewer currently always starts with `baseline = 'HEAD'`).

- [ ] **Step 3: Read URL baseline in FileViewerApp**

In `src/components/file-viewer/FileViewerApp.tsx`, change the `baseline` state initializer:

```tsx
  const [baseline, setBaseline] = useState<Baseline>(() => {
    const raw = new URLSearchParams(window.location.search).get('baseline');
    return raw === 'mergeBaseDefault' ? 'mergeBaseDefault' : 'HEAD';
  });
```

(The `useMemo` for `path` stays as-is.)

- [ ] **Step 4: Run tests to confirm the new test passes**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-viewer 2>&1 | tail -15
```
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-viewer/FileViewerApp.tsx src/BorgDock.Tauri/src/components/file-viewer/__tests__/FileViewerApp.test.tsx
git commit -m "$(cat <<'EOF'
feat(file-viewer): read initial diff baseline from ?baseline= URL param

Allows callers (notably the forthcoming Changes section) to open the
viewer directly in "vs default branch" mode. Defaults to HEAD.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend — add `filePaletteChangesCollapsed` to settings

**Files:**
- Modify: `src/BorgDock.Tauri/src/types/settings.ts`

- [ ] **Step 1: Extend `UiSettings`**

In `src/types/settings.ts`, inside `export interface UiSettings { ... }`, add after `filePaletteRootsCollapsed?: boolean;`:

```ts
  filePaletteChangesCollapsed?: { local: boolean; vsBase: boolean };
```

- [ ] **Step 2: Confirm the type compiles**

```bash
cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | tail -5 && echo "---exit $?---"
```
Expected: `---exit 0---`.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/types/settings.ts
git commit -m "$(cat <<'EOF'
feat(settings): add filePaletteChangesCollapsed ui state

Tracks collapse state for the upcoming File Palette Changes section
(Local and vs-base subgroups collapse independently).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend — `ChangesSection` component

**Files:**
- Create: `src/BorgDock.Tauri/src/components/file-palette/ChangesSection.tsx`
- Create: `src/BorgDock.Tauri/src/components/file-palette/__tests__/ChangesSection.test.tsx`

This task builds the section in isolation — the component fetches via `invoke`, renders the two subgroups, supports collapse toggles, filters by query, and exposes a small imperative "list of flat nav rows" via a ref so `FilePaletteApp` (Task 7) can integrate keyboard nav.

- [ ] **Step 1: Write the failing tests**

Create `src/BorgDock.Tauri/src/components/file-palette/__tests__/ChangesSection.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangesSection } from '../ChangesSection';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

type InvokeMock = (cmd: string, args?: unknown) => Promise<unknown>;

async function setInvoke(impl: InvokeMock) {
  const { invoke } = await import('@tauri-apps/api/core');
  (invoke as ReturnType<typeof vi.fn>).mockImplementation(impl);
}

const BASE_PROPS = {
  rootPath: 'E:/repo',
  query: '',
  queryMode: 'filename' as const,
  selectedGlobalIndex: -1,
  baseIndex: 0,
  onOpen: vi.fn(),
  onHover: vi.fn(),
  localCollapsed: false,
  vsBaseCollapsed: false,
  onToggleCollapse: vi.fn(),
  refreshTick: 0,
};

describe('ChangesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Local and vs-base rows when in a git repo', async () => {
    await setInvoke(() =>
      Promise.resolve({
        local: [{ path: 'src/foo.ts', status: 'M', oldPath: null }],
        vsBase: [{ path: 'src/bar.ts', status: 'A', oldPath: null }],
        baseRef: 'master',
        inRepo: true,
      }),
    );
    render(<ChangesSection {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText('src/foo.ts')).toBeTruthy());
    expect(screen.getByText('src/bar.ts')).toBeTruthy();
    expect(screen.getByText(/Local/)).toBeTruthy();
    expect(screen.getByText(/vs master/)).toBeTruthy();
  });

  it('filters rows by filename query (case-insensitive substring)', async () => {
    await setInvoke(() =>
      Promise.resolve({
        local: [
          { path: 'src/Foo.ts', status: 'M', oldPath: null },
          { path: 'src/bar.ts', status: 'M', oldPath: null },
        ],
        vsBase: [],
        baseRef: 'master',
        inRepo: true,
      }),
    );
    render(<ChangesSection {...BASE_PROPS} query="foo" />);
    await waitFor(() => expect(screen.getByText('src/Foo.ts')).toBeTruthy());
    expect(screen.queryByText('src/bar.ts')).toBeNull();
  });

  it('shows "Not a git repo" when inRepo is false', async () => {
    await setInvoke(() =>
      Promise.resolve({ local: [], vsBase: [], baseRef: '', inRepo: false }),
    );
    render(<ChangesSection {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText(/Not a git repo/)).toBeTruthy());
  });

  it('shows "No changes" when lists are empty', async () => {
    await setInvoke(() =>
      Promise.resolve({ local: [], vsBase: [], baseRef: 'master', inRepo: true }),
    );
    render(<ChangesSection {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText(/No changes on this branch/)).toBeTruthy());
  });

  it('calls onOpen with the correct group when a row is clicked', async () => {
    await setInvoke(() =>
      Promise.resolve({
        local: [{ path: 'src/foo.ts', status: 'M', oldPath: null }],
        vsBase: [{ path: 'src/bar.ts', status: 'A', oldPath: null }],
        baseRef: 'master',
        inRepo: true,
      }),
    );
    const onOpen = vi.fn();
    render(<ChangesSection {...BASE_PROPS} onOpen={onOpen} />);
    await waitFor(() => expect(screen.getByText('src/foo.ts')).toBeTruthy());
    fireEvent.click(screen.getByText('src/foo.ts'));
    expect(onOpen).toHaveBeenCalledWith(
      { path: 'src/foo.ts', status: 'M', oldPath: null },
      'local',
    );
    fireEvent.click(screen.getByText('src/bar.ts'));
    expect(onOpen).toHaveBeenCalledWith(
      { path: 'src/bar.ts', status: 'A', oldPath: null },
      'vsBase',
    );
  });

  it('refetches when refreshTick changes', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const mock = invoke as ReturnType<typeof vi.fn>;
    mock.mockResolvedValue({ local: [], vsBase: [], baseRef: 'master', inRepo: true });

    const { rerender } = render(<ChangesSection {...BASE_PROPS} refreshTick={0} />);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));

    rerender(<ChangesSection {...BASE_PROPS} refreshTick={1} />);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/ChangesSection.test.tsx 2>&1 | tail -15
```
Expected: all tests fail — `Cannot find module '../ChangesSection'`.

- [ ] **Step 3: Create `ChangesSection.tsx`**

Create `src/BorgDock.Tauri/src/components/file-palette/ChangesSection.tsx`:

```tsx
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useState } from 'react';
import type { SearchMode } from './parse-query';

export interface ChangedFileEntry {
  path: string;
  status: string;
  oldPath: string | null;
}

interface ChangedFilesOutput {
  local: ChangedFileEntry[];
  vsBase: ChangedFileEntry[];
  baseRef: string;
  inRepo: boolean;
}

export type ChangedGroup = 'local' | 'vsBase';

export interface ChangesSectionProps {
  rootPath: string | null;
  query: string;
  queryMode: SearchMode;
  /** Global palette selectedIndex. Rows inside this section use baseIndex + local offset. */
  selectedGlobalIndex: number;
  /** Flat-nav starting index for this section's rows. */
  baseIndex: number;
  onOpen: (file: ChangedFileEntry, group: ChangedGroup) => void;
  /** Called when the user hovers a row; payload is the global nav index. */
  onHover: (globalIndex: number) => void;
  localCollapsed: boolean;
  vsBaseCollapsed: boolean;
  onToggleCollapse: (group: ChangedGroup) => void;
  /** Parent bumps this to force a refetch (focus change, manual refresh, root switch). */
  refreshTick: number;
  /** Called after each successful fetch so the parent knows how many flat-nav rows this
   *  section contributes (0 when collapsed / empty / not in repo). */
  onVisibleRowsChange?: (rows: VisibleRow[]) => void;
}

export interface VisibleRow {
  group: ChangedGroup;
  file: ChangedFileEntry;
}

function matches(path: string, query: string): boolean {
  if (!query) return true;
  return path.toLowerCase().includes(query.toLowerCase());
}

function statusColor(status: string): string {
  switch (status) {
    case 'A':
      return 'var(--color-status-green)';
    case 'D':
      return 'var(--color-status-red)';
    case 'R':
    case 'C':
      return 'var(--color-status-yellow)';
    case '?':
      return 'var(--color-status-blue, var(--color-accent))';
    default:
      return 'var(--color-text-muted)';
  }
}

export function ChangesSection(props: ChangesSectionProps) {
  const {
    rootPath,
    query,
    queryMode,
    selectedGlobalIndex,
    baseIndex,
    onOpen,
    onHover,
    localCollapsed,
    vsBaseCollapsed,
    onToggleCollapse,
    refreshTick,
    onVisibleRowsChange,
  } = props;

  const [data, setData] = useState<ChangedFilesOutput | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rootPath) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    invoke<ChangedFilesOutput>('git_changed_files', { root: rootPath })
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch(() => {
        if (!cancelled) setData({ local: [], vsBase: [], baseRef: '', inRepo: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath, refreshTick]);

  const filterActive = queryMode === 'filename' && query.length > 0;

  const filteredLocal = useMemo(
    () => (data ? data.local.filter((f) => !filterActive || matches(f.path, query)) : []),
    [data, filterActive, query],
  );
  const filteredVsBase = useMemo(
    () => (data ? data.vsBase.filter((f) => !filterActive || matches(f.path, query)) : []),
    [data, filterActive, query],
  );

  const visibleRows = useMemo<VisibleRow[]>(() => {
    const rows: VisibleRow[] = [];
    if (!data || !data.inRepo) return rows;
    if (!localCollapsed) for (const f of filteredLocal) rows.push({ group: 'local', file: f });
    if (!vsBaseCollapsed) for (const f of filteredVsBase) rows.push({ group: 'vsBase', file: f });
    return rows;
  }, [data, filteredLocal, filteredVsBase, localCollapsed, vsBaseCollapsed]);

  useEffect(() => {
    onVisibleRowsChange?.(visibleRows);
  }, [visibleRows, onVisibleRowsChange]);

  if (!rootPath) return null;

  if (data && !data.inRepo) {
    return (
      <div className="fp-changes">
        <div className="fp-changes-header">Changes</div>
        <div className="fp-changes-empty">Not a git repo</div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="fp-changes">
        <div className="fp-changes-header">Changes…</div>
      </div>
    );
  }

  if (!data) return null;

  const total = filteredLocal.length + filteredVsBase.length;
  if (total === 0) {
    return (
      <div className="fp-changes">
        <div className="fp-changes-header">Changes</div>
        <div className="fp-changes-empty">No changes on this branch</div>
      </div>
    );
  }

  // Compute each row's global nav index based on visibleRows order.
  let runningIndex = baseIndex;

  const renderRow = (file: ChangedFileEntry, group: ChangedGroup) => {
    const globalIdx = runningIndex++;
    const selected = selectedGlobalIndex === globalIdx;
    const label =
      file.oldPath && (file.status === 'R' || file.status === 'C')
        ? `${file.oldPath} → ${file.path}`
        : file.path;
    return (
      <button
        key={`${group}:${file.path}`}
        type="button"
        className={`fp-changes-row${selected ? ' fp-changes-row--selected' : ''}`}
        onMouseEnter={() => onHover(globalIdx)}
        onClick={() => onOpen(file, group)}
      >
        <span
          className="fp-changes-status"
          style={{ color: statusColor(file.status) }}
          title={file.status}
        >
          {file.status}
        </span>
        <span className="fp-changes-path">{label}</span>
      </button>
    );
  };

  return (
    <div className="fp-changes">
      <div className="fp-changes-header">
        <span>Changes ({total})</span>
        <span className="fp-changes-base">{data.baseRef ? `vs ${data.baseRef}` : ''}</span>
      </div>

      <button
        type="button"
        className="fp-changes-subheader"
        onClick={() => onToggleCollapse('local')}
      >
        <span>{localCollapsed ? '▸' : '▾'} Local ({filteredLocal.length})</span>
      </button>
      {!localCollapsed && filteredLocal.map((f) => renderRow(f, 'local'))}

      <button
        type="button"
        className="fp-changes-subheader"
        onClick={() => onToggleCollapse('vsBase')}
      >
        <span>
          {vsBaseCollapsed ? '▸' : '▾'} vs {data.baseRef || 'base'} ({filteredVsBase.length})
        </span>
      </button>
      {!vsBaseCollapsed && filteredVsBase.map((f) => renderRow(f, 'vsBase'))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/ChangesSection.test.tsx 2>&1 | tail -15
```
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/ChangesSection.tsx src/BorgDock.Tauri/src/components/file-palette/__tests__/ChangesSection.test.tsx
git commit -m "$(cat <<'EOF'
feat(file-palette): add ChangesSection component

Fetches git_changed_files for the active root, renders two
collapsible subgroups (Local / vs default-branch) with status
badges. Supports filename-query filtering and reports visible flat-
nav rows to the parent for keyboard navigation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend — wire `ChangesSection` into `FilePaletteApp`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx`

This task rewires `selectedIndex` so the arrow keys walk through Changes rows and regular results as one flat list. It also adds focus-based refresh and baseline-aware open.

- [ ] **Step 1: Add imports**

At the top of `FilePaletteApp.tsx`, below the existing imports, add:

```tsx
import { ChangesSection, type ChangedFileEntry, type ChangedGroup, type VisibleRow } from './ChangesSection';
```

- [ ] **Step 2: Add state for changes nav + collapse + refresh**

Inside `FilePaletteApp`, below the existing `useState` calls (near `rootsCollapsed`), add:

```tsx
  const [changesCollapsed, setChangesCollapsed] = useState<{ local: boolean; vsBase: boolean }>({
    local: false,
    vsBase: false,
  });
  const [changesVisibleRows, setChangesVisibleRows] = useState<VisibleRow[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
```

- [ ] **Step 3: Initialize collapse state from settings**

Inside the existing `useEffect` that loads settings (`(async () => { ... })();`), after the line that sets `rootsCollapsed`, add:

```tsx
        setChangesCollapsed(
          s.ui?.filePaletteChangesCollapsed ?? { local: false, vsBase: false },
        );
```

- [ ] **Step 4: Add a handler that persists the collapse toggle**

Below `toggleRootsCollapsed`, add:

```tsx
  const toggleChangesCollapse = useCallback(
    async (group: ChangedGroup) => {
      setChangesCollapsed((prev) => {
        const next = { ...prev, [group]: !prev[group] };
        void invoke<AppSettings>('load_settings')
          .then((s) =>
            invoke('save_settings', {
              settings: { ...s, ui: { ...s.ui, filePaletteChangesCollapsed: next } },
            }),
          )
          .catch(() => {
            /* ignore persistence failure */
          });
        return next;
      });
    },
    [],
  );
```

- [ ] **Step 5: Refresh on window focus**

Below the `toggleChangesCollapse` block, add an effect:

```tsx
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (focused) setRefreshTick((n) => n + 1);
      });
    })();
    return () => {
      unlisten?.();
    };
  }, []);
```

- [ ] **Step 6: Rework `openResult` to be flat-nav aware**

Replace the existing `openResult` and `handleKey` definitions with:

```tsx
  const totalFlatLength = changesVisibleRows.length + results.length;

  const openResult = useCallback(
    (globalIdx: number) => {
      if (!activeRoot) return;
      if (globalIdx < changesVisibleRows.length) {
        const row = changesVisibleRows[globalIdx];
        if (!row) return;
        const absPath = joinRootAndRel(activeRoot, row.file.path);
        invoke('open_file_viewer_window', {
          path: absPath,
          baseline: row.group === 'vsBase' ? 'mergeBaseDefault' : 'HEAD',
        }).catch((e) => console.error('open_file_viewer_window failed', e));
        return;
      }
      const resultIdx = globalIdx - changesVisibleRows.length;
      const entry = results[resultIdx];
      if (!entry) return;
      const absPath = joinRootAndRel(activeRoot, entry.rel_path);
      invoke('open_file_viewer_window', { path: absPath }).catch((e) => {
        console.error('open_file_viewer_window failed', e);
      });
    },
    [activeRoot, changesVisibleRows, results],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (query) setQuery('');
        else getCurrentWindow().close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, totalFlatLength - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        openResult(selectedIndex);
      }
    },
    [query, totalFlatLength, selectedIndex, openResult],
  );
```

- [ ] **Step 7: Render the section inside `fp-middle`**

In the JSX, inside `<div className="fp-middle">`, **after** `<SearchPane … />` and **before** the `{loadError ? … }` conditional block, add:

```tsx
          <ChangesSection
            rootPath={activeRoot}
            query={query}
            queryMode={parsed.mode}
            selectedGlobalIndex={selectedIndex}
            baseIndex={0}
            onOpen={(file, group) => {
              if (!activeRoot) return;
              const absPath = joinRootAndRel(activeRoot, file.path);
              invoke('open_file_viewer_window', {
                path: absPath,
                baseline: group === 'vsBase' ? 'mergeBaseDefault' : 'HEAD',
              }).catch((e) => console.error('open_file_viewer_window failed', e));
            }}
            onHover={setSelectedIndex}
            localCollapsed={changesCollapsed.local}
            vsBaseCollapsed={changesCollapsed.vsBase}
            onToggleCollapse={toggleChangesCollapse}
            refreshTick={refreshTick}
            onVisibleRowsChange={setChangesVisibleRows}
          />
```

- [ ] **Step 8: Shift `ResultsList` selectedIndex offset**

In the existing `<ResultsList … />` JSX, replace:

```tsx
              selectedIndex={selectedIndex}
              onHover={setSelectedIndex}
              onOpen={openResult}
```

with:

```tsx
              selectedIndex={selectedIndex - changesVisibleRows.length}
              onHover={(i) => setSelectedIndex(i + changesVisibleRows.length)}
              onOpen={(i) => openResult(i + changesVisibleRows.length)}
```

- [ ] **Step 9: Reset `selectedIndex` when section rows change**

Replace the existing `useEffect(() => setSelectedIndex(0), [query, activeRoot]);` with:

```tsx
  useEffect(() => setSelectedIndex(0), [query, activeRoot, changesVisibleRows.length]);
```

- [ ] **Step 10: Type-check and run the palette test suite**

```bash
cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | tail -5 && echo "---exit $?---"
```
Expected: `---exit 0---`.

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette 2>&1 | tail -15
```
Expected: all palette tests pass, including the new `ChangesSection.test.tsx`.

- [ ] **Step 11: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx
git commit -m "$(cat <<'EOF'
feat(file-palette): render ChangesSection above results

FilePaletteApp now renders ChangesSection between the search pane and
the regular results list. selectedIndex is a flat-nav index over
(visible Changes rows) + (search results); ArrowUp/Down walk the
combined list, Enter dispatches to whichever group is active.
Changes refetch on root switch and on window focus. Clicks on
vs-base rows open the viewer with baseline=mergeBaseDefault.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: CSS — `.fp-changes*` styles

**Files:**
- Modify: `src/BorgDock.Tauri/src/styles/file-palette.css`

- [ ] **Step 1: Append the section styles**

At the end of `src/styles/file-palette.css`, append:

```css
.fp-changes {
  border-bottom: 1px solid var(--color-separator);
  flex-shrink: 0;
  max-height: 45%;
  overflow-y: auto;
}

.fp-changes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px 4px 10px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.65;
}

.fp-changes-base {
  font-size: 10px;
  opacity: 0.7;
  font-family: 'Consolas', monospace;
  text-transform: none;
}

.fp-changes-subheader {
  display: block;
  width: 100%;
  text-align: left;
  padding: 4px 10px;
  background: transparent;
  border: none;
  color: inherit;
  font-size: 11px;
  opacity: 0.7;
  cursor: pointer;
}

.fp-changes-subheader:hover { opacity: 1; }

.fp-changes-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  width: 100%;
  padding: 4px 10px 4px 22px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  font-family: 'Consolas', monospace;
}

.fp-changes-row:hover,
.fp-changes-row--selected { background: var(--color-accent-subtle); }

.fp-changes-status {
  flex-shrink: 0;
  width: 14px;
  font-weight: bold;
  text-align: center;
}

.fp-changes-path {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  overflow-wrap: anywhere;
  line-height: 1.4;
}

.fp-changes-empty {
  padding: 8px 14px 12px 14px;
  opacity: 0.55;
  font-size: 11px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/BorgDock.Tauri/src/styles/file-palette.css
git commit -m "$(cat <<'EOF'
style(file-palette): add styles for ChangesSection

Section container (scrollable, max 45% of middle pane), Local /
vs-base subheaders with collapse glyphs, status-badge rows, and
empty/not-in-repo lines.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: End-to-end verification

No code changes. This is a smoke-test checklist to run in `npm run tauri dev` before handing back to the user.

- [ ] **Step 1: Start the dev app**

```bash
cd src/BorgDock.Tauri && npm run tauri dev
```

Wait until the main window is up. Open the File Palette via its existing hotkey.

- [ ] **Step 2: Verify the happy path for a clean worktree**

1. Pick a worktree root that is on `master` (or matches `origin/HEAD`) with no local changes.
2. Expect: section renders `Changes (0)`, "No changes on this branch".

- [ ] **Step 3: Verify local-only changes**

1. In another terminal, `echo x >> src/BorgDock.Tauri/package.json` in the selected worktree, plus `touch src/BorgDock.Tauri/scratch.tmp` to create an untracked file.
2. Click the palette window to refocus it — the section should refetch.
3. Expect: Local group lists `M package.json` and `? scratch.tmp`. vs-base stays empty (we're on the default branch).
4. Clean up the scratch file afterward.

- [ ] **Step 4: Verify vs-base on a feature branch**

1. Pick a worktree that's on a branch ahead of `origin/master` with committed changes.
2. Expect: `vs master` group lists all committed deltas. Local stays empty if the worktree is clean.
3. Make one local edit to a file already listed under `vs master`. After focus refresh: that file appears under Local only (dedup working).

- [ ] **Step 5: Verify filter + nav**

1. Type a substring that matches at least one changed file.
2. Expect: both Local and vs-base filter down; regular results list below also filters.
3. ArrowDown from the search input should land on the first Local row, then walk through vs-base, then into the regular results. `Enter` opens the selected row.

- [ ] **Step 6: Verify click → viewer baseline**

1. Click a Local row → viewer opens with `vs HEAD` segment active and the uncommitted diff visible.
2. Click a vs-base row → viewer opens with `vs master` segment active and the committed diff visible.

- [ ] **Step 7: Verify non-git root**

1. Add a custom file-palette root pointing at any non-git folder, select it.
2. Expect: section shows `Changes` header and `Not a git repo`. Regular file search still works.

- [ ] **Step 8: Verify collapse persistence**

1. Collapse `vs master`, close the palette window, reopen it.
2. Expect: `vs master` stays collapsed (persisted to settings).

- [ ] **Step 9: No console errors**

Keep the DevTools console open throughout — no red errors or unhandled promise rejections.

- [ ] **Step 10: Final summary back to the user**

State which tests + `cargo check` + `tsc` results are green, which manual steps were verified, and any warnings seen during dev.
