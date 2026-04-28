import { invoke } from '@tauri-apps/api/core';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createLogger } from '@/services/logger';
import { Button, Card, Chip, IconButton, Input, Pill } from '@/components/shared/primitives';

const log = createLogger('CheckoutFlow');

interface WorktreeBareEntry {
  path: string;
  branchName: string;
  isMainWorktree: boolean;
}

interface WorktreeFullEntry extends WorktreeBareEntry {
  status: 'clean' | 'dirty' | 'conflict';
  uncommittedCount: number;
  ahead: number;
  behind: number;
  commitSha: string;
}

interface WorktreeEntry extends WorktreeBareEntry {
  status?: 'clean' | 'dirty' | 'conflict';
  uncommittedCount?: number;
  ahead?: number;
  behind?: number;
  commitSha?: string;
}

interface GitStep {
  cmd: string;
  cwd: string;
  output: string;
  exitCode: number;
  ok: boolean;
}

interface CheckoutPrResult {
  worktreePath: string;
  steps: GitStep[];
}

type Mode =
  | { kind: 'picking' }
  | { kind: 'creating' }
  | { kind: 'running'; target: string }
  | { kind: 'ready'; worktreePath: string }
  | { kind: 'success'; worktreePath: string; steps: GitStep[] }
  | { kind: 'error'; steps: GitStep[]; error: string };

type Selection =
  | { kind: 'existing'; path: string }
  | { kind: 'new'; name: string };

export interface CheckoutFlowProps {
  branchName: string;
  repoBasePath: string;
  worktreeSubfolder: string;
  favoritePaths?: string[];
  favoritesOnlyDefault?: boolean;
  windowsTerminalProfile?: string;
  onDismiss: () => void;
}

