# File Palette v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the File Palette window in line with the v2 design — inline diff preview, scope chips, vs HEAD/main/Both Changes toggle, worktree change badges, shared chrome, functional find-in-file — without breaking the existing 3-pane skeleton.

**Architecture:** Compose existing primitives (`WindowTitleBar`, `WindowStatusBar`, `SplitDiffView`/`UnifiedDiffView`, `FilePaletteCodeView`, `git_file_diff`) into a redesigned palette. Selection becomes a discriminated union derived from the current flat selectedIndex, so the preview pane can route `kind='diff'` to an inline diff view and `kind='file'` to the existing code viewer. Backend extends `git_changed_files` with per-file numstat. Window default size moves to 1280×760, user-resizable.

**Tech Stack:** React + TypeScript (Vite), Vitest + @testing-library/react, Tauri 2 (Rust commands), `@codemirror/*` is NOT used by `FilePaletteCodeView` (custom DOM line renderer).

**Spec:** `docs/superpowers/specs/2026-04-30-file-palette-v2-design.md`

---

## Task 1: Extend `ChangedFile` Rust struct with numstat fields

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/git/diff.rs`

- [ ] **Step 1: Add numstat parser helper + failing test**

Add to `src/BorgDock.Tauri/src-tauri/src/git/diff.rs` inside the existing `mod tests`:

```rust
#[test]
fn parses_numstat_plain_modification() {
    let bytes = b"14\t6\tsrc/foo.ts\0";
    let map = parse_numstat(bytes);
    let stats = map.get("src/foo.ts").expect("present");
    assert_eq!(stats.0, 14);
    assert_eq!(stats.1, 6);
}

#[test]
fn parses_numstat_rename_three_records() {
    // Renames in -z mode: "<add>\t<del>\t\0<old>\0<new>\0"
    let bytes = b"5\t2\t\0src/old.ts\0src/new.ts\0";
    let map = parse_numstat(bytes);
    let stats = map.get("src/new.ts").expect("present");
    assert_eq!(stats.0, 5);
    assert_eq!(stats.1, 2);
}

