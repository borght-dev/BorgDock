import { FolderOpen, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Kbd, Seg2 } from '@/components/shared/primitives';
import { commands } from '@/generated/commands';
import { commandData } from '@/services/native-command';
import { showWorkstream } from '@/services/navigation';
import type { Assessment } from '@/services/workstreams/attention';
import { nativeStorage } from '@/services/workstreams/storage';
import type { WorkstreamStatus } from '@/services/workstreams/types';
import { toastError } from '@/stores/toast-store';
import { useWorkstreamSourcesStore } from '@/stores/workstream-sources-store';
import { type Entry, useWorkstreamsStore } from '@/stores/workstreams-store';
import { useWorkstreamsUiStore } from '@/stores/workstreams-ui-store';
import { shortcutLabel } from '@/utils/shortcut-label';
import { WorkstreamCard } from './WorkstreamCard';
import { ago } from './ws-ui';

const FILTERS: readonly { value: WorkstreamStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'done', label: 'Done' },
  { value: 'archived', label: 'Archived' },
];

const EMPTY_FILTER: Record<WorkstreamStatus, string> = {
  active: 'No active workstreams.',
  paused: 'No paused workstreams.',
  done: 'Nothing completed yet.',
  archived: 'Nothing archived.',
};

const TONE_RANK = { bad: 0, warn: 1, ok: 2 } as const;
const CLOCK_TICK_MS = 30_000;

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Pinned first, then what needs you most, then the most recently changed. */
export function orderWorkstreams(
  entries: readonly Entry[],
  assessments: Readonly<Record<string, Assessment>>,
): Entry[] {
  const rank = (entry: Entry) => {
    const tone = assessments[entry.document.id]?.attention[0]?.tone;
    return tone ? TONE_RANK[tone] : 3;
  };
  return [...entries].sort(
    (a, b) =>
      Number(b.document.pinned) - Number(a.document.pinned) ||
      rank(a) - rank(b) ||
      (b.document.updatedAt || b.document.createdAt).localeCompare(
        a.document.updatedAt || a.document.createdAt,
      ),
  );
}

/** The workstreams with `status` whose title, goal or next action holds `query`. */
export function filterWorkstreams(
  entries: readonly Entry[],
  status: WorkstreamStatus,
  query: string,
): Entry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    const d = entry.document;
    if (d.status !== status) return false;
    if (!needle) return true;
    return [d.title, d.goal, d.nextAction?.text ?? ''].some((text) =>
      text.toLowerCase().includes(needle),
    );
  });
}

async function openFolder(folder: string | null): Promise<void> {
  try {
    const path = await nativeStorage.folderPath(folder);
    await commandData(commands.revealInFileManager(path));
  } catch (error) {
    toastError('Could not open the folder', error);
  }
}

/**
 * WorkstreamsSection — every goal you curate, as cards: the next action,
 * verified outcomes, what needs you first. Filter by Active, Paused, Done
 * or Archived; search the titles, goals and next actions. N starts a new
 * one, J/K move, Enter opens, E edits the next action (keyboard.ts).
 */