function sanitizeBranchForPath(name: string): string {
  let s = name.replaceAll('/', '-');
  s = s.replace(/[<>:"|?*\\]/g, '');
  while (s.includes('--')) s = s.replaceAll('--', '-');
  return s.replace(/^[-.]+|[-.]+$/g, '');
}

function shortPath(full: string, basePath: string): string {
  if (!basePath) return full;
  const normalized = basePath.replace(/[\\/]+$/, '');
  if (
    full.toLowerCase().startsWith((normalized + '\\').toLowerCase()) ||
    full.toLowerCase().startsWith((normalized + '/').toLowerCase())
  ) {
    return full.slice(normalized.length + 1).replaceAll('\\', '/');
  }
  return full;
}

function statusLabel(w: WorktreeEntry): string | null {
  if (w.status === undefined) return null;
  if (w.status === 'conflict') return 'conflicts';
  if (w.status === 'dirty') return `${w.uncommittedCount ?? '?'} uncommitted`;
  return 'clean';
}

export function CheckoutFlow({
  branchName,
  repoBasePath,
  worktreeSubfolder,
  favoritePaths,
  favoritesOnlyDefault,
  windowsTerminalProfile,
  onDismiss,
}: CheckoutFlowProps) {
  const defaultName = useMemo(() => sanitizeBranchForPath(branchName), [branchName]);
  const favoriteSet = useMemo(() => new Set(favoritePaths ?? []), [favoritePaths]);
  const [mode, setMode] = useState<Mode>({ kind: 'picking' });
  const [worktrees, setWorktrees] = useState<WorktreeEntry[] | null>(null);
  const [worktreesError, setWorktreesError] = useState<string | null>(null);
  const [showMain, setShowMain] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(
    (favoritesOnlyDefault ?? false) && (favoritePaths?.length ?? 0) > 0,
  );
  const [selection, setSelection] = useState<Selection>({ kind: 'new', name: defaultName });
  const [newName, setNewName] = useState(defaultName);

  // Load worktrees on mount — two-phase:
  //   1. list_worktrees_bare (instant: just paths + branches) → render rows now
  //   2. list_worktrees (slower: adds dirty/ahead/behind) → merge when it arrives
  useEffect(() => {
    let cancelled = false;
    if (!repoBasePath) {
      setWorktreesError('No worktree base path is configured for this repo. Open Settings and fill it in.');
      setWorktrees([]);
      return;
    }
    invoke<WorktreeBareEntry[]>('list_worktrees_bare', { basePath: repoBasePath })
      .then((entries) => {
        if (cancelled) return;
        setWorktrees(entries);
        const match = entries.find(
          (w) => !w.isMainWorktree && w.branchName === branchName,
        );
        if (match) {
          setSelection({ kind: 'existing', path: match.path });
          // Branch is already checked out in a worktree — skip the picker and
          // land directly on the action buttons. User can still "pick another
          // worktree" from there if they want something different.
          setMode((m) => (m.kind === 'picking' ? { kind: 'ready', worktreePath: match.path } : m));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        log.error('list_worktrees_bare failed', err);
        setWorktreesError(String(err));
        setWorktrees([]);
      });

    invoke<WorktreeFullEntry[]>('list_worktrees', { basePath: repoBasePath })
      .then((full) => {
        if (cancelled) return;
        const byPath = new Map(full.map((w) => [w.path, w]));
        setWorktrees((prev) =>
          prev === null
            ? full
            : prev.map((w) => {
                const hit = byPath.get(w.path);
                return hit ? { ...w, ...hit } : w;
              }),
        );
      })
      .catch((err) => {
        // Status info is best-effort; rows still usable from the bare response.
        log.warn('list_worktrees (full) failed', err);
      });

    return () => {
      cancelled = true;
    };
  }, [repoBasePath, branchName]);

  const nonMainWorktrees = useMemo(
    () => (worktrees ?? []).filter((w) => !w.isMainWorktree),
    [worktrees],
  );
  const visibleWorktrees = useMemo(() => {
    // Always keep the worktree that already holds this PR's branch, and the
    // currently selected one, regardless of the favorites filter — otherwise
    // the picker could hide the auto-selected row and feel broken.
    if (!favoritesOnly) return nonMainWorktrees;
    const keepSelected = selection.kind === 'existing' ? selection.path : null;
    return nonMainWorktrees.filter(
      (w) =>
        favoriteSet.has(w.path) || w.branchName === branchName || w.path === keepSelected,
    );
  }, [nonMainWorktrees, favoritesOnly, favoriteSet, selection, branchName]);
  const mainWorktree = useMemo(
    () => (worktrees ?? []).find((w) => w.isMainWorktree),
    [worktrees],
  );

  const fullNewPath = useMemo(() => {
    if (!repoBasePath) return '';
    const base = repoBasePath.replace(/[\\/]+$/, '');
    const sub = (worktreeSubfolder || '.worktrees').replace(/[\\/]+$/, '');
    const name = sanitizeBranchForPath(newName || defaultName);
    const sep = base.includes('\\') ? '\\' : '/';
    return [base, sub, name].join(sep);
  }, [repoBasePath, worktreeSubfolder, newName, defaultName]);

  const runCheckout = useCallback(
    async (sel: Selection) => {
      const target =
        sel.kind === 'existing'
          ? shortPath(sel.path, repoBasePath) || sel.path
          : `${worktreeSubfolder || '.worktrees'}/${sanitizeBranchForPath(sel.name || defaultName)}`;
      setMode({ kind: 'running', target });
      try {
        const args =
          sel.kind === 'existing'
            ? {
                baseRepoPath: repoBasePath,
                branchName,
                existingWorktreePath: sel.path,
              }
            : {
                baseRepoPath: repoBasePath,
                branchName,
                newWorktreeSubfolder: worktreeSubfolder || '.worktrees',
                newWorktreeName: sanitizeBranchForPath(sel.name || defaultName),
              };
        const result = await invoke<CheckoutPrResult>('checkout_pr', args);
        setMode({
          kind: 'success',
          worktreePath: result.worktreePath,
          steps: result.steps,
        });
      } catch (err) {
        log.error('checkout_pr failed', err);
        setMode({
          kind: 'error',
          steps: [],
          error: String(err),
        });
      }
    },
    [branchName, repoBasePath, worktreeSubfolder, defaultName],
  );

  const runAction = useCallback(
    async (command: string, path: string) => {
      try {
        const args: Record<string, unknown> = { path };
        if (command === 'launch_claude_in_terminal' && windowsTerminalProfile?.trim()) {
          args.profileOverride = windowsTerminalProfile.trim();
        }
        await invoke(command, args);
      } catch (err) {
        log.error(`${command} failed`, err);
      }
    },
    [windowsTerminalProfile],
  );

  // ───────── Ready surface (branch already checked out) ─────────
  if (mode.kind === 'ready') {
    const wt = nonMainWorktrees.find((w) => w.path === mode.worktreePath);
    return (
      <div
        className="rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] overflow-hidden"
        data-checkout-stage="done"
      >
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] text-[var(--color-text-secondary)] border-b border-[var(--color-separator)]"
          // style: status-driven gradient stripe — color-mix percentage CSS gradient, no Tailwind equivalent
          style={{
            background:
              'linear-gradient(90deg, color-mix(in srgb, var(--color-status-green) 7%, transparent) 0%, transparent 40%)',
          }}
        >
          <span className="inline-flex w-[14px] h-[14px] rounded-full items-center justify-center text-[var(--color-status-green)] text-[10px] bg-[color-mix(in_srgb,var(--color-status-green)_14%,transparent)]">
            ✓
          </span>
          <span>
            Already checked out{' '}
            <strong className="text-[var(--color-text-primary)] font-medium font-mono text-[11.5px]">
              {branchName}
            </strong>
          </span>
          <span className="ml-auto">
            <IconButton
              icon={<XIcon />}
              tooltip="Dismiss"
              size={22}
              aria-label="Dismiss"
              onClick={onDismiss}
              data-checkout-dismiss
            />
          </span>
        </div>
        <div className="px-3.5 py-2 text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[var(--color-text-secondary)]">
            {shortPath(mode.worktreePath, repoBasePath)}
          </span>
          {wt?.status && (
            <>
              <Sep />
              <StatusDot status={wt.status} />
              <span>{statusLabel(wt)}</span>
            </>
          )}
          {wt && ((wt.ahead ?? 0) > 0 || (wt.behind ?? 0) > 0) && (
            <>
              <Sep />
              <span className="font-mono text-[10.5px]">
                {(wt.ahead ?? 0) > 0 ? `↑${wt.ahead}` : ''}
                {(wt.ahead ?? 0) > 0 && (wt.behind ?? 0) > 0 ? ' ' : ''}
                {(wt.behind ?? 0) > 0 ? `↓${wt.behind}` : ''}
              </span>
            </>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1.5 px-3 pb-2 pt-1">
          <Chip
            onClick={() => runAction('reveal_in_file_manager', mode.worktreePath)}
            data-checkout-launch="explorer"
            className="!flex-col !gap-1 !py-2.5"
          >
            <span className="w-4 h-4">{iconFolder}</span>
            Explorer
          </Chip>
          <Chip
            onClick={() => runAction('open_in_terminal', mode.worktreePath)}
            data-checkout-launch="terminal"
            className="!flex-col !gap-1 !py-2.5"
          >
            <span className="w-4 h-4">{iconTerminal}</span>
            Terminal
          </Chip>
          <Chip
            onClick={() => runAction('launch_claude_in_terminal', mode.worktreePath)}
            data-checkout-launch="claude"
            className="!flex-col !gap-1 !py-2.5"
          >
            <span className="w-4 h-4">{iconSparkle}</span>
            Claude
          </Chip>
          <Chip
            onClick={() => runAction('open_in_editor', mode.worktreePath)}
            data-checkout-launch="vscode"
            className="!flex-col !gap-1 !py-2.5"
          >
            <span className="w-4 h-4">{iconCode}</span>
            VSCode
          </Chip>
        </div>
        <div className="flex justify-end px-3 pb-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode({ kind: 'picking' })}
          >
            pick a different worktree
          </Button>
        </div>
      </div>
    );
  }

  // ───────── Running & done surfaces ─────────
  if (mode.kind === 'running' || mode.kind === 'success' || mode.kind === 'error') {
    const steps = mode.kind === 'success' ? mode.steps : [];
    const stageAttr = mode.kind === 'running' ? 'running' : 'done';
    return (
      <div
        className="rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] overflow-hidden"
        data-checkout-stage={stageAttr}
      >
        <StatusStrip mode={mode} branchName={branchName} />
        {mode.kind !== 'running' && <LogBlock steps={steps} error={mode.kind === 'error' ? mode.error : undefined} />}
        {mode.kind === 'running' && (
          <div className="mx-[6px] mt-2 mb-3 bg-[var(--color-background)] border border-[var(--color-separator)] rounded-md font-mono text-[11px] leading-[1.55] px-3 py-2.5">
            <div className="text-[var(--color-text-ghost)]">cwd: {repoBasePath}</div>
            <div className="mt-1">
              <span className="text-[var(--color-text-ghost)]">$ </span>
              <span className="text-[var(--color-accent)]">git fetch origin {branchName}</span>
            </div>
            <div className="mt-1 text-[var(--color-text-muted)]">
              <span className="text-[var(--color-text-ghost)]">$ </span>
              <span>
                {selection.kind === 'existing'
                  ? `git -C <worktree> checkout -B ${branchName} origin/${branchName}`
                  : `git worktree add -B ${branchName} <path> origin/${branchName}`}
              </span>
              <span className="inline-block w-[6px] h-[12px] bg-[var(--color-accent)] ml-1 align-[-2px] animate-pulse" />
            </div>
          </div>
        )}
        {mode.kind === 'success' && (
          <div className="grid grid-cols-4 gap-1.5 px-3 pb-3 pt-2">
            <Chip
              onClick={() => runAction('reveal_in_file_manager', mode.worktreePath)}
              data-checkout-launch="explorer"
              className="!flex-col !gap-1 !py-2.5"
            >
              <span className="w-4 h-4">{iconFolder}</span>
              Explorer
            </Chip>
            <Chip
              onClick={() => runAction('open_in_terminal', mode.worktreePath)}
              data-checkout-launch="terminal"
              className="!flex-col !gap-1 !py-2.5"
            >
              <span className="w-4 h-4">{iconTerminal}</span>
              Terminal
            </Chip>
            <Chip
              onClick={() => runAction('launch_claude_in_terminal', mode.worktreePath)}
              data-checkout-launch="claude"
              className="!flex-col !gap-1 !py-2.5"
            >
              <span className="w-4 h-4">{iconSparkle}</span>
              Claude
            </Chip>
            <Chip
              onClick={() => runAction('open_in_editor', mode.worktreePath)}
              data-checkout-launch="vscode"
              className="!flex-col !gap-1 !py-2.5"
            >
              <span className="w-4 h-4">{iconCode}</span>
              VSCode
            </Chip>
          </div>
        )}
        {mode.kind === 'error' && (
          <div className="flex justify-between gap-2 px-3 py-2 border-t border-[var(--color-separator)]">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              data-checkout-action="cancel"
            >
              Dismiss
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setMode({ kind: 'picking' })}
              data-checkout-action="retry"
            >
              Retry
            </Button>
          </div>
        )}
        {mode.kind === 'success' && (
          <div className="flex justify-end px-3 pb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              data-checkout-action="done"
            >
              dismiss
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ───────── Create new worktree form ─────────
  if (mode.kind === 'creating') {
    return (
      <div
        className="rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] overflow-hidden"
        data-checkout-stage="form"
      >
        <DrawerHeader branchName={branchName} label="New worktree for" onDismiss={onDismiss} />
        <div className="px-3 py-3 grid gap-3">
          <div className="grid gap-1.5">
            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Name
            </label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              spellCheck={false}
              placeholder="my-feature-branch"
              data-checkout-input="worktree-name"
            />
            <div className="font-mono text-[10.5px] text-[var(--color-text-ghost)]">
              Slashes in the branch name are replaced with dashes.
            </div>
          </div>
          <div className="grid gap-1.5">
            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Full path
            </label>
            <div className="font-mono text-[11px] text-[var(--color-text-secondary)] bg-[var(--color-background)] border border-[var(--color-separator)] rounded-sm px-2 py-1.5 overflow-x-auto whitespace-nowrap">
              {fullNewPath || '(no base path configured)'}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2 px-3 pb-3 pt-2 border-t border-[var(--color-separator)]">
          <Button
            variant="ghost"
            size="sm"
            leading={<ArrowLeftIcon />}
            onClick={() => setMode({ kind: 'picking' })}
          >
            Back
          </Button>
          <Button
            variant="primary"
            size="sm"
            trailing={<ArrowRightIcon />}
            disabled={!repoBasePath || !newName.trim()}
            onClick={() => runCheckout({ kind: 'new', name: newName.trim() })}
            data-checkout-action="create"
          >
            Create &amp; check out
          </Button>
        </div>
      </div>
    );
  }

  // ───────── Picker ─────────
  const hasNonMain = nonMainWorktrees.length > 0;
  const hasVisible = visibleWorktrees.length > 0;
  const isListLoading = worktrees === null && !worktreesError;

  return (
    <div
      className="rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] overflow-hidden"
      data-checkout-stage="picker"
    >
      <DrawerHeader branchName={branchName} label="Checkout" suffix="into…" onDismiss={onDismiss} />

      <div className="flex items-center gap-2 px-3.5 pt-3 pb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        <span>Existing worktrees</span>
        <span className="flex-1 h-px bg-[var(--color-separator)]" />
        {favoriteSet.size > 0 && (
          <IconButton
            icon={<StarIcon filled={favoritesOnly} />}
            active={favoritesOnly}
            tooltip={favoritesOnly ? 'Showing favorites only — click to show all' : 'Show favorites only'}
            size={22}
            onClick={() => setFavoritesOnly((v) => !v)}
            data-checkout-favorites-toggle
          />
        )}
      </div>

      {isListLoading && (
        <div className="px-3 pb-2 text-[11px] text-[var(--color-text-muted)]">Loading…</div>
      )}

      {worktreesError && (
        <div className="mx-[6px] mb-2 rounded-md border border-dashed border-[var(--color-subtle-border)] px-3 py-2.5 text-[11.5px] leading-[1.5] text-[var(--color-text-muted)]">
          {worktreesError}
        </div>
      )}

      {!isListLoading && !worktreesError && !hasNonMain && (
        <div className="mx-[6px] mb-2 rounded-md border border-dashed border-[var(--color-subtle-border)] px-3 py-2.5 text-[11.5px] leading-[1.5] text-[var(--color-text-muted)]">
          No worktrees yet. Create one below to safely check out this branch without touching your current working tree.
        </div>
      )}

      {hasNonMain && !hasVisible && favoritesOnly && (
        <div className="mx-[6px] mb-2 rounded-md border border-dashed border-[var(--color-subtle-border)] px-3 py-2.5 text-[11.5px] leading-[1.5] text-[var(--color-text-muted)]">
          No favorited worktrees. Star a worktree in the palette, or{' '}
          <button
            type="button"
            onClick={() => setFavoritesOnly(false)}
            className="underline decoration-dotted underline-offset-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-transparent border-none cursor-pointer p-0"
          >
            show all
          </button>
          .
        </div>
      )}

      {hasVisible && (
        <div className="px-1.5 pb-2.5 flex flex-col gap-0.5">
          {visibleWorktrees.map((w) => {
            const selected = selection.kind === 'existing' && selection.path === w.path;
            const isCurrent = w.branchName === branchName;
            const isFav = favoriteSet.has(w.path);
            return (
              <Card
                key={w.path}
                variant={selected ? 'own' : 'default'}
                padding="sm"
                interactive
                onClick={() => setSelection({ kind: 'existing', path: w.path })}
                data-worktree-row
                data-worktree-slot={w.path}
                className={clsx(
                  '!grid grid-cols-[16px_1fr_auto] items-center gap-2.5',
                  selected && 'border-[var(--color-accent)]',
                )}
              >
                <span
                  className={clsx(
                    'font-mono text-[12px] leading-none',
                    selected ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-ghost)]',
                  )}
                >
                  {selected ? '◆' : '◇'}
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-[12px] text-[var(--color-text-primary)] truncate flex items-center gap-1.5">
                    {isFav && (
                      <span
                        className="text-[var(--color-accent)] text-[10px] leading-none"
                        title="Favorite"
                        aria-label="Favorite"
                      >
                        ★
                      </span>
                    )}
                    <span className="truncate">{shortPath(w.path, repoBasePath)}</span>
                  </div>
                  <div className="mt-[3px] flex items-center gap-1.5 flex-wrap text-[11px] text-[var(--color-text-muted)]">
                    {w.status !== undefined && <StatusDot status={w.status} />}
                    <span className="font-mono text-[var(--color-text-secondary)]">{w.branchName || '(detached)'}</span>
                    {statusLabel(w) && (
                      <>
                        <Sep />
                        <span>{statusLabel(w)}</span>
                      </>
                    )}
                    {((w.ahead ?? 0) > 0 || (w.behind ?? 0) > 0) && (
                      <>
                        <Sep />
                        <span className="font-mono text-[10.5px]">
                          {(w.ahead ?? 0) > 0 ? `↑${w.ahead}` : ''}
                          {(w.ahead ?? 0) > 0 && (w.behind ?? 0) > 0 ? ' ' : ''}
                          {(w.behind ?? 0) > 0 ? `↓${w.behind}` : ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span className="flex items-center gap-1">
                  {isCurrent && <Pill tone="success">current</Pill>}
                  {!isCurrent && selected && <Pill tone="neutral">selected</Pill>}
                  {!isCurrent && !selected && <Pill tone="ghost">switch</Pill>}
                </span>
              </Card>
            );
          })}
        </div>
      )}

      <div
        className={clsx(
          'transition-opacity duration-150',
          selection.kind === 'existing'
            ? 'opacity-45 hover:opacity-100 focus-within:opacity-100'
            : 'opacity-100',
        )}
      >
        <SectionLabel>Or create a new one</SectionLabel>
        <div className="px-3 pb-2.5">
          <button
            type="button"
            onClick={() => {
              setSelection({ kind: 'new', name: newName });
              setMode({ kind: 'creating' });
            }}
            className={clsx(
              'w-full rounded-md border px-3 py-2 text-left text-[11.5px] font-medium transition-colors',
              selection.kind === 'new'
                ? 'bg-[var(--color-accent-soft)] border-[color-mix(in_srgb,var(--color-accent)_25%,transparent)] text-[var(--color-text-primary)]'
                : 'bg-[var(--color-surface)] border-[var(--color-subtle-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-icon-btn-hover)]',
            )}
          >
            + New worktree at{' '}
            <span className="font-mono text-[var(--color-text-secondary)]">
              {worktreeSubfolder || '.worktrees'}/{sanitizeBranchForPath(newName || defaultName)}
            </span>
          </button>
        </div>
      </div>

      {mainWorktree && (
        <>
          <button
            type="button"
            onClick={() => setShowMain((v) => !v)}
            className="w-full text-left font-mono text-[10.5px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] bg-transparent border-none cursor-pointer px-3.5 pb-2.5"
          >
            {showMain ? '▾ hide main worktree' : '▸ show main worktree (unsafe)'}
          </button>
          {showMain && (
            <div className="px-1.5 pb-2.5">
              <button
                type="button"
                onClick={() =>
                  setSelection({ kind: 'existing', path: mainWorktree.path })
                }
                className={clsx(
                  'relative grid grid-cols-[16px_1fr_auto] items-center gap-2.5 rounded-md px-2 py-2.5 text-left transition-colors border border-dashed w-full',
                  selection.kind === 'existing' && selection.path === mainWorktree.path
                    ? 'border-[color-mix(in_srgb,var(--color-status-red)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-status-red)_8%,transparent)]'
                    : 'border-[color-mix(in_srgb,var(--color-status-red)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-status-red)_4%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-status-red)_8%,transparent)]',
                )}
              >
                <span className="font-mono text-[12px] leading-none text-[var(--color-status-red)]">
                  {selection.kind === 'existing' && selection.path === mainWorktree.path ? '◆' : '◇'}
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-[12px] text-[var(--color-status-red)] truncate">
                    {shortPath(mainWorktree.path, repoBasePath) || mainWorktree.path}{' '}
                    <span className="text-[var(--color-text-ghost)] font-normal">(main)</span>
                  </div>
                  <div className="mt-[3px] flex items-center gap-1.5 flex-wrap text-[11px] text-[var(--color-text-muted)]">
                    {mainWorktree.status !== undefined && <StatusDot status={mainWorktree.status} />}
                    <span className="font-mono text-[var(--color-text-secondary)]">
                      {mainWorktree.branchName || '(detached)'}
                    </span>
                    {statusLabel(mainWorktree) && (
                      <>
                        <Sep />
                        <span>{statusLabel(mainWorktree)}</span>
                      </>
                    )}
                    <Sep />
                    <span className="text-[var(--color-status-red)]">overwrites your current branch</span>
                  </div>
                </div>
                <Pill tone="error">unsafe</Pill>
              </button>
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-[auto_1fr] gap-2 px-3 pb-3 pt-2 border-t border-[var(--color-separator)]">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          data-checkout-action="cancel"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          trailing={<ArrowRightIcon />}
          disabled={selection.kind === 'existing' ? false : !newName.trim()}
          onClick={() => {
            if (selection.kind === 'new') {
              // Open form to confirm/edit name first.
              setMode({ kind: 'creating' });
            } else {
              runCheckout(selection);
            }
          }}
          data-checkout-action={selection.kind === 'existing' ? 'check-out-here' : 'configure'}
        >
          {selection.kind === 'existing' ? 'Check out here' : 'Configure & check out'}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────── Sub-parts ───────────────────────────────

function DrawerHeader({
  branchName,
  label,
  suffix,
  onDismiss,
}: {
  branchName: string;
  label: string;
  suffix?: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-baseline gap-2 px-3.5 py-3 border-b border-dashed border-[var(--color-subtle-border)]">
      <div className="flex items-baseline gap-1.5 text-[12.5px] text-[var(--color-text-secondary)]">
        <span>{label}</span>
        <span className="font-mono text-[12px] text-[var(--color-text-primary)] bg-[var(--color-background)] border border-[var(--color-separator)] px-1.5 py-[1px] rounded-sm">
          {branchName}
        </span>
        {suffix && <span>{suffix}</span>}
      </div>
      <span className="ml-auto">
        <IconButton
          icon={<XIcon />}
          tooltip="Dismiss"
          size={22}
          aria-label="Dismiss"
          onClick={onDismiss}
          data-checkout-dismiss
        />
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3.5 pt-3 pb-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
      <span>{children}</span>
      <span className="flex-1 h-px bg-[var(--color-separator)]" />
    </div>
  );
}

function Sep() {
  return <span className="text-[var(--color-text-ghost)]">·</span>;
}

function StatusDot({ status }: { status: WorktreeEntry['status'] }) {
  const color =
    status === 'conflict'
      ? 'bg-[var(--color-status-red)]'
      : status === 'dirty'
        ? 'bg-[var(--color-status-amber)]'
        : 'bg-[var(--color-status-green)]';
  return <span className={clsx('inline-block w-[6px] h-[6px] rounded-full', color)} />;
}

function StatusStrip({ mode, branchName }: { mode: Mode; branchName: string }) {
  if (mode.kind === 'running') {
    return (
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] text-[var(--color-text-secondary)] border-b border-[var(--color-separator)]"
        // style: mode-driven gradient stripe (running/success/error) — color-mix CSS gradient, no Tailwind equivalent
        style={{
          background:
            'linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 7%, transparent) 0%, transparent 40%)',
        }}
      >
        <span className="inline-block w-[11px] h-[11px] rounded-full border-[1.5px] border-[var(--color-text-ghost)] border-t-[var(--color-accent)] animate-spin" />
        <span>
          Staging{' '}
          <strong className="text-[var(--color-text-primary)] font-medium font-mono text-[11.5px]">
            {branchName}
          </strong>
        </span>
        <span className="ml-auto font-mono text-[11px] text-[var(--color-text-muted)] whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">
          {mode.target}
        </span>
      </div>
    );
  }
  if (mode.kind === 'success') {
    return (
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] text-[var(--color-text-secondary)] border-b border-[var(--color-separator)]"
        // style: mode-driven gradient stripe — color-mix CSS gradient, no Tailwind equivalent
        style={{
          background:
            'linear-gradient(90deg, color-mix(in srgb, var(--color-status-green) 7%, transparent) 0%, transparent 40%)',
        }}
      >
        <span className="inline-flex w-[14px] h-[14px] rounded-full items-center justify-center text-[var(--color-status-green)] text-[10px] bg-[color-mix(in_srgb,var(--color-status-green)_14%,transparent)]">
          ✓
        </span>
        <span>
          Checked out{' '}
          <strong className="text-[var(--color-text-primary)] font-medium font-mono text-[11.5px]">
            {branchName}
          </strong>
        </span>
        <span className="ml-auto font-mono text-[11px] text-[var(--color-text-muted)] whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">
          {shortPathForStrip(mode.worktreePath)}
        </span>
      </div>
    );
  }
  // error
  return (
    <div
      className="flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] text-[var(--color-text-secondary)] border-b border-[var(--color-separator)]"
      // style: mode-driven gradient stripe — color-mix CSS gradient, no Tailwind equivalent
      style={{
        background:
          'linear-gradient(90deg, color-mix(in srgb, var(--color-status-red) 7%, transparent) 0%, transparent 40%)',
      }}
    >
      <span className="inline-flex w-[14px] h-[14px] rounded-full items-center justify-center text-[var(--color-status-red)] text-[10px] bg-[color-mix(in_srgb,var(--color-status-red)_14%,transparent)]">
        ✕
      </span>
      <span>Checkout failed</span>
    </div>
  );
}

function shortPathForStrip(full: string): string {
  const parts = full.replaceAll('\\', '/').split('/');
  if (parts.length <= 3) return full;
  return '…/' + parts.slice(-2).join('/');
}

function LogBlock({ steps, error }: { steps: GitStep[]; error?: string }) {
  return (
    <div className="mx-[6px] mt-2 mb-2 bg-[var(--color-background)] border border-[var(--color-separator)] rounded-md font-mono text-[11px] leading-[1.55] text-[var(--color-text-primary)] px-3 py-2.5 max-h-[220px] overflow-auto">
      {steps.map((s, i) => (
        <div key={i} className="mb-2 last:mb-0">
          <div className="text-[var(--color-text-ghost)]">cwd: {s.cwd}</div>
          <div>
            <span className="text-[var(--color-text-ghost)]">$ </span>
            <span className="text-[var(--color-accent)]">{s.cmd}</span>
          </div>
          {s.output && (
            <pre className="text-[var(--color-text-secondary)] pl-2.5 whitespace-pre-wrap break-words m-0 font-mono">
              {s.output}
            </pre>
          )}
        </div>
      ))}
      {error && (
        <div className="text-[var(--color-status-red)] mt-1">
          <span>✗ </span>
          {error}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────── Inline icons ───────────────────────────────

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 2.5L4 6l3.5 3.5M4 6h6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 2.5L8 6l-3.5 3.5M2 6h6" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 1.5l1.4 3 3.1.4-2.3 2.1.6 3.1L6 8.6 3.2 10.1l.6-3.1L1.5 4.9l3.1-.4z" />
    </svg>
  );
}

const iconFolder = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12z" />
  </svg>
);
const iconTerminal = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M5 7l2 2-2 2M9 11h3" />
  </svg>
);
const iconSparkle = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2l1.6 3.8L13.5 7l-3.9 1.2L8 12l-1.6-3.8L2.5 7l3.9-1.2z" />
  </svg>
);
const iconCode = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4l-3 4 3 4M11 4l3 4-3 4M9.5 3 6.5 13" />
  </svg>
);