#[test]
fn parses_numstat_binary_uses_zero() {
    // git emits "-\t-\t<path>" for binary files
    let bytes = b"-\t-\timg.png\0";
    let map = parse_numstat(bytes);
    let stats = map.get("img.png").expect("present");
    assert_eq!(stats.0, 0);
    assert_eq!(stats.1, 0);
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib parses_numstat 2>&1 | tail -10
```

Expected: FAIL — `parse_numstat` is not defined.

- [ ] **Step 3: Implement `parse_numstat` and extend `ChangedFile`**

In `src/BorgDock.Tauri/src-tauri/src/git/diff.rs`, change the `ChangedFile` struct:

```rust
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
    pub old_path: Option<String>,
    pub additions: u32,
    pub deletions: u32,
}
```

Add the parser above `parse_name_status`:

```rust
/// Parse `git diff --numstat -z` output into a path → (additions, deletions) map.
///
/// Plain rows: "<add>\t<del>\t<path>\0".
/// Rename rows: "<add>\t<del>\t\0<old_path>\0<new_path>\0" (the path field is empty
///   immediately after the second tab, then the next two NUL-records carry the
///   old and new paths).
/// Binary files: "-\t-\t<path>" — counted as 0/0.
pub fn parse_numstat(bytes: &[u8]) -> std::collections::HashMap<String, (u32, u32)> {
    let mut out = std::collections::HashMap::new();
    let records: Vec<&[u8]> = bytes.split(|b| *b == 0).collect();
    let mut i = 0;
    while i < records.len() {
        let rec = records[i];
        if rec.is_empty() {
            i += 1;
            continue;
        }
        // Parse "<add>\t<del>\t<rest>" out of the leading record.
        let parts: Vec<&[u8]> = rec.splitn(3, |b| *b == b'\t').collect();
        if parts.len() < 3 {
            i += 1;
            continue;
        }
        let parse_count = |b: &[u8]| -> u32 {
            std::str::from_utf8(b).ok()
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0)
        };
        let add = parse_count(parts[0]);
        let del = parse_count(parts[1]);
        let trailing = parts[2];
        if trailing.is_empty() {
            // Rename: next two records are old, new.
            let new_path = records.get(i + 2)
                .map(|b| String::from_utf8_lossy(b).to_string())
                .unwrap_or_default();
            if !new_path.is_empty() {
                out.insert(new_path, (add, del));
            }
            i += 3;
        } else {
            let path = String::from_utf8_lossy(trailing).to_string();
            out.insert(path, (add, del));
            i += 1;
        }
    }
    out
}
```

Then update every existing `ChangedFile { path, status, old_path }` literal in this file (search for `ChangedFile {`) to add `additions: 0, deletions: 0`. There are five such literals in `parse_name_status`.

- [ ] **Step 4: Run the new tests**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib parses_numstat 2>&1 | tail -10
```

Expected: PASS, all 3 tests.

- [ ] **Step 5: Verify existing tests still pass**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib parse_name_status 2>&1 | tail -10
```

Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/git/diff.rs
git commit -m "feat(git): add numstat parser, extend ChangedFile with additions/deletions"
```

---

## Task 2: Wire numstat into `compute_changed_files`

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/git/diff.rs`

- [ ] **Step 1: Add a failing integration test asserting numstat fields populate**

Append this test to the existing `mod tests` in `diff.rs`:

```rust
#[test]
fn changed_files_populates_additions_and_deletions() {
    let tmp = tempfile::tempdir().unwrap();
    init_test_repo(tmp.path());

    // Local modification: add 3 lines, remove 1.
    fs::write(tmp.path().join("seed.txt"), "line1\nline2\nline3\nline4\n").unwrap();
    git_in(tmp.path(), &["add", "seed.txt"]);
    git_in(tmp.path(), &["commit", "-qm", "expand seed"]);
    fs::write(tmp.path().join("seed.txt"), "line1\nline2\nline3\nline4\nline5\n").unwrap();

    let result = compute_changed_files(tmp.path().to_string_lossy().as_ref()).unwrap();
    let seed = result.local.iter().find(|f| f.path == "seed.txt").expect("seed.txt in local");
    assert_eq!(seed.additions, 1);
    assert_eq!(seed.deletions, 0);
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib changed_files_populates 2>&1 | tail -10
```

Expected: FAIL — `additions` is always 0.

- [ ] **Step 3: Inject numstat into `compute_changed_files`**

In `compute_changed_files`, after `let local = parse_name_status(&status_out.stdout, NameStatusMode::Status);` add:

```rust
    // Numstat for local: working tree vs HEAD covers staged + unstaged.
    let local_numstat_out = run_git_raw(
        &toplevel,
        &["diff", "--numstat", "-z", "HEAD", "--"],
    )?;
    let local_numstat = if local_numstat_out.status.success() {
        parse_numstat(&local_numstat_out.stdout)
    } else {
        std::collections::HashMap::new()
    };
    let local: Vec<ChangedFile> = local.into_iter().map(|mut f| {
        if let Some(&(a, d)) = local_numstat.get(&f.path) {
            f.additions = a;
            f.deletions = d;
        }
        f
    }).collect();
```

Then in the vs-base branch, replace the existing `(filtered, branch)` line with this block (which also fetches numstat for the merge-base diff):

```rust
                        let numstat_out = run_git_raw(
                            &toplevel,
                            &["diff", "--numstat", "-z", &format!("{merge_base}..HEAD")],
                        )?;
                        let numstat = if numstat_out.status.success() {
                            parse_numstat(&numstat_out.stdout)
                        } else {
                            std::collections::HashMap::new()
                        };
                        let filtered: Vec<ChangedFile> = filtered.into_iter().map(|mut f| {
                            if let Some(&(a, d)) = numstat.get(&f.path) {
                                f.additions = a;
                                f.deletions = d;
                            }
                            f
                        }).collect();
                        (filtered, branch)
```

- [ ] **Step 4: Run the integration test**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo test --lib changed_files_ 2>&1 | tail -15
```

Expected: PASS for `changed_files_populates_additions_and_deletions` and the existing `changed_files_*` tests.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/git/diff.rs
git commit -m "feat(git): include numstat in git_changed_files output"
```

---

## Task 3: Update TS `ChangedFileEntry` shape

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteChangesSection.tsx` (lines 5-9)

- [ ] **Step 1: Extend the interface**

In `FilePaletteChangesSection.tsx`, replace the existing `ChangedFileEntry` interface:

```tsx
export interface ChangedFileEntry {
  path: string;
  status: string;
  oldPath?: string;
  additions: number;
  deletions: number;
}
```

- [ ] **Step 2: Compile-check**

```bash
cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | grep "ChangedFileEntry\|additions\|deletions" | head -10
```

Expected: clean (no compile errors). The file only consumes `path`/`status`/`oldPath` today, so adding new fields doesn't break callers.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteChangesSection.tsx
git commit -m "feat(file-palette): surface additions/deletions on ChangedFileEntry"
```

---

## Task 4: Window size 1400×860 → 1280×760

**Files:**
- Modify: `src/BorgDock.Tauri/src-tauri/src/file_palette/windows.rs:79`

- [ ] **Step 1: Edit the size**

Change line 79 from:

```rust
.inner_size(1400.0, 860.0)
```

to:

```rust
.inner_size(1280.0, 760.0)
```

- [ ] **Step 2: Verify Rust compiles**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src-tauri/src/file_palette/windows.rs
git commit -m "feat(file-palette): default window 1280x760, user-resizable"
```

---

## Task 5: SQL window kbd hint `Ctrl+F10`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/sql/SqlApp.tsx:554`

- [ ] **Step 1: Add `Kbd` import and meta prop**

`Kbd` is already imported in `SqlApp.tsx`. Change line 554 from:

```tsx
<WindowTitleBar title="BorgDock SQL" />
```

to:

```tsx
<WindowTitleBar title="BorgDock SQL" meta={<Kbd>Ctrl+F10</Kbd>} />
```

- [ ] **Step 2: Run unit tests for sql window**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/sql 2>&1 | tail -15
```

Expected: existing tests pass; if any snapshot exists it may need updating.

- [ ] **Step 3: Commit**

```bash
git add src/BorgDock.Tauri/src/components/sql/SqlApp.tsx
git commit -m "feat(sql): show Ctrl+F10 kbd hint in titlebar"
```

---

## Task 6: Settings shape — add scope/changesMode, change collapsed shape

**Files:**
- Modify: `src/BorgDock.Tauri/src/types/settings.ts:42-47`
- Modify: `src/BorgDock.Tauri/src-tauri/src/settings/models.rs` (matching Rust struct)

- [ ] **Step 1: Update TS `UiSettings`**

Replace the file-palette block (around lines 42-46) of `UiSettings` with:

```tsx
  filePaletteActiveRootPath?: string;
  filePaletteFavoritesOnly?: boolean;
  filePaletteRootsCollapsed?: boolean;
  filePaletteChangesCollapsed?: boolean;
  filePaletteChangesMode?: 'head' | 'base' | 'both';
  filePaletteScope?: 'all' | 'changes' | 'filename' | 'content' | 'symbol';
```

- [ ] **Step 2: Update Rust `UiSettings`**

In `src/BorgDock.Tauri/src-tauri/src/settings/models.rs`, locate the field matching `file_palette_changes_collapsed` and replace its type/struct with `Option<bool>`. Add two new fields:

```rust
    pub file_palette_changes_collapsed: Option<bool>,
    pub file_palette_changes_mode: Option<String>,
    pub file_palette_scope: Option<String>,
```

If a `FilePaletteChangesCollapsed` helper struct exists in models.rs purely for the old shape, delete it and any references.

- [ ] **Step 3: Build Rust to confirm types align**

```bash
cd src/BorgDock.Tauri/src-tauri && MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' cargo check 2>&1 | tail -10
```

Expected: clean. Any old code reading `.local` / `.vs_base` from the collapsed struct will fail here — those callers are in `lib.rs` or `settings/mod.rs`. Update them to treat the field as a single bool.

- [ ] **Step 4: Update existing `FilePaletteApp.tsx` consumers**

In `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx` line ~30, change:

```tsx
  const [changesCollapsed, setChangesCollapsed] = useState<{ local: boolean; vsBase: boolean }>({
    local: false,
    vsBase: false,
  });
```

to:

```tsx
  const [changesCollapsed, setChangesCollapsed] = useState<boolean>(false);
  const [changesMode, setChangesMode] = useState<'head' | 'base' | 'both'>('both');
  const [scope, setScope] = useState<'all' | 'changes' | 'filename' | 'content' | 'symbol'>('all');
```

In the same file, around line ~73 (the `setChangesCollapsed(s.ui?.filePaletteChangesCollapsed ?? …)` call), replace with:

```tsx
        setChangesCollapsed(s.ui?.filePaletteChangesCollapsed ?? false);
        setChangesMode(s.ui?.filePaletteChangesMode ?? 'both');
        setScope(s.ui?.filePaletteScope ?? 'all');
```

Around line ~177 (`toggleChangesCollapse`), replace the body with a simpler single-bool toggler:

```tsx
  const toggleChangesCollapse = useCallback(async () => {
    setChangesCollapsed((prev) => {
      const next = !prev;
      void invoke<AppSettings>('load_settings')
        .then((s) =>
          invoke('save_settings', {
            settings: { ...s, ui: { ...s.ui, filePaletteChangesCollapsed: next } },
          }),
        )
        .catch(() => { /* ignore */ });
      return next;
    });
  }, []);
```

The `<FilePaletteChangesSection>` invocation in JSX needs its `localCollapsed`/`vsBaseCollapsed`/`onToggleCollapse` props simplified — that happens in Task 11 along with the section rewrite. For now, leave its props pointing at deprecated values; the build will be momentarily inconsistent. **Do not commit until step 5.**

- [ ] **Step 5: Patch the JSX prop site temporarily**

Still in `FilePaletteApp.tsx`, change the `<FilePaletteChangesSection>` JSX to pass the simplified props (the section will accept them in Task 11; until then, modify its props now to compile):

```tsx
          <FilePaletteChangesSection
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
            collapsed={changesCollapsed}
            mode={changesMode}
            onToggleCollapse={toggleChangesCollapse}
            onChangeMode={setChangesMode}
            refreshTick={refreshTick}
            onVisibleRowsChange={setChangesVisibleRows}
            rowRef={(el, i) => { rowRefs.current.set(i, el); }}
          />
```

In `FilePaletteChangesSection.tsx`, update the prop interface to accept the new shape (existing per-group collapse logic stays for now — it'll be replaced in Task 11):

```tsx
export interface FilePaletteFilePaletteChangesSectionProps {
  rootPath: string | null;
  query: string;
  queryMode: 'filename' | 'content' | 'symbol';
  selectedGlobalIndex: number;
  baseIndex: number;
  onOpen: (file: ChangedFileEntry, group: ChangedGroup) => void;
  onHover: (index: number) => void;
  collapsed: boolean;
  mode: 'head' | 'base' | 'both';
  onToggleCollapse: () => void;
  onChangeMode: (mode: 'head' | 'base' | 'both') => void;
  refreshTick: number;
  onVisibleRowsChange: (rows: VisibleRow[]) => void;
  rowRef: (el: HTMLButtonElement | null, idx: number) => void;
}
```

In its body, treat `collapsed` as a single boolean — both groups hide when `true`. Treat `mode === 'head'` as showing only local, `mode === 'base'` as showing only vsBase, `mode === 'both'` as showing both. This is a quick stub; Task 11 polishes the header.

- [ ] **Step 6: Build and run existing tests**

```bash
cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | tail -5 && npx vitest run src/components/file-palette 2>&1 | tail -20
```

Expected: TypeScript compiles. Existing tests for `FilePaletteChangesSection` likely fail now — fix them inline by updating prop usage to pass `collapsed: false, mode: 'both', onChangeMode: () => {}` in test call sites. Do not skip; the tests must pass.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/types/settings.ts src/BorgDock.Tauri/src-tauri/src/settings/models.rs src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx src/BorgDock.Tauri/src/components/file-palette/FilePaletteChangesSection.tsx src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteChangesSection.test.tsx
git commit -m "feat(file-palette): add scope + changesMode settings, simplify changesCollapsed to bool"
```

---

## Task 7: `useWorktreeChangeCounts` hook

**Files:**
- Create: `src/BorgDock.Tauri/src/components/file-palette/use-worktree-change-counts.ts`
- Create: `src/BorgDock.Tauri/src/components/file-palette/__tests__/use-worktree-change-counts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/BorgDock.Tauri/src/components/file-palette/__tests__/use-worktree-change-counts.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorktreeChangeCounts } from '../use-worktree-change-counts';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

afterEach(() => {
  invokeMock.mockReset();
});

describe('useWorktreeChangeCounts', () => {
  it('fans out one git_changed_files call per visible root on mount', async () => {
    invokeMock.mockResolvedValue({
      local: [{ path: 'a', status: 'M', additions: 2, deletions: 1 }],
      vsBase: [],
      baseRef: 'main',
      inRepo: true,
    });
    const { result } = renderHook(() =>
      useWorktreeChangeCounts(['/a', '/b'], 0),
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock).toHaveBeenCalledWith('git_changed_files', { root: '/a' });
    expect(invokeMock).toHaveBeenCalledWith('git_changed_files', { root: '/b' });
    await waitFor(() => {
      expect(result.current.counts.get('/a')).toEqual({ count: 1, addTotal: 2, delTotal: 1 });
    });
  });

  it('refreshes only the active root when refresh(path) is called', async () => {
    invokeMock.mockResolvedValue({ local: [], vsBase: [], baseRef: 'main', inRepo: true });
    const { result } = renderHook(() => useWorktreeChangeCounts(['/a', '/b'], 0));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    invokeMock.mockClear();
    act(() => result.current.refreshOne('/a'));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenCalledWith('git_changed_files', { root: '/a' });
  });

  it('skips non-git repos silently (no badge)', async () => {
    invokeMock.mockResolvedValue({ local: [], vsBase: [], baseRef: '', inRepo: false });
    const { result } = renderHook(() => useWorktreeChangeCounts(['/x'], 0));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.counts.has('/x')).toBe(false));
  });

  it('re-sweeps when refreshTick changes', async () => {
    invokeMock.mockResolvedValue({ local: [], vsBase: [], baseRef: 'main', inRepo: true });
    const { rerender } = renderHook(
      ({ tick }: { tick: number }) => useWorktreeChangeCounts(['/a'], tick),
      { initialProps: { tick: 0 } },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    invokeMock.mockClear();
    rerender({ tick: 1 });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/use-worktree-change-counts.test.ts 2>&1 | tail -10
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the hook**

Create `src/BorgDock.Tauri/src/components/file-palette/use-worktree-change-counts.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

interface ChangedFileWire {
  path: string;
  status: string;
  oldPath?: string;
  additions: number;
  deletions: number;
}

interface ChangedFilesOutputWire {
  local: ChangedFileWire[];
  vsBase: ChangedFileWire[];
  baseRef: string;
  inRepo: boolean;
}

export interface RootCount {
  count: number;
  addTotal: number;
  delTotal: number;
}

export interface UseWorktreeChangeCountsResult {
  counts: ReadonlyMap<string, RootCount>;
  refreshOne: (path: string) => void;
}

const sumStats = (files: ChangedFileWire[]) => ({
  count: files.length,
  addTotal: files.reduce((s, f) => s + (f.additions ?? 0), 0),
  delTotal: files.reduce((s, f) => s + (f.deletions ?? 0), 0),
});

export function useWorktreeChangeCounts(
  rootPaths: readonly string[],
  refreshTick: number,
): UseWorktreeChangeCountsResult {
  const [counts, setCounts] = useState<Map<string, RootCount>>(new Map());

  const fetchOne = useCallback(async (path: string) => {
    try {
      const r = await invoke<ChangedFilesOutputWire>('git_changed_files', { root: path });
      if (!r.inRepo) {
        setCounts((prev) => {
          if (!prev.has(path)) return prev;
          const next = new Map(prev);
          next.delete(path);
          return next;
        });
        return;
      }
      const stats = sumStats(r.local);
      setCounts((prev) => {
        const next = new Map(prev);
        next.set(path, stats);
        return next;
      });
    } catch {
      setCounts((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rootPaths.join is the change signal — we don't want array identity to retrigger.
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled(
      rootPaths.map(async (p) => {
        if (cancelled) return;
        await fetchOne(p);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [rootPaths.join(' '), refreshTick, fetchOne]);

  const refreshOne = useCallback(
    (path: string) => {
      void fetchOne(path);
    },
    [fetchOne],
  );

  return { counts, refreshOne };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/use-worktree-change-counts.test.ts 2>&1 | tail -10
```

Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/use-worktree-change-counts.ts src/BorgDock.Tauri/src/components/file-palette/__tests__/use-worktree-change-counts.test.ts
git commit -m "feat(file-palette): hook for worktree change counts with parallel sweep + per-root refresh"
```

---

## Task 8: `FilePaletteApp` chrome migration

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx` (around lines 313-320 and the closing JSX)

- [ ] **Step 1: Add imports**

At the top of `FilePaletteApp.tsx`, add:

```tsx
import { Kbd } from '@/components/shared/primitives';
import { WindowStatusBar } from '@/components/shared/chrome/WindowStatusBar';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
```

- [ ] **Step 2: Replace the existing titlebar JSX**

Find this block (around line 313):

```tsx
      <div className="bd-fp-titlebar" data-tauri-drag-region>
        <span className="bd-fp-title">FILES</span>
      </div>
```

Replace with:

```tsx
      <WindowTitleBar title="Files" meta={<Kbd>Ctrl+F8</Kbd>} />
```

- [ ] **Step 3: Add the bottom status bar (placeholder content; populated in Task 14)**

Just before the closing `</div>` of `data-window="palette"`, add:

```tsx
      <WindowStatusBar
        left={<span className="bd-mono">Files palette</span>}
        right={
          <span className="bd-mono">
            <Kbd>↑↓</Kbd> nav · <Kbd>↵</Kbd> open · <Kbd>Tab</Kbd> roots · <Kbd>Esc</Kbd> close
          </span>
        }
      />
```

- [ ] **Step 4: Run snapshot tests**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/FilePaletteApp.test.tsx 2>&1 | tail -15
```

Expected: tests pass; if any snapshot covered the old titlebar, update it (the new structure is intentional).

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteApp.test.tsx
git commit -m "feat(file-palette): adopt shared WindowTitleBar + WindowStatusBar chrome"
```

---

## Task 9: Scope chips in `FilePaletteSearchPane`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteSearchPane.tsx`
- Modify: `src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteSearchPane.test.tsx`

- [ ] **Step 1: Write the failing test cases**

Replace existing test bodies in `FilePaletteSearchPane.test.tsx` with (or append):

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilePaletteSearchPane } from '../FilePaletteSearchPane';

const baseProps = {
  query: '',
  onQueryChange: () => {},
  parsed: { mode: 'filename' as const, query: '' },
  resultCount: 0,
  scope: 'all' as const,
  onScopeChange: () => {},
  changesCount: 0,
};

describe('FilePaletteSearchPane scope chips', () => {
  it('renders all 5 chips', () => {
    render(<FilePaletteSearchPane {...baseProps} />);
    expect(screen.getByRole('button', { name: /All/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Changes/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filename/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Content/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Symbol/ })).toBeInTheDocument();
  });

  it('clicking Content chip rewrites query with > prefix', () => {
    const onQueryChange = vi.fn();
    const onScopeChange = vi.fn();
    render(
      <FilePaletteSearchPane
        {...baseProps}
        query="foo"
        parsed={{ mode: 'filename', query: 'foo' }}
        onQueryChange={onQueryChange}
        onScopeChange={onScopeChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Content/ }));
    expect(onQueryChange).toHaveBeenCalledWith('>foo');
    expect(onScopeChange).toHaveBeenCalledWith('content');
  });

  it('clicking All chip strips prefix from query', () => {
    const onQueryChange = vi.fn();
    render(
      <FilePaletteSearchPane
        {...baseProps}
        query=">foo"
        parsed={{ mode: 'content', query: 'foo' }}
        onQueryChange={onQueryChange}
        onScopeChange={vi.fn()}
        scope="content"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /All/ }));
    expect(onQueryChange).toHaveBeenCalledWith('foo');
  });

  it('renders Changes count badge when > 0', () => {
    render(<FilePaletteSearchPane {...baseProps} changesCount={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/FilePaletteSearchPane.test.tsx 2>&1 | tail -15
```

Expected: FAIL — props/JSX don't match.

- [ ] **Step 3: Rewrite `FilePaletteSearchPane.tsx`**

Replace the file contents with:

```tsx
import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import { Kbd } from '@/components/shared/primitives';
import type { ParsedQuery } from './parse-query';
import { parseQuery } from './parse-query';

export type Scope = 'all' | 'changes' | 'filename' | 'content' | 'symbol';

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  parsed: ParsedQuery;
  resultCount: number;
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  changesCount: number;
}

export function FilePaletteSearchPane({
  query, onQueryChange, parsed, resultCount,
  scope, onScopeChange, changesCount,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      invoke('palette_ready').catch(() => {});
    }, 40);
    return () => window.clearTimeout(id);
  }, []);

  // Chip click rewrites the query so the prefix matches the new scope.
  const setScope = (next: Scope) => {
    const stripped = stripPrefix(query);
    if (next === 'content') onQueryChange(`>${stripped}`);
    else if (next === 'symbol') onQueryChange(`@${stripped}`);
    else onQueryChange(stripped);
    onScopeChange(next);
  };

  return (
    <div className="bd-fp-search-pane">
      <div className="bd-fp-search-input-wrap">
        <input
          ref={inputRef}
          className="bd-fp-search-input"
          placeholder="Search files…   >text  @symbol"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="File palette search"
        />
        <span className="bd-fp-search-kbds">
          <Kbd>↑↓</Kbd>
          <Kbd>↵</Kbd>
        </span>
      </div>
      <div className="bd-fp-scope-chips" role="tablist">
        <ScopeChip v="all" label="All" active={scope} onClick={setScope} />
        <ScopeChip v="changes" label="Changes" active={scope} onClick={setScope}
          count={changesCount} tone="warn" />
        <ScopeChip v="filename" label="Filename" active={scope} onClick={setScope} />
        <ScopeChip v="content" label="Content" active={scope} onClick={setScope} hint=">" />
        <ScopeChip v="symbol" label="Symbol" active={scope} onClick={setScope} hint="@" />
        <span className="bd-fp-scope-spacer" />
        <span className="bd-fp-scope-count bd-mono">{resultCount} result{resultCount === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}

interface ScopeChipProps {
  v: Scope;
  label: string;
  active: Scope;
  onClick: (s: Scope) => void;
  count?: number;
  tone?: 'warn';
  hint?: string;
}

function ScopeChip({ v, label, active, onClick, count, tone, hint }: ScopeChipProps) {
  const isOn = active === v;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isOn}
      className={`bd-fp-scope-chip${isOn ? ' bd-fp-scope-chip--on' : ''}`}
      onClick={() => onClick(v)}
    >
      {hint && <span className="bd-mono bd-fp-scope-chip__hint">{hint}</span>}
      {label}
      {count != null && count > 0 && (
        <span className={`bd-fp-scope-chip__count${tone === 'warn' ? ' bd-fp-scope-chip__count--warn' : ''}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function stripPrefix(q: string): string {
  if (q.startsWith('>') || q.startsWith('@')) return q.slice(1);
  return q;
}

export { parseQuery };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/FilePaletteSearchPane.test.tsx 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 5: Add minimal CSS for chips**

Append to `src/BorgDock.Tauri/src/components/file-palette/file-palette.css` (or wherever palette CSS lives — search for `.bd-fp-search-pane`):

```css
.bd-fp-scope-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 7px;
  flex-wrap: wrap;
}
.bd-fp-scope-chip {
  height: 22px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
  font-family: inherit;
}
.bd-fp-scope-chip--on {
  border-color: var(--color-purple-border);
  background: var(--color-accent-subtle);
  color: var(--color-accent);
  font-weight: 600;
}
.bd-fp-scope-chip__hint {
  font-size: 10px;
  opacity: 0.7;
}
.bd-fp-scope-chip__count {
  font-size: 9px;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--color-surface-hover);
}
.bd-fp-scope-chip__count--warn {
  background: var(--color-warning-badge-bg);
  color: var(--color-status-yellow);
}
.bd-fp-scope-spacer { flex: 1; }
.bd-fp-scope-count { font-size: 10px; opacity: 0.7; }
.bd-fp-search-kbds {
  display: inline-flex;
  gap: 4px;
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
}
```

- [ ] **Step 6: Update `FilePaletteApp.tsx` to thread the new props**

In `FilePaletteApp.tsx`, replace the `<FilePaletteSearchPane>` JSX with:

```tsx
          <FilePaletteSearchPane
            query={query}
            onQueryChange={setQuery}
            parsed={parsed}
            resultCount={results.length}
            scope={scope}
            onScopeChange={(s) => {
              setScope(s);
              void invoke<AppSettings>('load_settings').then((settings) =>
                invoke('save_settings', {
                  settings: { ...settings, ui: { ...settings.ui, filePaletteScope: s } },
                }),
              ).catch(() => { /* ignore */ });
            }}
            changesCount={changesVisibleRows.length}
          />
```

- [ ] **Step 7: Verify full palette test suite**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteSearchPane.tsx src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteSearchPane.test.tsx src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx src/BorgDock.Tauri/src/components/file-palette/file-palette.css
git commit -m "feat(file-palette): scope chips own search mode, prefix stays as kbd shortcut"
```

---

## Task 10: Worktree change-count badges in Roots column

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteRootsColumn.tsx`
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx`
- Modify: `src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteRootsColumn.test.tsx`

- [ ] **Step 1: Failing test for the badge**

Append to `FilePaletteRootsColumn.test.tsx`:

```tsx
it('renders change count badge for worktree with count > 0', () => {
  const counts = new Map([['/repo', { count: 3, addTotal: 12, delTotal: 4 }]]);
  render(
    <FilePaletteRootsColumn
      roots={[{ path: '/repo', label: 'repo', source: 'worktree', repoOwner: 'o', repoName: 'r' }]}
      activePath={null}
      onSelect={() => {}}
      favoritePaths={new Set()}
      onToggleFavorite={() => {}}
      favoritesOnly={false}
      onToggleFavoritesOnly={() => {}}
      collapsed={false}
      onToggleCollapsed={() => {}}
      onAddCustomRoot={() => {}}
      onRemoveCustomRoot={() => {}}
      changeCounts={counts}
    />,
  );
  expect(screen.getByText('3')).toBeInTheDocument();
});

it('hides badge when count is 0', () => {
  const counts = new Map([['/repo', { count: 0, addTotal: 0, delTotal: 0 }]]);
  const { container } = render(
    <FilePaletteRootsColumn
      roots={[{ path: '/repo', label: 'repo', source: 'worktree', repoOwner: 'o', repoName: 'r' }]}
      activePath={null}
      onSelect={() => {}}
      favoritePaths={new Set()}
      onToggleFavorite={() => {}}
      favoritesOnly={false}
      onToggleFavoritesOnly={() => {}}
      collapsed={false}
      onToggleCollapsed={() => {}}
      onAddCustomRoot={() => {}}
      onRemoveCustomRoot={() => {}}
      changeCounts={counts}
    />,
  );
  expect(container.querySelector('.bd-fp-root-badge')).toBeNull();
});
```

(Existing tests need a `changeCounts={new Map()}` prop added — fix them in the same edit.)

- [ ] **Step 2: Run to verify failure**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/FilePaletteRootsColumn.test.tsx 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: Add `changeCounts` prop and badge rendering**

In `FilePaletteRootsColumn.tsx`, extend the props interface:

```tsx
interface FilePaletteFilePaletteRootsColumnProps {
  roots: RootEntry[];
  activePath: string | null;
  onSelect: (path: string) => void;
  favoritePaths: Set<string>;
  onToggleFavorite: (root: RootEntry) => void;
  favoritesOnly: boolean;
  onToggleFavoritesOnly: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onAddCustomRoot: () => void;
  onRemoveCustomRoot: (root: RootEntry) => void;
  changeCounts: ReadonlyMap<string, { count: number; addTotal: number; delTotal: number }>;
}
```

In `RootRow` (line ~208), add `count` prop:

```tsx
interface RootRowProps {
  root: RootEntry;
  active: boolean;
  favorite: boolean;
  onSelect: (path: string) => void;
  onToggleFavorite: (root: RootEntry) => void;
  showStar: boolean;
  onRemove?: () => void;
  count?: number;
}
```

After the `<button className="bd-fp-root-row">…</button>` in `RootRow`, before the wrapper closing tag, insert:

```tsx
      {count != null && count > 0 && (
        <span className="bd-fp-root-badge bd-mono" title={`${count} changed`}>
          {count}
        </span>
      )}
```

In the JSX where `<RootRow>` is invoked for worktrees (around line 158), pass:

```tsx
              count={changeCounts.get(root.path)?.count}
```

- [ ] **Step 4: Add CSS for the badge**

Append to the same CSS file as Task 9:

```css
.bd-fp-root-row-wrap { position: relative; }
.bd-fp-root-badge {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-warning-badge-bg);
  color: var(--color-status-yellow);
  border: 1px solid var(--color-warning-badge-border);
  flex-shrink: 0;
}
```

- [ ] **Step 5: Wire the hook in `FilePaletteApp.tsx`**

In `FilePaletteApp.tsx`, near the other hooks:

```tsx
import { useWorktreeChangeCounts } from './use-worktree-change-counts';
```

After existing state hooks (around line 50):

```tsx
  const visibleRootPaths = useMemo(
    () =>
      roots
        .filter((r) =>
          r.source === 'custom' || (favoritesOnly ? favoritePaths.has(r.path) : true),
        )
        .map((r) => r.path),
    [roots, favoritesOnly, favoritePaths],
  );
  const { counts: changeCounts, refreshOne: refreshOneCount } = useWorktreeChangeCounts(
    visibleRootPaths,
    refreshTick,
  );
```

In `selectRoot` (around line 109), after `setActiveRoot(path)`, call:

```tsx
    refreshOneCount(path);
```

In the `<FilePaletteRootsColumn>` JSX, add:

```tsx
            changeCounts={changeCounts}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteRootsColumn.tsx src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteRootsColumn.test.tsx src/BorgDock.Tauri/src/components/file-palette/file-palette.css
git commit -m "feat(file-palette): worktree change-count badges in Roots column"
```

---

## Task 11: Dashed "Add directory…" button in Custom dirs section

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteRootsColumn.tsx`

- [ ] **Step 1: Add the button at the end of Custom section**

In `FilePaletteRootsColumn.tsx`, find the `{custom.length > 0 && (…)}` block (around line 174) and replace it with:

```tsx
      {(custom.length > 0 || roots.length > 0) && (
        <div className="bd-fp-roots-section">
          <div className="bd-fp-roots-heading">CUSTOM</div>
          {custom.map((root) => (
            <RootRow
              key={root.path}
              root={root}
              active={activePath === root.path}
              favorite={false}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
              showStar={false}
              onRemove={() => onRemoveCustomRoot(root)}
            />
          ))}
          <button
            type="button"
            className="bd-fp-roots-add-custom"
            onClick={onAddCustomRoot}
          >
            + Add directory…
          </button>
        </div>
      )}
```

- [ ] **Step 2: CSS for the dashed button**

Append:

```css
.bd-fp-roots-add-custom {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 12px 4px;
  height: 28px;
  padding: 0 10px;
  border: 1px dashed var(--color-strong-border);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  width: calc(100% - 24px);
  text-align: left;
}
.bd-fp-roots-add-custom:hover {
  color: var(--color-text-secondary);
  border-color: var(--color-accent);
}
```

- [ ] **Step 3: Run tests**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/FilePaletteRootsColumn.test.tsx 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteRootsColumn.tsx src/BorgDock.Tauri/src/components/file-palette/file-palette.css
git commit -m "feat(file-palette): inline 'Add directory…' button at end of Custom roots section"
```

---

## Task 12: Changes section — tri-toggle + section-level collapse + numstat per row + totals

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteChangesSection.tsx`
- Modify: `src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteChangesSection.test.tsx`

- [ ] **Step 1: Failing test cases**

Replace the existing `FilePaletteChangesSection.test.tsx` content (or add at top + extend the `describe` block):

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FilePaletteChangesSection,
  type FilePaletteFilePaletteChangesSectionProps,
} from '../FilePaletteChangesSection';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

afterEach(() => {
  invokeMock.mockReset();
});

const baseProps = (
  override: Partial<FilePaletteFilePaletteChangesSectionProps> = {},
): FilePaletteFilePaletteChangesSectionProps => ({
  rootPath: '/r',
  query: '',
  queryMode: 'filename',
  selectedGlobalIndex: -1,
  baseIndex: 0,
  onOpen: () => {},
  onHover: () => {},
  collapsed: false,
  mode: 'both',
  onToggleCollapse: () => {},
  onChangeMode: () => {},
  refreshTick: 0,
  onVisibleRowsChange: () => {},
  rowRef: () => {},
  ...override,
});

describe('FilePaletteChangesSection', () => {
  it('shows only local rows when mode is "head"', async () => {
    invokeMock.mockResolvedValueOnce({
      local: [{ path: 'a.ts', status: 'M', additions: 2, deletions: 1 }],
      vsBase: [{ path: 'b.ts', status: 'A', additions: 5, deletions: 0 }],
      baseRef: 'main',
      inRepo: true,
    });
    render(<FilePaletteChangesSection {...baseProps({ mode: 'head' })} />);
    await waitFor(() => expect(screen.queryByText('a.ts')).toBeInTheDocument());
    expect(screen.queryByText('b.ts')).toBeNull();
  });

  it('renders +N −N per row using ChangedFileEntry stats', async () => {
    invokeMock.mockResolvedValueOnce({
      local: [{ path: 'a.ts', status: 'M', additions: 14, deletions: 6 }],
      vsBase: [],
      baseRef: 'main',
      inRepo: true,
    });
    render(<FilePaletteChangesSection {...baseProps({ mode: 'both' })} />);
    await waitFor(() => expect(screen.getByText('+14')).toBeInTheDocument());
    expect(screen.getByText('−6')).toBeInTheDocument();
  });

  it('hides rows when collapsed=true but keeps the section header', async () => {
    invokeMock.mockResolvedValueOnce({
      local: [{ path: 'a.ts', status: 'M', additions: 1, deletions: 0 }],
      vsBase: [],
      baseRef: 'main',
      inRepo: true,
    });
    render(<FilePaletteChangesSection {...baseProps({ collapsed: true })} />);
    expect(await screen.findByText('CHANGES')).toBeInTheDocument();
    expect(screen.queryByText('a.ts')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/FilePaletteChangesSection.test.tsx 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: Rewrite the section**

Inside `FilePaletteChangesSection.tsx`, replace the entire render body with this structure:

```tsx
  return (
    <div className="bd-fp-changes">
      <div className="bd-fp-changes-header">
        <button
          type="button"
          className="bd-fp-changes-caret"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand changes' : 'Collapse changes'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="bd-fp-changes-title">CHANGES</span>
        <span className="bd-mono bd-fp-changes-count">· {visibleCount}</span>
        <span className="bd-fp-changes-stats bd-mono">
          <span style={{ color: 'var(--color-status-green)' }}>+{visibleAdd}</span>
          <span style={{ color: 'var(--color-status-red)' }}>−{visibleDel}</span>
        </span>
        <span className="bd-fp-changes-spacer" />
        <div className="bd-fp-changes-modes">
          {(['head', 'base', 'both'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`bd-fp-changes-mode${mode === m ? ' bd-fp-changes-mode--on' : ''}`}
              onClick={() => onChangeMode(m)}
            >
              {m === 'head' ? 'vs HEAD' : m === 'base' ? `vs ${baseRefLabel}` : 'Both'}
            </button>
          ))}
        </div>
      </div>
      {!collapsed && (
        <>
          {(mode === 'head' || mode === 'both') && localFiltered.length > 0 && (
            <ChangesGroup
              label="Local · uncommitted"
              subLabel="vs HEAD"
              group="local"
              files={localFiltered}
              baseIndex={baseIndex}
              selectedGlobalIndex={selectedGlobalIndex}
              onOpen={onOpen}
              onHover={onHover}
              rowRef={rowRef}
              renderRow={renderRow}
            />
          )}
          {(mode === 'base' || mode === 'both') && vsBaseFiltered.length > 0 && (
            <ChangesGroup
              label="Ahead of base"
              subLabel={`vs ${baseRefLabel}`}
              group="vsBase"
              files={vsBaseFiltered}
              baseIndex={baseIndex + (mode === 'both' ? localFiltered.length : 0)}
              selectedGlobalIndex={selectedGlobalIndex}
              onOpen={onOpen}
              onHover={onHover}
              rowRef={rowRef}
              renderRow={renderRow}
            />
          )}
        </>
      )}
    </div>
  );
```

`ChangesGroup` is the existing inner component — keep its row internals untouched, just thread through the props above. If `ChangesGroup`'s prop names differ from what's listed here, rename to match its actual signature; the names above are illustrative of what it consumes (the existing implementation already takes these or analogous fields).

Update `renderRow` (or equivalent) to render `+N −N` after the path:

```tsx
        <span className="bd-mono" style={{ color: 'var(--color-status-green)', fontSize: 9.5, fontWeight: 600 }}>+{file.additions}</span>
        <span className="bd-mono" style={{ color: 'var(--color-status-red)', fontSize: 9.5, fontWeight: 600 }}>−{file.deletions}</span>
```

Compute the visible totals at the top of the component:

```tsx
  const visibleLocal = mode === 'head' || mode === 'both' ? localFiltered : [];
  const visibleBase  = mode === 'base' || mode === 'both' ? vsBaseFiltered : [];
  const visibleCount = visibleLocal.length + visibleBase.length;
  const visibleAdd = [...visibleLocal, ...visibleBase].reduce((s, f) => s + f.additions, 0);
  const visibleDel = [...visibleLocal, ...visibleBase].reduce((s, f) => s + f.deletions, 0);
  const baseRefLabel = data?.baseRef || 'main';
```

When `collapsed`, `onVisibleRowsChange([])` so flat-nav skips the section. When expanded, emit the visible rows in order (local first, then vsBase).

- [ ] **Step 4: Add CSS**

Append:

```css
.bd-fp-changes-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px 8px;
}
.bd-fp-changes-caret {
  background: transparent; border: none; cursor: pointer;
  color: var(--color-text-muted); font-size: 10px; padding: 2px;
}
.bd-fp-changes-title {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
  text-transform: uppercase; color: var(--color-text-secondary);
}
.bd-fp-changes-count, .bd-fp-changes-stats { font-size: 10px; }
.bd-fp-changes-stats { display: inline-flex; gap: 3px; }
.bd-fp-changes-spacer { flex: 1; }
.bd-fp-changes-modes {
  display: flex;
  border: 1px solid var(--color-subtle-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--color-surface);
}
.bd-fp-changes-mode {
  padding: 0 8px; height: 20px;
  font-size: 10px; font-weight: 500;
  border: none; background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  font-family: inherit;
}
.bd-fp-changes-mode--on {
  background: var(--color-accent-subtle);
  color: var(--color-accent);
  font-weight: 600;
}
```

- [ ] **Step 5: Run tests**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/FilePaletteChangesSection.test.tsx 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteChangesSection.tsx src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePaletteChangesSection.test.tsx src/BorgDock.Tauri/src/components/file-palette/file-palette.css
git commit -m "feat(file-palette): tri-toggle + section collapse + per-row +/− stats in Changes"
```

---

## Task 13: Selection model in `FilePaletteApp` — derived `Selection` shape

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx`

- [ ] **Step 1: Define the type**

Near the top of `FilePaletteApp.tsx` (just after imports), add:

```tsx
export type Selection =
  | { kind: 'diff'; source: 'changes'; path: string; baseline: 'HEAD' | 'mergeBaseDefault'; group: 'local' | 'vsBase' }
  | { kind: 'file'; source: 'results'; path: string; line?: number; symbol?: string };
```

- [ ] **Step 2: Derive selection from `selectedIndex`**

After `selectedResult` is computed (around line 245), add:

```tsx
  const selection: Selection | null = useMemo(() => {
    if (selectedIndex < changesVisibleRows.length) {
      const row = changesVisibleRows[selectedIndex];
      if (!row) return null;
      return {
        kind: 'diff',
        source: 'changes',
        path: row.file.path,
        baseline: row.group === 'vsBase' ? 'mergeBaseDefault' : 'HEAD',
        group: row.group,
      };
    }
    const result = results[selectedIndex - changesVisibleRows.length];
    if (!result) return null;
    return {
      kind: 'file',
      source: 'results',
      path: result.rel_path,
      line: result.line,
      symbol: result.symbol,
    };
  }, [selectedIndex, changesVisibleRows, results]);
```

- [ ] **Step 3: Pass `selection` to `FilePalettePreviewPane`**

Replace the existing `<FilePalettePreviewPane>` JSX with:

```tsx
        <FilePalettePreviewPane
          rootPath={activeRoot}
          selection={selection}
          contentHit={currentContentHit}
          onIdentifierJump={jumpToSymbol}
          onPopOut={(path, baseline) => {
            invoke('open_file_viewer_window', { path, baseline })
              .catch((e) => console.error('open_file_viewer_window failed', e));
          }}
        />
```

`FilePalettePreviewPane` will accept the new shape in Task 14.

- [ ] **Step 4: TS compile-check**

```bash
cd src/BorgDock.Tauri && npx tsc --noEmit 2>&1 | tail -15
```

Expected: errors only inside `FilePalettePreviewPane.tsx` (its props don't yet match). That's intentional.

- [ ] **Step 5: Do NOT commit yet** — Task 14 finishes this transition. Continue.

---

## Task 14: `FilePalettePreviewPane` — route on `selection.kind`, FilePreview subcomponent

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePalettePreviewPane.tsx`
- Modify: `src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePalettePreviewPane.test.tsx`

- [ ] **Step 1: Failing routing test**

Append to `FilePalettePreviewPane.test.tsx`:

```tsx
it('routes diff selection to DiffPreview', async () => {
  const onPopOut = vi.fn();
  render(
    <FilePalettePreviewPane
      rootPath="/r"
      selection={{ kind: 'diff', source: 'changes', path: 'a.ts', baseline: 'HEAD', group: 'local' }}
      contentHit={null}
      onIdentifierJump={() => {}}
      onPopOut={onPopOut}
    />,
  );
  expect(await screen.findByText(/vs HEAD/i)).toBeInTheDocument();
});

it('routes file selection to FilePreview', async () => {
  render(
    <FilePalettePreviewPane
      rootPath="/r"
      selection={{ kind: 'file', source: 'results', path: 'a.ts' }}
      contentHit={null}
      onIdentifierJump={() => {}}
      onPopOut={() => {}}
    />,
  );
  // FilePreview's action bar shows the ext pill.
  expect(await screen.findByText(/ts/)).toBeInTheDocument();
});

it('Open in window calls onPopOut with current selection', async () => {
  const onPopOut = vi.fn();
  render(
    <FilePalettePreviewPane
      rootPath="/r"
      selection={{ kind: 'file', source: 'results', path: 'a.ts' }}
      contentHit={null}
      onIdentifierJump={() => {}}
      onPopOut={onPopOut}
    />,
  );
  fireEvent.click(await screen.findByLabelText(/Open in window/i));
  expect(onPopOut).toHaveBeenCalledWith(expect.stringContaining('a.ts'), undefined);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/FilePalettePreviewPane.test.tsx 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: Rewrite the preview pane skeleton**

Replace `FilePalettePreviewPane.tsx` with this skeleton (DiffPreview body fills in Task 15):

```tsx
import { useMemo } from 'react';
import type { Selection } from './FilePaletteApp';
import { joinRootAndRel } from './join-path';
import { DiffPreview } from './DiffPreview';
import { FilePreview } from './FilePreview';

interface ContentHit {
  matches: { line: number; col: number; length: number }[];
}

interface Props {
  rootPath: string | null;
  selection: Selection | null;
  contentHit: ContentHit | null;
  onIdentifierJump: (word: string) => void;
  onPopOut: (path: string, baseline?: 'HEAD' | 'mergeBaseDefault') => void;
}

export function FilePalettePreviewPane({
  rootPath, selection, contentHit, onIdentifierJump, onPopOut,
}: Props) {
  const absPath = useMemo(() => {
    if (!rootPath || !selection) return null;
    return joinRootAndRel(rootPath, selection.path);
  }, [rootPath, selection]);

  if (!selection || !absPath) {
    return <div className="bd-fp-preview bd-fp-preview--empty">Select a file to preview</div>;
  }

  if (selection.kind === 'diff') {
    return (
      <DiffPreview
        path={absPath}
        relPath={selection.path}
        initialBaseline={selection.baseline}
        onPopOut={(baseline) => onPopOut(absPath, baseline)}
      />
    );
  }

  return (
    <FilePreview
      path={absPath}
      relPath={selection.path}
      contentHit={contentHit}
      scrollToLine={selection.line}
      onIdentifierJump={onIdentifierJump}
      onPopOut={() => onPopOut(absPath)}
    />
  );
}
```

- [ ] **Step 4: Stub `DiffPreview.tsx`**

Create `src/BorgDock.Tauri/src/components/file-palette/DiffPreview.tsx`:

```tsx
interface Props {
  path: string;
  relPath: string;
  initialBaseline: 'HEAD' | 'mergeBaseDefault';
  onPopOut: (baseline: 'HEAD' | 'mergeBaseDefault') => void;
}

export function DiffPreview({ path, relPath, initialBaseline, onPopOut }: Props) {
  return (
    <div className="bd-fp-preview bd-fp-preview--diff">
      <div className="bd-fp-preview-actionbar">
        <span className="bd-mono">{relPath}</span>
        <span className="bd-fp-preview-spacer" />
        <span>{initialBaseline === 'HEAD' ? 'vs HEAD' : 'vs main'}</span>
        <button type="button" aria-label="Open in window" onClick={() => onPopOut(initialBaseline)}>↗</button>
      </div>
      <div className="bd-fp-preview-body">Diff for {path} — populated in Task 15.</div>
    </div>
  );
}
```

- [ ] **Step 5: Create `FilePreview.tsx`**

Create `src/BorgDock.Tauri/src/components/file-palette/FilePreview.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FilePaletteCodeView } from './FilePaletteCodeView';

interface ContentHit {
  matches: { line: number; col: number; length: number }[];
}

interface Props {
  path: string;
  relPath: string;
  contentHit: ContentHit | null;
  scrollToLine?: number;
  onIdentifierJump: (word: string) => void;
  onPopOut: () => void;
}

export function FilePreview({ path, relPath, contentHit, scrollToLine, onIdentifierJump, onPopOut }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setContent(null);
    setError(null);
    invoke<string>('read_text_file', { path })
      .then((c) => setContent(c))
      .catch((e) => setError(typeof e === 'string' ? e : (e as { message?: string }).message ?? 'Error'));
  }, [path]);

  const ext = relPath.includes('.') ? relPath.split('.').pop() : 'txt';
  const lines = content ? content.split('\n').length : 0;
  const sizeKb = content ? Math.round(content.length / 102.4) / 10 : 0;

  return (
    <div className="bd-fp-preview bd-fp-preview--file">
      <div className="bd-fp-preview-actionbar">
        <span className="bd-mono">{relPath}</span>
        <span className="bd-fp-preview-spacer" />
        <span className="bd-fp-preview-pill">{ext}</span>
        <span className="bd-mono">{lines} lines · {sizeKb} KB</span>
        <button type="button" aria-label="Copy contents"
          onClick={() => content && navigator.clipboard.writeText(content)}>📋</button>
        <button type="button" aria-label="Open in window" onClick={onPopOut}>↗</button>
      </div>
      <div className="bd-fp-preview-body">
        {error ? (
          <div className="bd-fp-preview-error">{error}</div>
        ) : content == null ? (
          <div className="bd-fp-preview-loading">Loading…</div>
        ) : (
          <FilePaletteCodeView
            path={path}
            content={content}
            scrollToLine={scrollToLine}
            highlightedLines={contentHit?.matches.map((m) => m.line)}
            onIdentifierJump={onIdentifierJump}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run tests**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/FilePalettePreviewPane.test.tsx 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 7: Commit Tasks 13 + 14 together**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePalettePreviewPane.tsx src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx src/BorgDock.Tauri/src/components/file-palette/DiffPreview.tsx src/BorgDock.Tauri/src/components/file-palette/FilePreview.tsx src/BorgDock.Tauri/src/components/file-palette/__tests__/FilePalettePreviewPane.test.tsx
git commit -m "feat(file-palette): selection-kind routing in PreviewPane, split into FilePreview + DiffPreview"
```

---

## Task 15: `DiffPreview` body — split + unified, vs HEAD/main toggle, view toggle, hunk nav

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/DiffPreview.tsx`

- [ ] **Step 1: Failing test**

Create `src/BorgDock.Tauri/src/components/file-palette/__tests__/DiffPreview.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiffPreview } from '../DiffPreview';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

describe('DiffPreview', () => {
  it('loads diff and renders +N/−N totals', async () => {
    invokeMock.mockResolvedValue({
      patch: 'diff --git a/x b/x\n@@ -1,2 +1,3 @@\n one\n+two\n three\n',
      baselineRef: 'HEAD',
      inRepo: true,
    });
    render(<DiffPreview path="/r/x" relPath="x" initialBaseline="HEAD" onPopOut={() => {}} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('git_file_diff', { path: '/r/x', baseline: 'HEAD' }));
    await waitFor(() => expect(screen.getByText(/\+1/)).toBeInTheDocument());
  });

  it('refetches when compare toggle flips', async () => {
    invokeMock.mockResolvedValue({ patch: '', baselineRef: 'HEAD', inRepo: true });
    render(<DiffPreview path="/r/x" relPath="x" initialBaseline="HEAD" onPopOut={() => {}} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /vs main/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock).toHaveBeenLastCalledWith('git_file_diff', { path: '/r/x', baseline: 'mergeBaseDefault' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/DiffPreview.test.tsx 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Implement `DiffPreview`**

Replace the stub in `DiffPreview.tsx` with:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Kbd } from '@/components/shared/primitives';
import { useSyntaxHighlight } from '@/hooks/useSyntaxHighlight';
import { parsePatch } from '@/services/diff-parser';
import { SplitDiffView } from '@/components/pr-detail/diff/SplitDiffView';
import { UnifiedDiffView } from '@/components/pr-detail/diff/UnifiedDiffView';
import type { AppSettings } from '@/types/settings';

interface DiffOutput { patch: string; baselineRef: string; inRepo: boolean }

interface Props {
  path: string;
  relPath: string;
  initialBaseline: 'HEAD' | 'mergeBaseDefault';
  onPopOut: (baseline: 'HEAD' | 'mergeBaseDefault') => void;
}

export function DiffPreview({ path, relPath, initialBaseline, onPopOut }: Props) {
  const [baseline, setBaseline] = useState<'HEAD' | 'mergeBaseDefault'>(initialBaseline);
  const [view, setView] = useState<'unified' | 'split'>('unified');
  const [diff, setDiff] = useState<DiffOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Load persisted view mode (shared with FileViewer).
  useEffect(() => {
    invoke<AppSettings>('load_settings')
      .then((s) => {
        const v = s.ui?.fileViewerDefaultViewMode;
        if (v === 'split' || v === 'unified') setView(v);
      })
      .catch(() => {});
  }, []);

  // Persist view mode on change.
  const setViewPersist = useCallback((v: 'unified' | 'split') => {
    setView(v);
    void invoke<AppSettings>('load_settings')
      .then((s) =>
        invoke('save_settings', { settings: { ...s, ui: { ...s.ui, fileViewerDefaultViewMode: v } } }),
      )
      .catch(() => {});
  }, []);

  useEffect(() => { setBaseline(initialBaseline); }, [path, initialBaseline]);

  useEffect(() => {
    setDiff(null);
    setError(null);
    invoke<DiffOutput>('git_file_diff', { path, baseline })
      .then((d) => setDiff(d))
      .catch((e) => setError(typeof e === 'string' ? e : (e as { message?: string }).message ?? 'Error'));
  }, [path, baseline]);

  const hunks = useMemo(() => (diff?.patch ? parsePatch(diff.patch) : []), [diff]);
  const syntaxHighlights = useSyntaxHighlight(path, hunks);

  const totalAdd = hunks.reduce((s, h) => s + h.lines.filter((l) => l.kind === 'add').length, 0);
  const totalDel = hunks.reduce((s, h) => s + h.lines.filter((l) => l.kind === 'del').length, 0);

  const scrollToHunk = useCallback((delta: 1 | -1) => {
    const root = bodyRef.current;
    if (!root) return;
    const hunkEls = Array.from(root.querySelectorAll<HTMLElement>('[data-hunk]'));
    if (hunkEls.length === 0) return;
    const top = root.scrollTop;
    const idx = hunkEls.findIndex((el) => el.offsetTop > top + 4);
    let target: HTMLElement | undefined;
    if (delta === 1) {
      target = idx >= 0 ? hunkEls[idx] : hunkEls[hunkEls.length - 1];
    } else {
      const before = hunkEls.filter((el) => el.offsetTop < top - 4);
      target = before[before.length - 1] ?? hunkEls[0];
    }
    if (target) root.scrollTop = target.offsetTop;
  }, []);

  return (
    <div className="bd-fp-preview bd-fp-preview--diff">
      <div className="bd-fp-preview-actionbar">
        <span className="bd-mono">{relPath}</span>
        <span style={{ color: 'var(--color-status-green)', fontFamily: 'var(--font-code)', fontSize: 10 }}>+{totalAdd}</span>
        <span style={{ color: 'var(--color-status-red)', fontFamily: 'var(--font-code)', fontSize: 10 }}>−{totalDel}</span>
        <span className="bd-fp-preview-spacer" />
        <SegToggle value={baseline} onChange={setBaseline} options={[
          { id: 'HEAD', label: 'vs HEAD' },
          { id: 'mergeBaseDefault', label: 'vs main' },
        ]} />
        <SegToggle value={view} onChange={setViewPersist} options={[
          { id: 'unified', label: 'Unified' },
          { id: 'split', label: 'Split' },
        ]} />
        <button type="button" aria-label="Copy patch"
          onClick={() => diff?.patch && navigator.clipboard.writeText(diff.patch)}>📋</button>
        <button type="button" aria-label="Open in window" onClick={() => onPopOut(baseline)}>↗</button>
      </div>
      <div className="bd-fp-preview-hunknav">
        <span className="bd-mono">{hunks.length} hunk{hunks.length === 1 ? '' : 's'}</span>
        <span className="bd-fp-preview-spacer" />
        <button type="button" onClick={() => scrollToHunk(-1)}>↑ Prev</button>
        <button type="button" onClick={() => scrollToHunk(1)}>Next ↓</button>
        <Kbd>Ctrl+/</Kbd>
      </div>
      <div ref={bodyRef} className="bd-fp-preview-body bd-scroll">
        {error ? (
          <div className="bd-fp-preview-error">{error}</div>
        ) : diff == null ? (
          <div className="bd-fp-preview-loading">Loading diff…</div>
        ) : !diff.inRepo ? (
          <div className="bd-fp-preview-empty">Not in a git repository</div>
        ) : hunks.length === 0 ? (
          <div className="bd-fp-preview-empty">No changes vs {diff.baselineRef}</div>
        ) : view === 'split' ? (
          <SplitDiffView hunks={hunks} syntaxHighlights={syntaxHighlights} />
        ) : (
          <UnifiedDiffView hunks={hunks} syntaxHighlights={syntaxHighlights} />
        )}
      </div>
    </div>
  );
}

interface SegToggleProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}

function SegToggle<T extends string>({ value, onChange, options }: SegToggleProps<T>) {
  return (
    <div className="bd-fp-segtoggle">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`bd-fp-segtoggle__btn${value === o.id ? ' bd-fp-segtoggle__btn--on' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify `SplitDiffView` / `UnifiedDiffView` emit `data-hunk` markers**

```bash
grep -rn "data-hunk" src/BorgDock.Tauri/src/components/pr-detail/diff/ 2>&1 | head -5
```

If they don't, add a `data-hunk` attribute on the wrapper div per hunk inside both views (so the Prev/Next scroll works). If they do, no change needed.

- [ ] **Step 5: Add CSS**

Append:

```css
.bd-fp-preview-actionbar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--color-subtle-border);
  background: var(--color-surface);
}
.bd-fp-preview-spacer { flex: 1; }
.bd-fp-preview-hunknav {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--color-subtle-border);
  background: var(--color-surface);
  font-size: 10px;
  color: var(--color-text-muted);
}
.bd-fp-preview-body {
  flex: 1;
  overflow: auto;
  background: var(--color-background);
}
.bd-fp-segtoggle {
  display: flex;
  border: 1px solid var(--color-subtle-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--color-background);
}
.bd-fp-segtoggle__btn {
  padding: 0 9px; height: 22px;
  font-size: 10.5px; font-weight: 500;
  border: none; cursor: pointer;
  background: transparent;
  color: var(--color-text-tertiary);
  font-family: inherit;
}
.bd-fp-segtoggle__btn--on {
  background: var(--color-accent-subtle);
  color: var(--color-accent);
  font-weight: 600;
}
.bd-fp-preview-pill {
  font-size: 9.5px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-surface-hover);
  color: var(--color-text-tertiary);
  text-transform: uppercase;
}
```

- [ ] **Step 6: Run tests**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/DiffPreview.tsx src/BorgDock.Tauri/src/components/file-palette/__tests__/DiffPreview.test.tsx src/BorgDock.Tauri/src/components/file-palette/file-palette.css src/BorgDock.Tauri/src/components/pr-detail/diff/SplitDiffView.tsx src/BorgDock.Tauri/src/components/pr-detail/diff/UnifiedDiffView.tsx
git commit -m "feat(file-palette): inline diff preview with split/unified, vs HEAD/main toggle, hunk nav"
```

---

## Task 16: Find-in-file scanning in `FilePaletteCodeView`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteCodeView.tsx`
- Create: `src/BorgDock.Tauri/src/components/file-palette/__tests__/find-in-file.test.ts` (pure-fn test for the scan helper)

- [ ] **Step 1: Define the match shape and a pure scanner**

Add an exported helper near the top of `FilePaletteCodeView.tsx`:

```tsx
export interface FindMatch { line: number; col: number; length: number }

export function scanFindMatches(content: string, term: string): FindMatch[] {
  if (!term) return [];
  const out: FindMatch[] = [];
  const lower = term.toLowerCase();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const hay = lines[i].toLowerCase();
    let from = 0;
    while (from < hay.length) {
      const idx = hay.indexOf(lower, from);
      if (idx < 0) break;
      out.push({ line: i + 1, col: idx, length: term.length });
      from = idx + Math.max(1, term.length);
    }
  }
  return out;
}
```

- [ ] **Step 2: Failing test**

Create `src/BorgDock.Tauri/src/components/file-palette/__tests__/find-in-file.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scanFindMatches } from '../FilePaletteCodeView';

describe('scanFindMatches', () => {
  it('finds case-insensitive matches with line and column', () => {
    const content = 'foo\nFooBar\nzzz';
    const m = scanFindMatches(content, 'foo');
    expect(m).toEqual([
      { line: 1, col: 0, length: 3 },
      { line: 2, col: 0, length: 3 },
    ]);
  });

  it('finds multiple matches per line', () => {
    const m = scanFindMatches('abab', 'ab');
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual({ line: 1, col: 0, length: 2 });
    expect(m[1]).toEqual({ line: 1, col: 2, length: 2 });
  });

  it('returns empty for empty term', () => {
    expect(scanFindMatches('anything', '')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run scanner tests to verify pass**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/find-in-file.test.ts 2>&1 | tail -10
```

Expected: PASS (since the function is now exported).

- [ ] **Step 4: Extend `CodeViewProps` and `renderLine`**

In `FilePaletteCodeView.tsx`, extend the props:

```tsx
export interface CodeViewProps {
  path: string;
  content: string;
  scrollToLine?: number;
  highlightedLines?: number[];
  onIdentifierJump?: (word: string) => void;
  findMatches?: FindMatch[];
  /** Index into `findMatches` indicating the active match (for emphasis). */
  findCurrent?: number;
}
```

Group matches by line for fast lookup, just before the `lines.map` JSX:

```tsx
  const findByLine = useMemo(() => {
    const map = new Map<number, Array<FindMatch & { _idx: number }>>();
    (findMatches ?? []).forEach((m, _idx) => {
      const list = map.get(m.line) ?? [];
      list.push({ ...m, _idx });
      map.set(m.line, list);
    });
    return map;
  }, [findMatches]);
```

In the JSX, replace `renderLine(text, spans?.get(i) ?? null)` with:

```tsx
              {renderLine(
                text,
                spans?.get(i) ?? null,
                findByLine.get(lineNo) ?? [],
                findCurrent ?? -1,
              )}
```

Replace `renderLine` with this version that splices in find-match wrappers as a post-process over the syntax-emitted slices:

```tsx
function renderLine(
  text: string,
  spans: HighlightSpan[] | null,
  matches: Array<FindMatch & { _idx: number }>,
  current: number,
): React.ReactNode {
  // First build a flat list of (start, end, node) atoms reflecting syntax-highlighted
  // text. If no syntax spans, the whole line is one atom.
  type Atom = { start: number; end: number; renderText: (slice: string) => React.ReactNode };
  const atoms: Atom[] = [];
  if (!spans || spans.length === 0) {
    atoms.push({ start: 0, end: text.length, renderText: (s) => s });
  } else {
    let cursor = 0;
    spans.forEach((span, idx) => {
      if (span.start > cursor) {
        atoms.push({ start: cursor, end: span.start, renderText: (s) => s });
      }
      atoms.push({
        start: span.start,
        end: span.end,
        renderText: (s) => (
          <span
            key={`syn-${idx}`}
            className={`hl-${span.category}`}
            style={{ color: `var(${getHighlightClass(span.category)})` }}
          >
            {s}
          </span>
        ),
      });
      cursor = span.end;
    });
    if (cursor < text.length) atoms.push({ start: cursor, end: text.length, renderText: (s) => s });
  }
  // Sort matches by col so we can walk in order.
  const sortedMatches = [...matches].sort((a, b) => a.col - b.col);

  // Render each atom, splicing in find-match wrappers where matches overlap.
  const out: React.ReactNode[] = [];
  let key = 0;
  for (const atom of atoms) {
    let pos = atom.start;
    while (pos < atom.end) {
      const overlap = sortedMatches.find((m) => m.col + m.length > pos && m.col < atom.end);
      if (!overlap || overlap.col >= atom.end) {
        out.push(
          <span key={key++}>{atom.renderText(text.slice(pos, atom.end))}</span>,
        );
        pos = atom.end;
        break;
      }
      const matchStart = Math.max(pos, overlap.col);
      const matchEnd = Math.min(atom.end, overlap.col + overlap.length);
      if (matchStart > pos) {
        out.push(<span key={key++}>{atom.renderText(text.slice(pos, matchStart))}</span>);
      }
      const isCurrent = overlap._idx === current;
      out.push(
        <span
          key={key++}
          className={`bd-fp-find-match${isCurrent ? ' bd-fp-find-match--current' : ''}`}
        >
          {atom.renderText(text.slice(matchStart, matchEnd))}
        </span>,
      );
      pos = matchEnd;
      // Drop matches that we've fully consumed so subsequent overlap lookups skip them.
      if (overlap.col + overlap.length <= pos) {
        sortedMatches.splice(sortedMatches.indexOf(overlap), 1);
      }
    }
  }
  return text === '' ? ' ' : out;
}
```

This composes correctly with syntax highlighting: the find-match wrapper sets only `background`, while the inner syntax span continues to set `color`.

CSS:

```css
.bd-fp-find-match {
  background: rgba(255, 220, 0, 0.35);
  border-radius: 2px;
}
.bd-fp-find-match--current {
  background: rgba(255, 165, 0, 0.6);
  outline: 1px solid var(--color-status-yellow);
}
```

- [ ] **Step 5: Run all FilePaletteCodeView tests**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette/__tests__/FilePaletteCodeView.test.tsx 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteCodeView.tsx src/BorgDock.Tauri/src/components/file-palette/__tests__/find-in-file.test.ts src/BorgDock.Tauri/src/components/file-palette/file-palette.css
git commit -m "feat(file-palette): add scanFindMatches scanner and match overlay rendering"
```

---

## Task 17: Find-in-file UI strip in `FilePreview`

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePreview.tsx`

- [ ] **Step 1: Add strip state and Ctrl+F binding**

In `FilePreview.tsx`, add:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Kbd } from '@/components/shared/primitives';
import { scanFindMatches, type FindMatch } from './FilePaletteCodeView';
```

Inside the component, after content state:

```tsx
  const [findOpen, setFindOpen] = useState(false);
  const [findTerm, setFindTerm] = useState('');
  const [findIdx, setFindIdx] = useState(0);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  const matches: FindMatch[] = useMemo(
    () => (content ? scanFindMatches(content, findTerm) : []),
    [content, findTerm],
  );

  useEffect(() => {
    if (matches.length === 0) setFindIdx(0);
    else if (findIdx >= matches.length) setFindIdx(0);
  }, [matches, findIdx]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setFindOpen(true);
        setTimeout(() => findInputRef.current?.focus(), 0);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const stepFind = (delta: 1 | -1) => {
    if (matches.length === 0) return;
    setFindIdx((i) => (i + delta + matches.length) % matches.length);
  };

  const currentMatchLine = matches[findIdx]?.line;
```

- [ ] **Step 2: Render the strip**

Insert after the action bar in the JSX:

```tsx
      {findOpen && (
        <div className="bd-fp-find-strip">
          <input
            ref={findInputRef}
            value={findTerm}
            onChange={(e) => setFindTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
              if (e.key === 'Escape') { e.preventDefault(); setFindOpen(false); setFindTerm(''); }
            }}
            placeholder="Find in file…"
            className="bd-fp-find-input"
            aria-label="Find in file"
          />
          <span className="bd-mono">{matches.length === 0 ? '0' : `${findIdx + 1} of ${matches.length}`}</span>
          <button type="button" aria-label="Previous match" onClick={() => stepFind(-1)}>↑</button>
          <button type="button" aria-label="Next match" onClick={() => stepFind(1)}>↓</button>
          <button type="button" aria-label="Close find" onClick={() => { setFindOpen(false); setFindTerm(''); }}>✕</button>
          <span className="bd-fp-preview-spacer" />
          <Kbd>Esc</Kbd>
        </div>
      )}
```

Pass matches to the code view:

```tsx
          <FilePaletteCodeView
            path={path}
            content={content}
            scrollToLine={currentMatchLine ?? scrollToLine}
            highlightedLines={contentHit?.matches.map((m) => m.line)}
            onIdentifierJump={onIdentifierJump}
            findMatches={matches}
            findCurrent={findIdx}
          />
```

- [ ] **Step 3: CSS for the strip**

```css
.bd-fp-find-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--color-subtle-border);
  background: var(--color-surface);
  font-size: 11px;
}
.bd-fp-find-input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 11px;
  color: var(--color-text-primary);
  font-family: inherit;
}
```

- [ ] **Step 4: Run all file-palette tests**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePreview.tsx src/BorgDock.Tauri/src/components/file-palette/file-palette.css
git commit -m "feat(file-palette): functional find-in-file strip in FilePreview"
```

---

## Task 18: Status bar content + final wire-up

**Files:**
- Modify: `src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx`

- [ ] **Step 1: Compute status bar values**

In `FilePaletteApp.tsx`, just before the `return`, add:

```tsx
  const activeRootCount = activeRoot ? changeCounts.get(activeRoot) : null;
  const activeRootLabel =
    roots.find((r) => r.path === activeRoot)?.label ?? '—';
  const indexedCount = fileIndex.entries.length;
```

(`fileIndex.entries` is already in scope; if it's not exposed, replace with `0` or compute via `useFileIndex` return shape.)

- [ ] **Step 2: Update WindowStatusBar `left` slot**

Replace the placeholder status bar from Task 8 with:

```tsx
      <WindowStatusBar
        left={
          <span className="bd-mono bd-fp-status">
            {activeRootLabel} · {indexedCount.toLocaleString()} indexed
            {activeRootCount && (
              <>
                {' · '}
                <span style={{ color: 'var(--color-status-yellow)' }}>
                  {activeRootCount.count} changed vs HEAD
                </span>
                {(activeRootCount.addTotal > 0 || activeRootCount.delTotal > 0) && (
                  <>
                    {' · '}
                    <span style={{ color: 'var(--color-status-green)' }}>+{activeRootCount.addTotal}</span>{' '}
                    <span style={{ color: 'var(--color-status-red)' }}>−{activeRootCount.delTotal}</span>
                  </>
                )}
              </>
            )}
          </span>
        }
        right={
          <span className="bd-mono">
            <Kbd>↑↓</Kbd> nav · <Kbd>↵</Kbd> open · <Kbd>Tab</Kbd> roots · <Kbd>Ctrl+/</Kbd> diff view · <Kbd>Esc</Kbd>
          </span>
        }
      />
```

- [ ] **Step 3: Add Tab-to-Roots and Ctrl+/ keybinds**

In the existing `handleKey` callback, add:

```tsx
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const firstRoot = document.querySelector<HTMLButtonElement>('.bd-fp-root-row');
        firstRoot?.focus();
        return;
      }
      if (e.ctrlKey && e.key === '/') {
        // Ctrl+/ toggles unified/split when a diff is shown — handled by DiffPreview
        // through window keydown; intentionally no-op here so we don't double-fire.
        return;
      }
```

For `Ctrl+/` handling inside `DiffPreview`, add a `window.addEventListener` in its component:

```tsx
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        setViewPersist(view === 'unified' ? 'split' : 'unified');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, setViewPersist]);
```

- [ ] **Step 4: Run all file-palette tests**

```bash
cd src/BorgDock.Tauri && npx vitest run src/components/file-palette 2>&1 | tail -25
```

Expected: PASS.

- [ ] **Step 5: Run the full test suite once more**

```bash
cd src/BorgDock.Tauri && npx vitest run 2>&1 | tail -25
```

Expected: PASS overall.

- [ ] **Step 6: Smoke test in dev**

```bash
cd src/BorgDock.Tauri && npm run tauri dev
```

Manually verify in the running app:
- Press the file-palette hotkey (`Ctrl+F8`)
- Window opens at 1280×760, can be resized
- Titlebar shows "Files" and "Ctrl+F8" hint, min/max/close work
- Roots column: worktrees show count badges where applicable
- Type a search term: filename results
- Type `>foo` — Content chip activates
- Type `@foo` — Symbol chip activates
- Click "Changes" chip — Results hide, Changes section visible
- Click a Changes row — diff appears inline in right pane
- Toggle vs HEAD / vs main — diff refreshes
- Toggle Unified / Split (or `Ctrl+/`) — view changes
- Click "Open in window" — full file viewer window opens
- Click a Files (Results) row — file content shows in right pane
- Press `Ctrl+F` — find strip appears, type a term, Enter cycles matches
- Press `Esc` — find strip closes, query intact; second `Esc` closes window
- Status bar at bottom shows root, indexed count, changed count, +/− totals

- [ ] **Step 7: Commit**

```bash
git add src/BorgDock.Tauri/src/components/file-palette/FilePaletteApp.tsx src/BorgDock.Tauri/src/components/file-palette/DiffPreview.tsx
git commit -m "feat(file-palette): populate status bar, wire Tab-to-Roots and Ctrl+/ for diff toggle"
```

---

## Self-review notes

After implementation, the engineer should verify against the spec sections:

- **Inline diff preview**: covered by Tasks 14, 15
- **Open in window**: Task 14 (`onPopOut`), Task 15 (passes `baseline`)
- **Scope chips**: Task 9
- **Changes tri-toggle + section collapse + per-row +/-**: Task 12
- **Worktree change-count badges**: Tasks 7, 10
- **Shared title + status bar**: Task 8 (chrome), Task 18 (status content)
- **Window 1280×760**: Task 4
- **SQL kbd hint**: Task 5
- **Numstat backend**: Tasks 1, 2
- **Settings keys**: Task 6
- **Find-in-file functional**: Tasks 16, 17
- **No new "Pinned" / "Sidebar" buttons**: deliberately omitted from Task 8
