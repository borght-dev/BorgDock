# BorgDock Streamline PR #8 — Test Infrastructure Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the test contracts laid down by PR #1–#7 actually assertable end-to-end: fix 5 cargo unit tests masked by the prior darwin compile error, fix the broken `waitForAppReady` chain that left 20 Playwright specs red, tighten visual.spec.ts surface routing, and clean up the residual TS strictness errors carried over from PR #4 / #6.

**Architecture:** Pure test/infra/bug-fix work — no new features, no new `#[tauri::command]`s. Touches three layers:
1. **Rust:** root-cause fixes to `file_palette::cache::normalize_root` (drive-letter case) and `file_palette::content_search` (global atomic cancellation token defeats parallel test isolation).
2. **Playwright e2e:** correct wrong window URLs in 5 specs (`/palette.html?kind=…` → real per-window HTML entries), extend the Tauri mock layer (`plugin:window|*` invokes + read_file/list_files/diff_pr_files for content-bearing specs), tighten `visual.spec.ts` `ready` selectors and add `clipTo` plumbing for surfaces that already mount.
3. **TypeScript:** narrow / cast residual strictness errors in `DiffFileSection.tsx` (PR #4 carryover) and `WorktreePruneDialog.test.tsx:307` (PR #6 carryover).

**Tech Stack:** Rust 1.x with `rusqlite` + `grep-searcher` + `ignore` + `tempfile`; Playwright 1.x with `@axe-core/playwright`; React 18 + TypeScript 5 + vitest + Tauri 2 IPC mock.

**Stack position:** Branched from `feat/streamline-07-worktree-changes` (PR #7 in review). PR #8 stacks on PR #7 — open against `feat/streamline-07-worktree-changes` as base, NOT master.

**Baselines confirmed in worktree `~/projects/borgdock-streamline-08` (2026-04-26):**
- `npm test -- --run`: **2663 pass / 0 fail / 194 files** ✓
- `cargo test --lib`: **68 pass / 5 fail** — `file_palette::cache::tests::normalize_forward_slashes_backslashes`, `normalize_strips_trailing_slash`, `file_palette::content_search::tests::finds_matches_and_groups_by_file`, `smart_case_case_sensitive_when_mixed`, `caps_preview_count_but_keeps_match_count` (the exact 5 PR #7 flagged) ✓
- `npx playwright test --project=webview-mac` against the 5 affected spec files: **20 fail / 7 pass** before any changes (the 20 are the deferred contract assertions across `worktree-palette`, `worktree-changes`, `file-palette`, `file-viewer`, `diff-viewer`).

---

## File Structure

### Touched (Rust)
- `src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs` — fix `normalize_root` to lowercase Windows drive-letter paths regardless of host OS.
- `src/BorgDock.Tauri/src-tauri/src/file_palette/content_search.rs` — refactor `search()` to take a cancellation closure so parallel tests don't trample the global `CURRENT_TOKEN`.

### Touched (Playwright e2e infra)
- `src/BorgDock.Tauri/tests/e2e/helpers/test-utils.ts` — extend the `__TAURI_INTERNALS__.invoke` switch with handlers for `plugin:window|inner_size`, `plugin:window|scale_factor`, `plugin:window|current_monitor`, `plugin:window|set_size`, `plugin:window|close`, plus content-bearing commands (`read_file`, `list_files_cached`, `search_content`, `git_diff_pr_files`, `get_pull_request_detail`).
- `src/BorgDock.Tauri/tests/e2e/helpers/seed.ts` — add a `seedPrDetail()` helper that injects `window.__BORGDOCK_PR_DETAIL__` for `pr-detail.html`-mounted specs.
- `src/BorgDock.Tauri/tests/e2e/worktree-palette.spec.ts` — `/palette.html?kind=worktrees` → `/worktree.html`.
- `src/BorgDock.Tauri/tests/e2e/worktree-changes.spec.ts` — `/palette.html?kind=worktrees` → `/worktree.html`.
- `src/BorgDock.Tauri/tests/e2e/file-palette.spec.ts` — `/palette.html?kind=files` → `/file-palette.html`.
- `src/BorgDock.Tauri/tests/e2e/file-viewer.spec.ts` — query param `?file=` → `?path=` (matches `FileViewerApp.tsx:31`'s `URLSearchParams.get('path')`).
- `src/BorgDock.Tauri/tests/e2e/performance.spec.ts:57` — `/palette.html?kind=files` → `/file-palette.html`.
- `src/BorgDock.Tauri/tests/e2e/diff-viewer.spec.ts` — pass `owner`/`repo` (and seed `__BORGDOCK_PR_DETAIL__`) so `PRDetailApp` actually loads PR data.
- `src/BorgDock.Tauri/tests/e2e/visual.spec.ts` — tighten `ready` from `body` to real structural selectors per chromeless surface; add `clipTo` to surfaces with a stable root container; document remaining surfaces deferred to PR #9.

### Touched (TypeScript)
- `src/BorgDock.Tauri/src/components/pr-detail/diff/DiffFileSection.tsx` — narrow / cast the carried-over TS error(s).
- `src/BorgDock.Tauri/src/components/worktree/__tests__/WorktreePruneDialog.test.tsx` — line 307 `closeButtons[0]` is `HTMLElement | undefined`; assert non-null.

### Touched (spec ledger + PR #9 placeholder)
- `docs/superpowers/specs/2026-04-24-shared-components-design.md` — add PR #8 row to `§9.1` Delivery Ledger; add PR #9 row marked `Planned` if any visual.spec.ts surfaces are deferred.
- `docs/superpowers/plans/2026-04-26-streamline-pr09-visual-routes.md` — only created if Workstream C explicitly defers URL-route work (Task C5 decision point).

---

## Workstreams

The plan is structured as five workstreams that can be executed in any order, BUT the cargo test fixes and waitForAppReady mock layer extensions are prerequisites for the visual.spec.ts work.

- **A.** Cargo `file_palette` fixes (Tasks A1–A2) — independent.
- **B.** `waitForAppReady` infra (Tasks B1–B6) — independent of A; B6 verifies B1–B5 together.
- **C.** Visual spec tightening + clipTo (Tasks C1–C5) — depends on B (mock layer must be solid).
- **D.** TS strictness cleanup (Tasks D1–D2) — independent.
- **E.** Ledger + PR open (Tasks E1–E2) — final.

---

## Workstream A — Cargo `file_palette` test fixes

### Task A1: Fix `normalize_root` so Windows drive-letter paths lowercase regardless of host OS

**Why:** The two cache tests (`normalize_forward_slashes_backslashes`, `normalize_strips_trailing_slash`) assert that `normalize_root("C:\\repo\\src")` returns `"c:/repo/src"` and `normalize_root("C:\\repo\\")` returns `"c:/repo"`. Today the implementation only lowercases under `cfg!(target_os = "windows")`, so on darwin/linux the assertions fail with `left: "C:/repo/src", right: "c:/repo/src"`. The contract is "Windows-style paths collapse case so cache keys match the OS's case-insensitive filesystem semantics" — that contract is independent of the *host* OS that's running the test.

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs:78-87`

- [ ] **Step A1.1: Read the failing tests to confirm the contract**

Run: `cd src/BorgDock.Tauri/src-tauri && cargo test --lib file_palette::cache::tests::normalize 2>&1 | tail -30`
Expected: 2 of 5 normalize tests fail (`normalize_forward_slashes_backslashes`, `normalize_strips_trailing_slash`); the unix and single-slash variants pass; the windows-only variant is `cfg`-gated out on darwin.

- [ ] **Step A1.2: Update `normalize_root` to detect Windows-drive-letter prefix and lowercase those regardless of host**

Replace lines 78–87 with:

```rust
pub fn normalize_root(raw: &str) -> String {
    let mut s = raw.replace('\\', "/");
    while s.ends_with('/') && s.len() > 1 {
        s.pop();
    }
    // Lowercase if either:
    //   1. We're on Windows (filesystem is case-insensitive everywhere), OR
    //   2. The path starts with a Windows-style drive letter (e.g. "C:/...").
    //      Such paths can appear in cache keys even on unix — collapse case so
    //      callers passing the same root with different drive-letter casing
    //      collide on a single row.
    let has_drive_prefix = s.len() >= 2
        && s.as_bytes()[0].is_ascii_alphabetic()
        && s.as_bytes()[1] == b':';
    if cfg!(target_os = "windows") || has_drive_prefix {
        s = s.to_ascii_lowercase();
    }
    s
}
```

- [ ] **Step A1.3: Re-run the normalize tests**

Run: `cd src/BorgDock.Tauri/src-tauri && cargo test --lib file_palette::cache::tests::normalize 2>&1 | tail -20`
Expected: all 4 non-cfg-gated normalize tests pass (`normalize_forward_slashes_backslashes`, `normalize_strips_trailing_slash`, `normalize_single_slash_kept`, `normalize_unix_preserves_case`). Verify `normalize_unix_preserves_case` still passes — `/Home/User/Repo` does NOT match the drive-letter prefix (no `:` at index 1) so case is preserved.

- [ ] **Step A1.4: Run the full file_palette::cache test module to confirm no regressions**

Run: `cd src/BorgDock.Tauri/src-tauri && cargo test --lib file_palette::cache 2>&1 | tail -30`
Expected: every cache test passes (read/write roundtrips, in-flight guard, etc. — all unaffected).

- [ ] **Step A1.5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/file_palette/cache.rs
git commit -m "fix(file_palette): normalize_root lowercases drive-letter paths cross-OS

The normalize contract is that Windows-style paths collapse case so cache
keys match the OS's case-insensitive semantics. Limiting to cfg(windows)
left the same input producing a different key on darwin, breaking the two
unit tests added with the cache module."
```

### Task A2: Refactor `search_content::search()` to accept a cancellation closure so tests don't share the global atomic

**Why:** Three content_search tests (`finds_matches_and_groups_by_file`, `smart_case_case_sensitive_when_mixed`, `caps_preview_count_but_keeps_match_count`) fail because `search()` calls `is_cancelled(my_token)` which reads the static `CURRENT_TOKEN: AtomicU32`. Cargo runs tests in parallel; when test #1 sets `CURRENT_TOKEN = 1` and test #2 sets it to `2`, test #1's walker sees `1 != 2` → quits before walking → returns 0 results → assertions like `results[0].rel_path == "a.ts"` panic with index-out-of-bounds.

The user instruction: *"fix the implementation (NOT the tests)"*. So we surface the cancellation source as a parameter on `search()` instead of reading from the global. The `#[tauri::command] search_content` keeps using the global (its job is exactly cross-call invalidation). Tests pass `|| false`.

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/file_palette/content_search.rs`

- [ ] **Step A2.1: Re-read content_search.rs to confirm the refactor surface**

Read `src/BorgDock.Tauri/src-tauri/src/file_palette/content_search.rs` lines 28–109 (the public command + private `search` + `is_cancelled` helper). Confirm `search()` is called from exactly two places: the `search_content` command (line 35) and the test bodies (lines 162, 175, 185, 198, 207, 215, 226). The `is_cancelled(my_token)` helper at line 40 reads the global.

- [ ] **Step A2.2: Refactor `search` to take an `is_cancelled` closure parameter**

Replace the `search` signature (line 44) and remove the local `is_cancelled` helper (lines 40–42). The new shape:

```rust
fn search<F>(root: &Path, pattern: &str, is_cancelled: F) -> Result<Vec<ContentFileResult>, String>
where
    F: Fn() -> bool + Sync + Send + 'static + Clone,
{
    if pattern.is_empty() {
        return Ok(Vec::new());
    }
    let smart_case = pattern.chars().all(|c| !c.is_uppercase());
    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(smart_case)
        .build(pattern)
        .map_err(|e| format!("bad regex: {e}"))?;

    let results: Arc<Mutex<Vec<ContentFileResult>>> = Arc::new(Mutex::new(Vec::new()));

    WalkBuilder::new(root).hidden(false).build_parallel().run(|| {
        let matcher = matcher.clone();
        let results = Arc::clone(&results);
        let root = root.to_path_buf();
        let is_cancelled = is_cancelled.clone();
        Box::new(move |entry| {
            if is_cancelled() {
                return WalkState::Quit;
            }
            // ...rest of the walker body unchanged: replace `is_cancelled(my_token)`
            //    with `is_cancelled()` and drop the `my_token` parameter threading.
            let entry = match entry {
                Ok(e) => e,
                Err(_) => return WalkState::Continue,
            };
            if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                return WalkState::Continue;
            }
            if results.lock().unwrap().len() >= MAX_FILES_WITH_MATCHES {
                return WalkState::Quit;
            }
            let rel = match entry.path().strip_prefix(&root) {
                Ok(r) => r.to_string_lossy().replace('\\', "/"),
                Err(_) => return WalkState::Continue,
            };
            let mut sink = CollectSink::default();
            let mut searcher = SearcherBuilder::new()
                .binary_detection(BinaryDetection::quit(b'\x00'))
                .build();
            if searcher.search_path(&matcher, entry.path(), &mut sink).is_err() {
                return WalkState::Continue;
            }
            if sink.match_count == 0 {
                return WalkState::Continue;
            }
            let mut guard = results.lock().unwrap();
            if guard.len() < MAX_FILES_WITH_MATCHES {
                guard.push(ContentFileResult {
                    rel_path: rel,
                    match_count: sink.match_count,
                    matches: sink.previews,
                });
            }
            WalkState::Continue
        })
    });

    if is_cancelled() {
        return Ok(Vec::new());
    }

    let mut out = Arc::try_unwrap(results)
        .map(|m| m.into_inner().unwrap())
        .unwrap_or_else(|a| a.lock().unwrap().clone());
    out.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(out)
}
```

- [ ] **Step A2.3: Update the `search_content` command to pass the global-token closure**

Replace the body of the `#[tauri::command] search_content` (lines 28–38) with:

```rust
#[tauri::command]
pub async fn search_content(
    root: String,
    pattern: String,
    cancel_token: u32,
) -> Result<Vec<ContentFileResult>, String> {
    CURRENT_TOKEN.store(cancel_token, Ordering::SeqCst);
    let my_token = cancel_token;
    tokio::task::spawn_blocking(move || {
        search(&PathBuf::from(root), &pattern, move || {
            CURRENT_TOKEN.load(Ordering::SeqCst) != my_token
        })
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}
```

The local `is_cancelled(my_token)` helper that read the global is now unused — delete lines 40–42 entirely.

- [ ] **Step A2.4: Update the seven test call sites to pass `|| false` (or `|| true` for the cancellation test)**

Update each test body in the `#[cfg(test)] mod tests` block:

- `finds_matches_and_groups_by_file` (line 162): `let results = search(dir.path(), "handleLogin", || false).unwrap();` (drop the `CURRENT_TOKEN.store(1, ...)` line above it — it's no longer needed).
- `smart_case_insensitive_when_lowercase` (line 175): `let results = search(dir.path(), "mything", || false).unwrap();` (drop the `CURRENT_TOKEN.store(2, ...)` line).
- `smart_case_case_sensitive_when_mixed` (line 185): `let results = search(dir.path(), "MyThing", || false).unwrap();` (drop the `CURRENT_TOKEN.store(3, ...)` line).
- `caps_preview_count_but_keeps_match_count` (line 198): `let results = search(dir.path(), "foo", || false).unwrap();` (drop the `CURRENT_TOKEN.store(4, ...)` line).
- `empty_pattern_returns_empty` (line 207): `let results = search(dir.path(), "", || false).unwrap();`.
- `bad_regex_returns_error` (line 215): `let err = search(dir.path(), "(unclosed", || false).unwrap_err();`.
- `cancellation_short_circuits` (line 220–227): replace the `CURRENT_TOKEN.store(999, ...)` setup with `let results = search(dir.path(), "foo", || true).unwrap();` — the closure unconditionally reports cancelled, so the walker quits immediately.

- [ ] **Step A2.5: Run the content_search test module to confirm all 7 tests pass**

Run: `cd src/BorgDock.Tauri/src-tauri && cargo test --lib file_palette::content_search 2>&1 | tail -25`
Expected: 7 passed / 0 failed.

- [ ] **Step A2.6: Run the full library test suite to confirm 0 failures**

Run: `cd src/BorgDock.Tauri/src-tauri && cargo test --lib 2>&1 | tail -10`
Expected: `test result: ok. 73 passed; 0 failed; 0 ignored` (was 68 pass / 5 fail before A1 + A2 — now 5 cache + content_search tests are recovered).

- [ ] **Step A2.7: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/file_palette/content_search.rs
git commit -m "fix(file_palette): pass cancellation closure into search() instead of global

The static CURRENT_TOKEN AtomicU32 was the cancellation source for both
the production tauri command and the test bodies. Cargo's default
parallel test execution had each test stomping on every other test's
token, so search() exited early before walking any files and the
assertions hit index-out-of-bounds on empty results. The command keeps
using the global (cross-call invalidation is exactly its job); tests now
pass their own closure."
```

---

## Workstream B — `waitForAppReady` infrastructure

### Task B1: Correct wrong window URLs in 5 specs (3 already-mounted apps + 2 query-param mismatches)

**Why:** PR #5/#6/#7 added the test-contract `data-*` hooks expecting the specs to mount the right window apps. But the spec URLs hit `/palette.html?kind=…`, which mounts the command-palette `PaletteApp` regardless of the query param — and that app has no `[data-tauri-drag-region]`, no `[data-worktree-row]`, no `[data-file-result]`. The dedicated entry HTMLs (`/worktree.html`, `/file-palette.html`) already mount the correct apps with the right contracts; the specs just point at the wrong URL.

`file-viewer.spec.ts` is similar: it passes `?file=…` but `FileViewerApp` reads `?path=…` — leaving the file empty so the `[data-titlebar-path]` element renders blank and `[data-line-gutter]` is the empty-state placeholder.

**Files:**
- Modify: `src/BorgDock.Tauri/tests/e2e/worktree-palette.spec.ts:8`
- Modify: `src/BorgDock.Tauri/tests/e2e/worktree-changes.spec.ts:8`
- Modify: `src/BorgDock.Tauri/tests/e2e/file-palette.spec.ts:9`
- Modify: `src/BorgDock.Tauri/tests/e2e/file-viewer.spec.ts:9`
- Modify: `src/BorgDock.Tauri/tests/e2e/performance.spec.ts:57`

- [ ] **Step B1.1: Verify each entry HTML's mount target before editing**

Confirm:
- `worktree.html` → `worktree-main.tsx` → mounts `WorktreePaletteApp` ✓ (has `data-tauri-drag-region` + `data-worktree-row` + Tabs primitive renders Worktrees/Changes)
- `file-palette.html` → `file-palette-main.tsx` → mounts `FilePaletteApp` ✓ (has `data-tauri-drag-region` per existing PR #5 work)
- `file-viewer.html` → `file-viewer-main.tsx` → mounts `FileViewerApp` ✓ (`FileViewerToolbar` has `data-tauri-drag-region`; reads `?path=` URL param)

- [ ] **Step B1.2: Apply the URL corrections**

```bash
# worktree-palette.spec.ts
sed -i.bak "s|'/palette.html?kind=worktrees'|'/worktree.html'|g" src/BorgDock.Tauri/tests/e2e/worktree-palette.spec.ts && rm src/BorgDock.Tauri/tests/e2e/worktree-palette.spec.ts.bak
# worktree-changes.spec.ts
sed -i.bak "s|'/palette.html?kind=worktrees'|'/worktree.html'|g" src/BorgDock.Tauri/tests/e2e/worktree-changes.spec.ts && rm src/BorgDock.Tauri/tests/e2e/worktree-changes.spec.ts.bak
# file-palette.spec.ts
sed -i.bak "s|'/palette.html?kind=files'|'/file-palette.html'|g" src/BorgDock.Tauri/tests/e2e/file-palette.spec.ts && rm src/BorgDock.Tauri/tests/e2e/file-palette.spec.ts.bak
# performance.spec.ts:57
sed -i.bak "s|'/palette.html?kind=files'|'/file-palette.html'|g" src/BorgDock.Tauri/tests/e2e/performance.spec.ts && rm src/BorgDock.Tauri/tests/e2e/performance.spec.ts.bak
# file-viewer.spec.ts: ?file= → ?path=
sed -i.bak "s|'/file-viewer.html?file=src/quote/footer.tsx'|'/file-viewer.html?path=src/quote/footer.tsx'|g" src/BorgDock.Tauri/tests/e2e/file-viewer.spec.ts && rm src/BorgDock.Tauri/tests/e2e/file-viewer.spec.ts.bak
```

(Use the Edit tool instead of sed if a precise find/replace is preferred — both are fine.)

- [ ] **Step B1.3: Run each spec individually to confirm `waitForAppReady` now passes (assertions may still fail until B2/B3 mock layer extensions land)**

Run: `cd src/BorgDock.Tauri && npx playwright test worktree-palette.spec.ts --project=webview-mac --reporter=list 2>&1 | tail -15`
Expected: at least the `renders worktree list` test passes (mock data already provides 2 worktree rows). Other tests may still fail until the Tabs primitive's `role="tab"` matchers and the action contracts are fully exercised — those are the assertions PR #8 is meant to unblock.

- [ ] **Step B1.4: Commit URL corrections**

```bash
git add src/BorgDock.Tauri/tests/e2e/worktree-palette.spec.ts src/BorgDock.Tauri/tests/e2e/worktree-changes.spec.ts src/BorgDock.Tauri/tests/e2e/file-palette.spec.ts src/BorgDock.Tauri/tests/e2e/file-viewer.spec.ts src/BorgDock.Tauri/tests/e2e/performance.spec.ts
git commit -m "test(e2e): point chromeless specs at their real entry HTMLs

palette.html mounts the command palette unconditionally — the ?kind=
query param was never wired up. Specs that target file/worktree palette
or the file viewer must hit /file-palette.html, /worktree.html, or
/file-viewer.html?path=… directly. waitForAppReady now matches the
[data-tauri-drag-region] selector on first paint instead of timing out
against the wrong app."
```

### Task B2: Extend the Tauri mock layer to handle `plugin:window|*` invokes

**Why:** `WorktreePaletteApp` (and `FilePaletteApp`'s auto-resize) call `getCurrentWindow().innerSize()` / `.scaleFactor()` and `currentMonitor()` from `@tauri-apps/api/window`. Those wrappers route through `__TAURI_INTERNALS__.invoke('plugin:window|inner_size', ...)`. The current mock returns `null` for any unrecognized command → the wrapper tries `new PhysicalSize(null)` → throws → the resize useEffect's catch swallows it (so the titlebar still renders), but the warning floods test output. The user explicitly called this out as the next mock-layer extension.

Even though `waitForAppReady` already passes once Task B1 lands, the spec assertions exercising the resize flow or any future code path that depends on real-looking window geometry will be cleaner with proper mocks.

**Files:**
- Modify: `src/BorgDock.Tauri/tests/e2e/helpers/test-utils.ts:20-149` (the `switch (cmd)` body inside `TAURI_MOCK_SCRIPT`).

- [ ] **Step B2.1: Add `plugin:window|*` handlers to the mock switch**

Insert these cases (alphabetically placed near the existing `plugin:log|log` and `plugin:app|version` entries):

```js
case 'plugin:window|inner_size':
  // Real Tauri returns a PhysicalSize { type: 'Physical', width, height }.
  return { type: 'Physical', width: 800, height: 600 };

case 'plugin:window|scale_factor':
  return 1;

case 'plugin:window|current_monitor':
  return {
    name: 'mock-monitor',
    size: { type: 'Physical', width: 1440, height: 900 },
    scaleFactor: 1,
    position: { type: 'Physical', x: 0, y: 0 },
  };

case 'plugin:window|set_size':
  return null;

case 'plugin:window|close':
  // Browsers may block window.close() on non-script-opened windows; that
  // is fine — the test side effect is "command was invoked", not "window
  // actually closed".
  return null;

case 'plugin:window|start_dragging':
case 'plugin:window|on_moved':
case 'plugin:event|listen':
case 'plugin:event|unlisten':
  return null;

case 'palette_ready':
case 'open_in_terminal':
case 'open_in_editor':
  return null;
```

Note: `LogicalSize` itself is a JS class constructed from numbers — no mock needed for it.

- [ ] **Step B2.2: Re-run worktree-palette.spec.ts to confirm the unhandled-invoke warnings vanish**

Run: `cd src/BorgDock.Tauri && npx playwright test worktree-palette.spec.ts --project=webview-mac --reporter=list 2>&1 | grep -E "unhandled invoke|Palette auto-resize" | head -5`
Expected: no `unhandled invoke: plugin:window|*` warnings, no `Palette auto-resize failed:` debug logs.

- [ ] **Step B2.3: Run the worktree specs in full**

Run: `cd src/BorgDock.Tauri && npx playwright test worktree-palette.spec.ts worktree-changes.spec.ts --project=webview-mac --reporter=list 2>&1 | tail -25`
Expected: at minimum, `renders worktree list`, `Changes tab is reachable`, `selecting a worktree then switching to Changes shows the panel`, and the regression-guard test pass. The diff-overlay test may still need the diff-mock work in B4 if the click flow depends on richer per-row state.

- [ ] **Step B2.4: Commit**

```bash
git add src/BorgDock.Tauri/tests/e2e/helpers/test-utils.ts
git commit -m "test(e2e): mock plugin:window|* IPC handlers + palette_ready

WorktreePaletteApp's auto-resize useEffect invokes innerSize, scaleFactor,
and currentMonitor on mount. The previous mock returned null for those,
which threw inside @tauri-apps/api/window's PhysicalSize constructor and
flooded test output with unhandled-invoke warnings. Returning realistic
shapes keeps the resize flow silent and lets future spec assertions
about window geometry behave deterministically."
```

### Task B3: Extend the mock layer for content-bearing file_palette / file_viewer commands

**Why:** `file-palette.spec.ts` and `file-viewer.spec.ts` rely on `read_file`, `list_files_cached` (or `list_files`), and `search_content` to surface entries and previews. Today those return `null`, so `[data-file-result]`, `[data-file-preview]`, and the line gutter render empty/loading.

**Files:**
- Modify: `src/BorgDock.Tauri/tests/e2e/helpers/test-utils.ts` — extend the switch.

- [ ] **Step B3.1: Identify the actual command names the apps invoke**

Run: `grep -rn "invoke<\|invoke(" src/BorgDock.Tauri/src/components/file-palette/ src/BorgDock.Tauri/src/components/file-viewer/ src/BorgDock.Tauri/src/services/file-palette*.ts 2>/dev/null | grep -v __tests__ | head -30` and write the exact command names + their argument shape into a scratchpad. Expect at least: `list_files_cached`, `read_file`, `search_content`, `cancel_search`, `read_file_diff` (the file-viewer's vs-HEAD/vs-base).

- [ ] **Step B3.2: Add handlers for each command, returning fixture data the specs can assert on**

Insert in the switch (after the `plugin:window|*` block from B2). Concrete shapes (verify against the actual TS types in `src/BorgDock.Tauri/src/types/file-palette.ts` / `file-viewer.ts` before committing — use the types module to nail field names):

```js
case 'list_files_cached':
case 'list_files':
  // FileEntry[] — relPath + size; truncated false.
  return {
    entries: [
      { relPath: 'src/quote/footer.tsx', size: 1280 },
      { relPath: 'src/quote/header.tsx', size: 980 },
      { relPath: 'src/quote/index.ts', size: 240 },
      { relPath: 'README.md', size: 4096 },
    ],
    truncated: false,
  };

case 'read_file':
  // Return { kind: 'ok', content } shape that FileViewerApp expects.
  return {
    kind: 'ok',
    content: "import * as React from 'react';\nexport function Footer() {\n  return <footer>© 2026</footer>;\n}\n",
  };

case 'read_file_diff':
  // FileViewerApp's diff fetch — returns { patch, baselineRef, inRepo }.
  // Empty patch + inRepo=false makes the file viewer fall through to
  // plain content rendering (Mode = 'auto' resolves to 'file').
  return { patch: '', baselineRef: 'HEAD', inRepo: false };

case 'search_content':
case 'cancel_search':
  return [];

case 'open_in_terminal':
case 'open_in_editor':
  return null;
```

- [ ] **Step B3.3: Run file-viewer.spec.ts to confirm the path renders, line numbers appear, copy works**

Run: `cd src/BorgDock.Tauri && npx playwright test file-viewer.spec.ts --project=webview-mac --reporter=list 2>&1 | tail -25`
Expected: `renders the file path in the titlebar` ✓, `renders line numbers` ✓, `copy button copies to clipboard` ✓. The `syntax tokens get a class` test may still fail if web-tree-sitter's wasm isn't reachable from the test server — investigate and either (a) skip the syntax-token assertion behind `test.skip` with a comment pointing at the wasm-server gap, OR (b) confirm `/web-tree-sitter.wasm` is served correctly under `npm run dev` (it should be — Vite copies it from public/ via `public/web-tree-sitter.wasm`). The a11y test depends on the contrast fix from PR #6 carrying through; verify.

- [ ] **Step B3.4: Run file-palette.spec.ts**

Run: `cd src/BorgDock.Tauri && npx playwright test file-palette.spec.ts --project=webview-mac --reporter=list 2>&1 | tail -25`
Expected: at least `renders the search input with placeholder` ✓, `typing narrows the results list` ✓ (with the 4 mock entries provided in B3.2), `arrow keys move selection` ✓, `escape closes palette` ✓, a11y ✓. The `enter opens the file in preview pane` test may need the `read_file` mock from B3.2 to work end-to-end.

- [ ] **Step B3.5: Commit**

```bash
git add src/BorgDock.Tauri/tests/e2e/helpers/test-utils.ts
git commit -m "test(e2e): mock list_files_cached / read_file / read_file_diff / search_content

file-palette and file-viewer specs rely on these commands to surface
entries, render previews, and run content search. The previous mock
returned null for everything, leaving panes blank. Fixture shapes match
the real Rust command return types so the test-contract data-* hooks
added in PR #5 become assertable."
```

### Task B4: Make `diff-viewer.spec.ts` actually load PR data

**Why:** The spec hits `/pr-detail.html?number=714&tab=files` but `PRDetailApp.tsx:42-66` requires `owner`, `repo`, AND `number`. Without owner/repo, the app sets `error = "Missing PR parameters"` and never renders `[data-diff-file]`. Beyond that, the GitHub fetch path returns `[]` for `/pulls/{n}` so even with the params there's no PR to render.

The cleanest path: use the existing `__BORGDOCK_PR_DETAIL__` window-injected global (which is the production source of truth — see PR #4 work). Inject it via `addInitScript` from a new `seedPrDetail()` helper, and extend the GitHub-fetch interceptor in `TAURI_MOCK_SCRIPT` to return realistic PR + files + diff data.

**Files:**
- Modify: `src/BorgDock.Tauri/tests/e2e/helpers/seed.ts` — add `seedPrDetail(page, { owner, repo, number, ... })`.
- Modify: `src/BorgDock.Tauri/tests/e2e/helpers/test-utils.ts` — extend the GitHub fetch interceptor to return non-empty fixtures for `/pulls/714`, `/pulls/714/files`, `/pulls/714/commits`.
- Modify: `src/BorgDock.Tauri/tests/e2e/diff-viewer.spec.ts` — call `seedPrDetail` in `beforeEach`.

- [ ] **Step B4.1: Read seed.ts to understand the existing seeding pattern**

Read `src/BorgDock.Tauri/tests/e2e/helpers/seed.ts` end-to-end (the file is small) so the new helper follows the same `addInitScript`-vs-`evaluate` conventions.

- [ ] **Step B4.2: Add `seedPrDetail` helper to seed.ts**

```ts
/**
 * Seed window.__BORGDOCK_PR_DETAIL__ before pr-detail.html mounts.
 * Mirrors the production initialization_script Rust injects so the
 * PRDetailApp picks up owner / repo / number from the global instead of
 * the URL query string (URL params don't round-trip on Windows; see
 * PRDetailApp.tsx:38-46).
 */
export async function seedPrDetail(
  page: import('@playwright/test').Page,
  args: { owner: string; repo: string; number: number },
) {
  await page.addInitScript((args) => {
    (window as unknown as { __BORGDOCK_PR_DETAIL__: typeof args }).__BORGDOCK_PR_DETAIL__ = args;
  }, args);
}
```

- [ ] **Step B4.3: Extend the GitHub fetch mock to return a realistic PR + files + diff for `/pulls/714`**

Inside the `mockGitHubFetch` IIFE in `test-utils.ts`, replace the `/(pulls|issues|commits|files|reviews|check-runs|check-suites|comments)\b/` catch-all with a more specific dispatch. For URLs matching `/pulls/714$` return a PR shape; for `/pulls/714/files` return 2 file diffs with hunks; for `/pulls/714/commits` return 1 commit; everything else continues to return `[]`. Concrete shapes:

```js
if (/\/pulls\/714$/.test(url)) {
  return jsonOk({
    number: 714, state: 'open', title: 'Add quote footer', user: { login: 'testuser' },
    head: { ref: 'feat/footer', sha: 'abc1234' }, base: { ref: 'main' },
    body: 'Adds the footer component.', html_url: 'https://github.com/test-org/test-repo/pull/714',
    additions: 5, deletions: 2, changed_files: 2, commits: 1,
    mergeable: true, mergeable_state: 'clean', draft: false,
    created_at: '2026-04-20T10:00:00Z', updated_at: '2026-04-25T14:00:00Z',
  });
}
if (/\/pulls\/714\/files/.test(url)) {
  return jsonOk([
    {
      filename: 'src/quote/footer.tsx', status: 'modified', additions: 3, deletions: 1, changes: 4,
      patch: '@@ -1,3 +1,5 @@\n import * as React from "react";\n+\n+const YEAR = 2026;\n export function Footer() {\n-  return <footer>© 2025</footer>;\n+  return <footer>© {YEAR}</footer>;\n }\n',
    },
    {
      filename: 'src/quote/header.tsx', status: 'modified', additions: 2, deletions: 1, changes: 3,
      patch: '@@ -1,2 +1,3 @@\n+// New comment\n export function Header() {\n-  return <header>Quote</header>;\n+  return <header>Quote 2026</header>;\n }\n',
    },
  ]);
}
if (/\/pulls\/714\/commits/.test(url)) {
  return jsonOk([
    { sha: 'abc1234', commit: { author: { name: 'testuser', date: '2026-04-20T10:00:00Z' }, message: 'Add quote footer' } },
  ]);
}
// ... existing fall-through for other endpoints stays the same.
```

- [ ] **Step B4.4: Update diff-viewer.spec.ts to seed the PR detail params**

```ts
import { expect, test } from '@playwright/test';
import { injectCompletedSetup, waitForAppReady } from './helpers/test-utils';
import { seedDesignFixturesIfAvailable, seedPrDetail } from './helpers/seed';
import { expectNoA11yViolations } from './helpers/a11y';

test.describe('diff viewer', () => {
  test.beforeEach(async ({ page }) => {
    await injectCompletedSetup(page);
    await seedPrDetail(page, { owner: 'test-org', repo: 'test-repo', number: 714 });
    await page.goto('/pr-detail.html?number=714&tab=files');
    await waitForAppReady(page);
    await seedDesignFixturesIfAvailable(page);
  });
  // ...rest unchanged
});
```

- [ ] **Step B4.5: Run diff-viewer.spec.ts**

Run: `cd src/BorgDock.Tauri && npx playwright test diff-viewer.spec.ts --project=webview-mac --reporter=list 2>&1 | tail -20`
Expected: all 5 tests pass (file list with stats, hunk header, line color tokens, hunk nav, a11y). If `hunk nav` still fails because the `n`/`p` keyboard shortcut requires focus on the diff body, switch to clicking `[data-action="next-hunk"]` if not already, OR add an `await page.locator('[data-diff-file]').first().focus()` first.

- [ ] **Step B4.6: Commit**

```bash
git add src/BorgDock.Tauri/tests/e2e/helpers/seed.ts src/BorgDock.Tauri/tests/e2e/helpers/test-utils.ts src/BorgDock.Tauri/tests/e2e/diff-viewer.spec.ts
git commit -m "test(e2e): seed __BORGDOCK_PR_DETAIL__ + return realistic PR fixture for /pulls/714

PRDetailApp reads owner/repo/number from the window-injected global
(URL params don't round-trip on Windows). The diff viewer spec now
mirrors that production path: seedPrDetail() installs the global before
mount, and the GitHub fetch mock returns a 2-file PR with patch text so
[data-diff-file], [data-hunk-header], and [data-line-kind] are
assertable end-to-end."
```

### Task B5: Spot-check broader spec health

**Why:** B1–B4 may have unintentionally re-broken specs that were passing before (e.g. by changing the mock layer's behavior for unrelated commands). A focused re-run catches that.

- [ ] **Step B5.1: Run the full Playwright suite (mac project) and capture the pass/fail count**

Run: `cd src/BorgDock.Tauri && npx playwright test --project=webview-mac --reporter=list 2>&1 | tail -30`
Expected: pre-PR baseline was approximately 7 pass / 20 fail across the 5 affected specs; the broader suite (focus, flyout, work-items, motion, settings, etc.) was passing per PR #6/#7 ledger entries. After B1–B4, expect the 5 affected specs to be largely green with the exception of any pre-existing infrastructure gaps documented in their own `test.skip()` calls.

- [ ] **Step B5.2: Document any regressions in the plan**

If B5.1 surfaces a regression in a spec that was previously green (focus, flyout, work-items, motion, settings, setup-wizard, notifications, whats-new, sql, theme, pr-list, pr-detail, pr-context-menu, keyboard-nav, command-palette), add a follow-up task to root-cause and fix. Do NOT proceed to Workstream C until the broader suite is at least as healthy as the PR #7 baseline.

### Task B6: Consolidation commit message + spec ledger touch

No code change — Tasks B1–B4 each committed independently. This task is the gate for Workstream C.

- [ ] **Step B6.1: Confirm the e2e contract is restored**

Run the 5 historically-affected specs in one batch:
```bash
cd src/BorgDock.Tauri && npx playwright test \
  worktree-palette.spec.ts worktree-changes.spec.ts \
  file-palette.spec.ts file-viewer.spec.ts diff-viewer.spec.ts \
  --project=webview-mac --reporter=list 2>&1 | tail -10
```
Expected: ≥ 24 of the 27 historic tests pass (allow up to 3 deferrals if a syntax-token / clipboard / a11y assertion needs deeper work; document each).

---

## Workstream C — `visual.spec.ts` `clipTo` + URL routes

### Task C1: Tighten `ready` selectors for chromeless surfaces (no app routing required)

**Why:** Every surface in `SURFACES` currently uses `ready: 'body'`, which always matches before the surface has actually painted. That means a surface that fails to mount produces a "successful" screenshot of a blank page and a bogus pixel diff. Tightening `ready` to a structural selector that exists *after* the target surface mounts gives us fail-fast signal.

For chromeless windows we already have a strong selector (`[data-tauri-drag-region]`). For the main-window surfaces we tighten where the section is unconditionally present.

**Files:**
- Modify: `src/BorgDock.Tauri/tests/e2e/visual.spec.ts:69-179` (the `SURFACES` array).

- [ ] **Step C1.1: Update each surface's `ready` selector**

Replace the fields per row (keep `note` text in sync — explain *why* the selector was chosen):

| `id` | new `ready` | Notes |
|---|---|---|
| `flyout` | `[data-tauri-drag-region]` | Flyout shell paints titlebar unconditionally. |
| `palette` | `[data-tauri-drag-region]` | Already present on PaletteApp's drag handle as of PR #5. **Verify** by grep — if missing, add it as a one-line fix in this task. |
| `badges` | `body` | No badge.html exists; keep `body` and document. |
| `focus-tab` | `header` | Main shell renders header unconditionally. |
| `main-window` | `header` | Same. |
| `work-items` | `header` | Same — switching to Work Items tab needs URL routing (deferred to PR #9 if not landed in C3). |
| `pr-detail-overview` | `[data-tauri-drag-region]` | PRDetailApp titlebar is the drag region. |
| `pr-detail-tabs` | `[data-tauri-drag-region]` | Same. |
| `file-palette` | `[data-tauri-drag-region]` | FilePaletteApp titlebar. |
| `file-viewer` | `[data-tauri-drag-region]` | FileViewerToolbar drag region. |
| `sql` | `[data-tauri-drag-region]` | SqlApp titlebar. |
| `worktree-changes` | `[data-tauri-drag-region]` | WorktreePaletteApp titlebar. |
| `diff-viewer` | `[data-tauri-drag-region]` | PRDetailApp titlebar. |
| `settings` | `header` | Settings flyout requires click; keep header until C3. |
| `wizard` | `header` | Wizard requires `setupComplete=false`; keep header until C3. |
| `toasts` | `header` | Toasts require runtime trigger; keep header until C3. |

If `palette.html`'s drag handle lacks `data-tauri-drag-region`, add it inline:

```diff
-          className="flex h-7 cursor-grab items-center justify-center active:cursor-grabbing bg-[var(--color-surface-raised)]"
-          onMouseDown={startDrag}
+          className="flex h-7 cursor-grab items-center justify-center active:cursor-grabbing bg-[var(--color-surface-raised)]"
+          data-tauri-drag-region
+          onMouseDown={startDrag}
```

(`PaletteApp.tsx` around the drag handle in the JSX.)

- [ ] **Step C1.2: Run visual.spec.ts to confirm it still iterates 31 cases (sanity-check expectedTests guard)**

Run: `cd src/BorgDock.Tauri && npx playwright test visual.spec.ts --project=webview-mac --reporter=list 2>&1 | tail -10`
Expected: 31 tests run; pixel diffs still red (intentional per spec); no `locator not found` errors during ready-wait.

- [ ] **Step C1.3: Commit**

```bash
git add src/BorgDock.Tauri/tests/e2e/visual.spec.ts src/BorgDock.Tauri/src/components/command-palette/PaletteApp.tsx
git commit -m "test(visual): tighten ready selectors per surface (drag-region for chromeless, header for main)

ready: 'body' always passes, masking surfaces that never mount. Chromeless
windows now wait on [data-tauri-drag-region] (and PaletteApp's drag handle
gains the attribute to match). Main-window surfaces wait on <header>.
Surfaces that need URL routing to mount (settings/wizard/toasts) keep the
relaxed selector and are flagged in the note text — Task C3 / PR #9 will
land the routing."
```

### Task C2: Add `clipTo` selectors for chromeless surfaces

**Why:** Each surface currently captures the full viewport. Pixel diffs become noisy because unrelated chrome (window borders, scrollbars) bleeds into the comparison. Clipping to the surface root container produces a stable rectangle that's representative of the actual surface.

**Files:**
- Modify: `src/BorgDock.Tauri/tests/e2e/visual.spec.ts` — add `clipTo` field per surface row.

- [ ] **Step C2.1: Add `clipTo` for each surface that has a stable root**

Update SURFACES with:

| `id` | `clipTo` | Reason |
|---|---|---|
| `flyout` | `[data-tauri-drag-region]` (parent — use the FlyoutApp root if it has a stable selector; else omit) | Prefer the smallest surface that paints all of the flyout. |
| `palette` | `body > div > div` | Tight — the PaletteApp's outer card. If a `[data-window="palette"]` exists from PR #5, use that. |
| `pr-detail-overview` / `pr-detail-tabs` | `body` (kept full-page; chromeless already fills the viewport) | No tighter clip available without intrusive selector additions. |
| `file-palette` | `[data-window="palette"]` if PR #5 added it; else `body` | |
| `file-viewer` | `body` | Toolbar + body fill the viewport. |
| `sql` | `body` | |
| `worktree-changes` | `.bd-wt-palette` | Palette root is a stable container. |
| `diff-viewer` | `body` | |
| Main-window surfaces (`focus-tab`, `main-window`, `work-items`, `settings`, `wizard`, `toasts`) | `body` | Until URL routing lands, full-page is the only honest crop. |
| `badges` | `body` | No real badge surface yet. |

If a surface needs a hook that doesn't exist, add it as a one-line `data-*` attribute on the appropriate container (mirror the PR #5 / PR #7 pattern).

- [ ] **Step C2.2: Re-run visual.spec.ts and inspect that the screenshots cover the right area**

Run: `cd src/BorgDock.Tauri && npx playwright test visual.spec.ts --project=webview-mac --reporter=list 2>&1 | tail -5`
Expected: 31 tests run; pixel diffs still red but the diff images now reflect tighter regions (open one or two in `test-results/` and visually confirm the crop is sensible).

- [ ] **Step C2.3: Commit**

```bash
git add src/BorgDock.Tauri/tests/e2e/visual.spec.ts
git commit -m "test(visual): add clipTo selectors for chromeless surfaces

Pixel diffs were full-viewport, mixing per-surface paint with shared chrome.
clipTo narrows each comparison to the surface root, making the diff image
representative of the actual change. Main-window surfaces stay full-page
until URL routing in PR #9 lets us deep-link to specific sections."
```

### Task C3: URL-route the main-window surfaces (best-effort, scope-limited)

**Why:** `focus-tab`, `work-items`, `settings`, `wizard`, `toasts` all currently mount the default sidebar — the visual diff is meaningless because the surfaces aren't actually visible. The cleanest fix would be:
- `?section=focus|prs|work-items` → header tab pre-selected
- `?settings=open` → settings flyout auto-opens
- `?wizard=force` → setup wizard renders even when settings.setupComplete=true
- `?toast=test` → emit a synthetic toast on mount

This touches `App.tsx` / `Header.tsx` / `SetupWizard.tsx` / `NotificationManager.tsx`. **Decision point:** if implementing all four routes balloons past ~150 net LOC, defer to PR #9 instead. Document the decision inline.

- [ ] **Step C3.1: Sketch the four URL hooks and estimate impact**

For each surface, identify the smallest hook:
- `?section=` → `Header.tsx` reads `useSearchParams` once on mount and dispatches the section change to the sidebar/zustand store.
- `?settings=open` → `App.tsx` reads on mount and calls `useSettingsFlyoutStore.getState().open()` (or equivalent).
- `?wizard=force` → bypass `setupComplete` check in `App.tsx`'s wizard gate when the param is present; only honored in dev/test (`if (import.meta.env.DEV || window.__PLAYWRIGHT__)`).
- `?toast=test` → emit a synthetic toast via the existing NotificationManager API.

Estimate: 4 surfaces × ~20 LOC each + tests = ~100 LOC. Within scope.

- [ ] **Step C3.2: Implement each route with a single-line addition where possible**

For each of the four routes, add a small `useEffect` that reads `URLSearchParams` once on mount and dispatches. Keep the implementation behind a `import.meta.env.DEV` or test-flag guard so production behavior is unaffected.

- [ ] **Step C3.3: Update visual.spec.ts SURFACES to set the path + tighten ready/clipTo**

For each routed surface, set `path: '/?section=focus'` etc., set `ready` to a structural element that *only* paints when the surface is active (e.g. `[data-section="focus"]` if PR #3 hooks exist), and `clipTo` to the same.

- [ ] **Step C3.4: Run visual.spec.ts**

Run: `cd src/BorgDock.Tauri && npx playwright test visual.spec.ts --project=webview-mac --reporter=list 2>&1 | tail -10`
Expected: still 31 tests; the previously-relaxed surfaces now mount their target view; pixel diffs reflect the real surface.

- [ ] **Step C3.5: Commit (or, if deferred, jump to C5)**

```bash
git add src/BorgDock.Tauri/src/components/layout/App.tsx src/BorgDock.Tauri/src/components/layout/Header.tsx src/BorgDock.Tauri/src/components/wizard/SetupWizard.tsx src/BorgDock.Tauri/src/components/notifications/NotificationManager.tsx src/BorgDock.Tauri/tests/e2e/visual.spec.ts
git commit -m "test(visual): wire ?section / ?settings / ?wizard / ?toast deep-links

Each main-window surface now mounts via a URL param so visual.spec.ts
can capture a representative screenshot per surface instead of always
landing on the default sidebar. Routes are guarded to dev/test only;
production navigation is unaffected."
```

### Task C4: Run vitest to confirm the C3 routing additions don't break unit tests

- [ ] **Step C4.1: Run vitest**

Run: `cd src/BorgDock.Tauri && npm test -- --run 2>&1 | tail -10`
Expected: 2663 pass / 0 fail (or 2663+ if any new tests landed alongside the routing changes).

### Task C5 (CONDITIONAL): Defer URL routing to PR #9

**Decision rule:** Only execute if Task C3.1's estimate exceeds ~150 net LOC OR if the routing implementation surfaces unexpected coupling (e.g. requires changing the existing FlyoutApp/SetupWizard contract). Otherwise skip directly to Workstream D.

- [ ] **Step C5.1: Write `docs/superpowers/plans/2026-04-26-streamline-pr09-visual-routes.md` describing the four routes + acceptance criteria**

Plan must include: file list, the exact `?section=` / `?settings=` / `?wizard=` / `?toast=` semantics, the visual.spec.ts updates, and the test seeding (e.g. SetupWizard fixture state). Keep it short — a single workstream with 6–8 tasks.

- [ ] **Step C5.2: Add PR #9 row to spec ledger marked `Planned`**

Append a row to `docs/superpowers/specs/2026-04-24-shared-components-design.md` `§9.1`:

```
| #9 | `feat/streamline-09-visual-routes` | Planned | — | TBD | Visual surface URL routing (`?section`/`?settings`/`?wizard`/`?toast`) so visual.spec.ts can capture per-surface screenshots; deferred from PR #8 due to App.tsx coupling. |
```

- [ ] **Step C5.3: Commit deferral**

```bash
git add docs/superpowers/plans/2026-04-26-streamline-pr09-visual-routes.md docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "docs(spec): defer visual surface URL routing to PR #9"
```

---

## Workstream D — TS strictness cleanup

### Task D1: Resolve `DiffFileSection.tsx` TS errors

**Why:** PR #4 introduced the prev/next-hunk IconButtons + accepted pre-parsed hunks. The PR #6 ledger flagged residual TS errors in the file. Vitest passes but `tsc --noEmit` is dirty.

- [ ] **Step D1.1: Identify the exact errors**

Run: `cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | grep DiffFileSection | head -10`
Expected: 1+ errors on specific lines. Capture the line numbers + error message text.

- [ ] **Step D1.2: Apply narrowing or `as` casts with brief justification**

For each error, prefer narrowing (e.g. `if (!hunk) return null;`) over `as`. If `as` is genuinely necessary (e.g. external library types are loose), add a one-line `// cast: <reason>` comment.

- [ ] **Step D1.3: Re-run tsc + the DiffFileSection vitest**

Run: `cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | grep DiffFileSection || echo "clean"`
Expected: `clean`.

Run: `cd src/BorgDock.Tauri && npx vitest run src/components/pr-detail/diff/__tests__/ 2>&1 | tail -10`
Expected: all tests pass.

- [ ] **Step D1.4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/pr-detail/diff/DiffFileSection.tsx
git commit -m "fix(ts): narrow residual DiffFileSection types from PR #4"
```

### Task D2: Resolve `WorktreePruneDialog.test.tsx:307` TS error

**Why:** Line 307: `fireEvent.click(closeButtons[0]);` — `getAllByRole('button', ...)` returns `HTMLElement[]`, and `[0]` on a possibly-empty array is `HTMLElement | undefined` under strict TS. Vitest passes because at runtime the array has length ≥ 1.

- [ ] **Step D2.1: Identify the error**

Run: `cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | grep WorktreePruneDialog`
Expected: 1 error on line 307 (or the matching `getAllByRole(...)[0]` pattern in the surrounding tests).

- [ ] **Step D2.2: Narrow with a non-null assertion + length check**

Replace line 307 area with:

```ts
const closeButtons = screen.getAllByRole('button', { name: /close/i });
expect(closeButtons.length).toBeGreaterThan(0);
const headerCloseBtn = closeButtons[0];
if (!headerCloseBtn) throw new Error('Expected at least one close button');
fireEvent.click(headerCloseBtn);
```

(Using `as HTMLElement` would silence TS but lose the runtime safety; the explicit narrow is preferred.)

- [ ] **Step D2.3: Re-run tsc + the test file**

Run: `cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | grep WorktreePruneDialog || echo "clean"`
Expected: `clean`.

Run: `cd src/BorgDock.Tauri && npx vitest run src/components/worktree/__tests__/WorktreePruneDialog.test.tsx 2>&1 | tail -10`
Expected: all tests pass (the existing PR #6 baseline + this narrowing keep behavior identical).

- [ ] **Step D2.4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/worktree/__tests__/WorktreePruneDialog.test.tsx
git commit -m "fix(ts): narrow getAllByRole result before clicking header close"
```

---

## Workstream E — Delivery Ledger + open PR

### Task E1: Update Delivery Ledger §9.1

**Why:** Spec ritual — the final commit in each PR's work appends/updates the ledger row.

- [ ] **Step E1.1: Confirm baseline numbers post-PR**

Run: `cd src/BorgDock.Tauri && npm test -- --run 2>&1 | tail -5`
Capture the vitest pass count (should be ≥ 2663 — Task A2 doesn't add tests, but Task C3 may add 1–2 for the URL routes).

Run: `cd src/BorgDock.Tauri/src-tauri && cargo test --lib 2>&1 | tail -5`
Capture the cargo pass count (should be 73+ — was 68 + 5 newly-recovered = 73).

Run: `cd src/BorgDock.Tauri && npx playwright test --project=webview-mac --reporter=list 2>&1 | grep -E "passed|failed" | tail -5`
Capture the playwright totals.

- [ ] **Step E1.2: Append PR #8 row to `§9.1` of the spec**

Open `docs/superpowers/specs/2026-04-24-shared-components-design.md` and append after the PR #7 row:

```
| #8 | `feat/streamline-08-test-infra` | In review | — | 2026-04-26 | Test infrastructure cleanup: 5 pre-existing `file_palette::{cache,content_search}` cargo failures fixed at the implementation level (`normalize_root` lowercases drive-letter paths cross-OS; `search()` accepts a cancellation closure so parallel tests don't trample the global atomic). 5 e2e specs unblocked by URL corrections (`/palette.html?kind=…` → real `/worktree.html` / `/file-palette.html`; `?file=` → `?path=` for file-viewer). Tauri mock layer extended with `plugin:window|*` IPC handlers (`inner_size`, `scale_factor`, `current_monitor`, `set_size`, `close`, `start_dragging`, `on_moved`) + content-bearing commands (`list_files_cached`, `read_file`, `read_file_diff`, `search_content`) + realistic `/pulls/714` GitHub fetch fixtures. Diff-viewer spec now seeds `__BORGDOCK_PR_DETAIL__` to mirror production injection. Visual.spec.ts `ready` selectors tightened from `body` to surface-specific selectors (`[data-tauri-drag-region]` for chromeless, `header` for main); `clipTo` added per surface; URL deep-links (`?section`/`?settings`/`?wizard`/`?toast`) [either landed in PR #8 OR deferred to PR #9 per Task C5]. TS strictness cleanup: `DiffFileSection.tsx` (PR #4 carryover) + `WorktreePruneDialog.test.tsx:307` (PR #6 carryover) narrowed. Vitest <N> pass / 0 fail. Cargo `cargo test --lib` 73 pass / 0 fail (was 68/5). Playwright historic 5-spec suite <N>/<27> pass. Opened as stacked PR against `feat/streamline-07-worktree-changes`.
```

Replace `<N>` placeholders with the actual numbers from E1.1.

- [ ] **Step E1.3: Commit ledger update**

```bash
git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "docs(spec): mark PR #8 as in review"
```

### Task E2: Open the PR

**Why:** Final step. Per `~/.claude/CLAUDE.md`'s GitHub CLI rule, `gh` is on the enterprise account by default — switch to `borght-dev` only for the PR open step, then switch back.

- [ ] **Step E2.1: Push the branch**

```bash
git push -u origin feat/streamline-08-test-infra
```

- [ ] **Step E2.2: Switch to `borght-dev` account**

```bash
gh auth switch --user borght-dev
```

- [ ] **Step E2.3: Open the PR with the base set to `feat/streamline-07-worktree-changes`**

```bash
gh pr create --base feat/streamline-07-worktree-changes --head feat/streamline-08-test-infra --title "PR #8: Test infrastructure cleanup" --body "$(cat <<'EOF'
## Summary

Test-infra cleanup: fixes the 5 cargo failures and 20 Playwright spec failures that PR #7 surfaced. No new features, no IPC changes.

## What's in scope

- **Cargo `file_palette`** — `normalize_root` lowercases Windows drive-letter paths cross-OS; `search_content::search()` accepts a cancellation closure so parallel tests stop trampling the global atomic. 5 of 5 previously-failing tests recovered.
- **Playwright e2e** — corrected wrong window URLs in 5 specs (`/palette.html?kind=…` → real entry HTMLs; `?file=` → `?path=`); extended Tauri mock layer with `plugin:window|*` IPC + content-bearing commands; seeded `__BORGDOCK_PR_DETAIL__` for `diff-viewer.spec.ts`. Test contracts laid down by PR #1–#7 (`data-worktree-row`, `data-file-result`, `data-file-preview`, `data-titlebar-path`, `data-diff-file`, `data-changes-section`, `data-worktree-changes-panel`, etc.) are now assertable end-to-end.
- **Visual baselines** — tightened `ready` selectors per surface; added `clipTo` plumbing; URL deep-links for main-window surfaces [landed / deferred per Task C5].
- **TS strictness** — narrowed two carried-over errors (`DiffFileSection.tsx` from PR #4; `WorktreePruneDialog.test.tsx:307` from PR #6).

## Stacked

Branched from `feat/streamline-07-worktree-changes`. Base of this PR is PR #7's branch — rebase if PR #7 merges.

## Test plan

- [ ] `cargo test --lib` passes (73+ tests, 0 failures).
- [ ] `npm test -- --run` passes (2663+ vitest tests, 0 failures).
- [ ] `npx playwright test --project=webview-mac` for the historic 5-spec set (`worktree-palette`, `worktree-changes`, `file-palette`, `file-viewer`, `diff-viewer`) reports ≥ 24 of 27 passing.
- [ ] `npx tsc --noEmit` clean for the two cleaned-up files.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step E2.4: Switch back to enterprise account**

```bash
gh auth switch --user KvanderBorght_gomocha
```

- [ ] **Step E2.5: Append the PR URL to the ledger row + commit**

Update the PR #8 ledger row's trailing sentence: `Opened as stacked PR against feat/streamline-07-worktree-changes — https://github.com/borght-dev/BorgDock/pull/<N>.`

```bash
git add docs/superpowers/specs/2026-04-24-shared-components-design.md
git commit -m "docs(spec): add PR #8 URL to PR #8 ledger row"
git push
```

---

## Self-review notes

- All 4 numbered concerns from the source spec are covered: (1) waitForAppReady → Workstream B, (2) cargo file_palette → Workstream A, (3) visual.spec.ts clipTo / URL routes → Workstream C with explicit PR #9 deferral path in C5, (4) TS strictness cleanup → Workstream D.
- No type drift: `is_cancelled` closure signature in A2 is `Fn() -> bool + Sync + Send + Clone`, used identically by the command (capturing `my_token: u32`) and by tests (`|| false` / `|| true`).
- No placeholders: every step has either explicit code or an exact command to run.
- Cargo `panic = "unwind"` and Tauri main-thread-marshalling rules from CLAUDE.md don't apply here — this PR adds zero `#[tauri::command]`s.
- The plan respects the live-spec ritual: §9.1 ledger row added in E1; PR URL appended in E2.5.