export function WorkstreamsSection() {
  const loaded = useWorkstreamsStore((s) => s.loaded);
  const loadError = useWorkstreamsStore((s) => s.loadError);
  const folder = useWorkstreamsStore((s) => s.folder);
  const entries = useWorkstreamsStore((s) => s.entries);
  const unreadable = useWorkstreamsStore((s) => s.unreadable);
  const trashed = useWorkstreamsStore((s) => s.trashed);
  const filter = useWorkstreamsStore((s) => s.filter);
  const search = useWorkstreamsStore((s) => s.search);
  const setFilter = useWorkstreamsStore((s) => s.setFilter);
  const setSearch = useWorkstreamsStore((s) => s.setSearch);
  const assessments = useWorkstreamSourcesStore((s) => s.assessments);
  const selectedId = useWorkstreamsUiStore((s) => s.selectedId);
  const select = useWorkstreamsUiStore((s) => s.select);
  const editing = useWorkstreamsUiStore((s) => s.editingNextAction);
  const editNextAction = useWorkstreamsUiStore((s) => s.editNextAction);
  const openCreate = useWorkstreamsUiStore((s) => s.openCreate);
  const now = useClock();

  const all = useMemo(() => Object.values(entries), [entries]);
  const shown = useMemo(
    () => orderWorkstreams(filterWorkstreams(all, filter, search), assessments),
    [all, filter, search, assessments],
  );
  const counts = useMemo(() => {
    const byStatus: Record<WorkstreamStatus, number> = {
      active: 0,
      paused: 0,
      done: 0,
      archived: 0,
    };
    for (const entry of all) byStatus[entry.document.status]++;
    return byStatus;
  }, [all]);
  const options = FILTERS.map((option) => ({
    value: option.value,
    label: counts[option.value] > 0 ? `${option.label} ${counts[option.value]}` : option.label,
  }));

  return (
    <div className="bd-wb-prs bd-ws">
      <header className="bd-wb-head bd-ws-head">
        <h1 className="bd-wb-head__title">Workstreams</h1>
        <Seg2
          ariaLabel="Show workstreams"
          size="sm"
          value={filter}
          options={options}
          onChange={setFilter}
        />
        <span className="bd-ws-head__spacer" />
        <Button
          variant="primary"
          size="sm"
          leading={<Plus size={13} aria-hidden="true" />}
          onClick={() => openCreate()}
          aria-keyshortcuts="N"
        >
          New workstream
        </Button>
        <label className="bd-wb-head__search">
          <Search
            size={13}
            strokeWidth={2}
            aria-hidden="true"
            className="bd-wb-head__search-icon"
          />
          <input
            aria-label="Search workstreams"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.preventDefault();
              if (search !== '') setSearch('');
              else e.currentTarget.blur();
            }}
            placeholder="Search goals"
            data-section-search
          />
          <Kbd>{shortcutLabel('K')}</Kbd>
        </label>
      </header>

      {loadError && (
        <div className="bd-dp-notice" role="status">
          <span>Workstreams could not be read. {loadError}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void useWorkstreamsStore.getState().refresh()}
          >
            Try again
          </Button>
        </div>
      )}
      {unreadable.map((file) => (
        <div key={file.fileName} className="bd-dp-notice" role="status">
          <span>
            {file.fileName} can't be read ({file.reason}). It is left as it is.
          </span>
          <span className="bd-ws-notice__actions">
            <Button
              variant="ghost"
              size="sm"
              leading={<FolderOpen size={13} />}
              onClick={() => void openFolder(folder)}
            >
              Open folder
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void useWorkstreamsStore
                  .getState()
                  .restoreBackup(file.id)
                  .catch((error) => toastError('Previous version not restored', error))
              }
            >
              Restore previous version
            </Button>
          </span>
        </div>
      ))}

      <div className="bd-wb-list bd-ws-list" role="list" aria-label="Workstreams">
        {!loaded && <div className="bd-wb-empty">Loading workstreams…</div>}
        {loaded && all.length === 0 && (
          <div className="bd-wb-empty bd-ws-empty">
            <h2>Group the work behind one goal</h2>
            <p>
              A workstream holds the work items, agent threads and pull requests that serve one
              goal, the decisions between approaches, and the outcomes that prove it's done.
            </p>
            <Button
              variant="primary"
              size="md"
              leading={<Plus size={14} />}
              onClick={() => openCreate()}
            >
              New workstream
            </Button>
            <p className="bd-ws-empty__hint">
              Or pick "Add to workstream" on a Dispatch item or a pull request.
            </p>
          </div>
        )}
        {loaded && all.length > 0 && shown.length === 0 && (
          <div className="bd-wb-empty">
            {search ? 'No workstream matches this search.' : EMPTY_FILTER[filter]}
          </div>
        )}
        {shown.map((entry) => (
          <div key={entry.document.id} role="listitem">
            <WorkstreamCard
              entry={entry}
              assessment={assessments[entry.document.id]}
              selected={selectedId === entry.document.id}
              editingNextAction={editing === entry.document.id}
              now={now}
              onOpen={(id) => {
                select(id);
                void showWorkstream(id);
              }}
              onSelect={select}
              onEditNextAction={editNextAction}
            />
          </div>
        ))}
        {filter === 'archived' && trashed.length > 0 && (
          <section className="bd-ws-trash" aria-label="Recently deleted">
            <h2>Recently deleted</h2>
            <p>Deleted workstreams stay here for 30 days.</p>
            <ul>
              {trashed.map((file) => (
                <li key={file.id}>
                  <span>{file.title}</span>
                  <span className="bd-ws-trash__when">
                    deleted {ago(new Date(file.deletedMs).toISOString(), now)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void useWorkstreamsStore
                        .getState()
                        .restoreTrashed(file.id)
                        .catch((error) => toastError('Not restored', error))
                    }
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
