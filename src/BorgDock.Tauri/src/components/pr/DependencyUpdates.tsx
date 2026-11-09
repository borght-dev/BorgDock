import { ArrowRight, CheckCheck, Package } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Seg2, Toggle } from '@/components/shared/primitives';
import {
  holdDependencyApprovals,
  readMergePreference,
  writeMergePreference,
} from '@/services/dependency-approve';
import {
  APPROVE_BLOCK_TEXT,
  CAUTION_TEXT,
  candidateSummary,
  type DependencyCandidate,
  dependencyCandidates,
  isPickable,
  isSafe,
} from '@/services/dependency-updates';
import { useDependencyUpdatesStore } from '@/stores/dependency-updates-store';
import { usePrStore } from '@/stores/pr-store';
import { formatAgo } from '@/utils/relative-time';

const ICON = { size: 12, strokeWidth: 2.25, 'aria-hidden': true } as const;

/** The dependency PRs to list now, without those whose approval waits for Undo or runs. */
function useCandidates(): DependencyCandidate[] {
  const prs = usePrStore((s) => s.pullRequests);
  const username = usePrStore((s) => s.username);
  const pending = useDependencyUpdatesStore((s) => s.pending);
  return useMemo(
    () => dependencyCandidates(prs, username).filter((c) => !pending.has(c.key)),
    [prs, username, pending],
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * DependencyStrip — one line above the PR list while a dependency bot's PR
 * can be approved: how many, what holds the rest, and the sheet's button.
 */
export function DependencyStrip() {
  const candidates = useCandidates();
  if (!candidates.some(isPickable)) return null;
  const safe = candidates.filter(isSafe).length;
  return (
    <section className="bd-dep-strip" aria-label="Dependency updates">
      <span className="bd-dep-strip__icon" aria-hidden="true">
        <Package size={14} strokeWidth={2} />
      </span>
      <span className="bd-dep-strip__text">
        <b>{plural(candidates.length, 'dependency update')}</b>
        <span>{candidateSummary(candidates)}</span>
      </span>
      <Button
        variant="primary"
        size="sm"
        leading={<CheckCheck {...ICON} />}
        onClick={() => useDependencyUpdatesStore.getState().openSheet()}
        data-dep-approve-open=""
      >
        {safe > 0 ? `Approve ${safe}…` : 'Approve…'}
      </Button>
    </section>
  );
}

/** "4.17.20 → 4.17.21", "→ v19", or "group" for several packages. */
function Versions({ candidate }: { candidate: DependencyCandidate }) {
  const { packages } = candidate.update;
  const only = packages.length === 1 ? packages[0] : undefined;
  if (!only) return <span className="bd-dep-row__ver">{packages.length > 1 ? 'group' : ''}</span>;
  return (
    <span className="bd-dep-row__ver">
      {only.from}
      {only.from && ' '}
      <ArrowRight size={10} strokeWidth={2.25} aria-label="to" />{' '}
      <span className="bd-dep-row__to">{only.to}</span>
    </span>
  );
}

function checksText(candidate: DependencyCandidate): string {
  const { pr } = candidate;
  const running = pr.pendingCheckNames.length;
  if (running > 0) return `${plural(running, 'check')} running`;
  if (pr.totalCheckCount === 0) return 'no checks';
  return `${pr.passedCount}/${pr.totalCheckCount} checks passed`;
}

/** The row's second line: why it can't be or isn't picked, else who, checks and age. */
function detailOf(candidate: DependencyCandidate): { text: string; tone?: 'bad' | 'warn' } {
  if (candidate.block) return { text: APPROVE_BLOCK_TEXT[candidate.block], tone: 'bad' };
  if (candidate.caution)
    return {
      text: CAUTION_TEXT[candidate.caution],
      tone: candidate.caution === 'failing' ? 'bad' : 'warn',
    };
  const { update, pr } = candidate;
  const who =
    update.packages.length > 1 ? update.packages.map((p) => p.name).join(', ') : update.bot;
  return { text: `${who} · ${checksText(candidate)} · ${formatAgo(pr.pullRequest.updatedAt)}` };
}

function CandidateRow({
  candidate,
  checked,
  onToggle,
}: {
  candidate: DependencyCandidate;
  checked: boolean;
  onToggle: (key: string, on: boolean) => void;
}) {
  const { pr, update, block } = candidate;
  const detail = detailOf(candidate);
  return (
    <label
      className="bd-dep-row"
      data-blocked={block ? 'true' : undefined}
      data-dep-row={candidate.key}
      title={pr.pullRequest.title}
    >
      <input
        type="checkbox"
        className="bd-dep-row__box"
        checked={checked}
        disabled={block !== null}
        onChange={(e) => onToggle(candidate.key, e.target.checked)}
        aria-label={`${update.label}, #${pr.pullRequest.number}`}
      />
      <span className="bd-dep-row__name">
        <b>{update.label}</b>
        <span data-tone={detail.tone}>{detail.text}</span>
      </span>
      <Versions candidate={candidate} />
      <span className="bd-dep-bump" data-bump={update.bump}>
        {update.bump === 'unknown' ? '?' : update.bump}
      </span>
      <span className="bd-dep-row__num">#{pr.pullRequest.number}</span>
    </label>
  );
}

type Pick = 'safe' | 'all' | 'none';

function keysOf(candidates: readonly DependencyCandidate[]): Set<string> {
  return new Set(candidates.map((c) => c.key));
}

function sameKeys(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((key) => b.has(key));
}

/**
 * DependencyApproveSheet — the open dependency PRs by repository, the safe
 * ones picked. Approve closes it and hands the picked PRs to an Undo toast
 * (`holdDependencyApprovals`); nothing is sent before that runs out.
 */
export function DependencyApproveSheet({ onClose }: { onClose: () => void }) {
  const candidates = useCandidates();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() =>
    keysOf(candidates.filter(isSafe)),
  );
  const [merge, setMerge] = useState(readMergePreference);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const pickable = candidates.filter(isPickable);
  const chosen = pickable.filter((c) => selected.has(c.key));
  const picks: Record<Pick, Set<string>> = {
    safe: keysOf(candidates.filter(isSafe)),
    all: keysOf(pickable),
    none: new Set(),
  };
  const chosenKeys = keysOf(chosen);
  const pick = (['safe', 'all', 'none'] as const).find((p) => sameKeys(picks[p], chosenKeys));

  const byRepo = new Map<string, DependencyCandidate[]>();
  for (const c of candidates) {
    const repo = `${c.pr.pullRequest.repoOwner}/${c.pr.pullRequest.repoName}`;
    byRepo.set(repo, [...(byRepo.get(repo) ?? []), c]);
  }

  const toggle = (key: string, on: boolean) =>
    setSelected((before) => {
      const next = new Set(before);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const confirm = () => {
    writeMergePreference(merge);
    holdDependencyApprovals(
      chosen.map((c) => c.pr),
      merge,
    );
    onClose();
  };

  return (
    <div className="bd-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="bd-modal bd-dp-sheet bd-dep-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bd-dep-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="bd-dp-sheet__head">
          <h2 id="bd-dep-sheet-title">Approve dependency updates</h2>
          <p>Approves each PR at the commit shown here. A PR that changed since is left alone.</p>
          <div className="bd-dep-sheet__pick">
            <span>Pick</span>
            <Seg2<Pick>
              size="sm"
              ariaLabel="Pick"
              value={pick ?? ('custom' as Pick)}
              options={[
                { value: 'safe', label: `Safe ${picks.safe.size}` },
                { value: 'all', label: `All ${picks.all.size}` },
                { value: 'none', label: 'None' },
              ]}
              onChange={(next) => setSelected(picks[next])}
            />
          </div>
        </header>
        <div className="bd-dp-sheet__body bd-dep-sheet__body">
          {candidates.length === 0 && (
            <p className="bd-dp-sheet__hint">No dependency updates left to approve.</p>
          )}
          {[...byRepo].map(([repo, rows]) => (
            <section key={repo} className="bd-dep-sheet__repo" aria-label={repo}>
              <h3 className="bd-dep-sheet__repo-head">
                {repo} <span>{rows.length}</span>
              </h3>
              {rows.map((c) => (
                <CandidateRow
                  key={c.key}
                  candidate={c}
                  checked={selected.has(c.key) && c.block === null}
                  onToggle={toggle}
                />
              ))}
            </section>
          ))}
        </div>
        <footer className="bd-dp-sheet__foot bd-dep-sheet__foot">
          <span className="bd-dep-sheet__merge">
            <Toggle on={merge} onChange={setMerge} ariaLabel="Merge when checks pass" />
            <span aria-hidden="true">Merge when checks pass</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            leading={<CheckCheck {...ICON} />}
            disabled={chosen.length === 0}
            onClick={confirm}
            data-dep-approve-confirm=""
          >
            {`Approve ${chosen.length}`}
          </Button>
        </footer>
      </div>
    </div>
  );
}

/** The sheet, while something opened it (the strip, a row's menu). Main window. */
export function DependencySheetHost() {
  const open = useDependencyUpdatesStore((s) => s.sheetOpen);
  const close = useDependencyUpdatesStore((s) => s.closeSheet);
  return open ? <DependencyApproveSheet onClose={close} /> : null;
}
