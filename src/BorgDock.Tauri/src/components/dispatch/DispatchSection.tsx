import { invoke } from '@tauri-apps/api/core';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { WorkbenchGroup } from '@/components/pr/RepoGroup';
import { Button, Dot, Kbd, Seg2 } from '@/components/shared/primitives';
import { AdoNotConfigured } from '@/components/work-items/AdoNotConfigured';
import { dispatchActions } from '@/services/dispatch/actions';
import { syncAll } from '@/services/dispatch/sync';
import { BAY_LABEL, BAYS, type Bay, type ItemOverview } from '@/services/dispatch/types';
import { showWorkItem } from '@/services/navigation';
import { LOCAL_T3_HOST_ID } from '@/services/t3/api';
import {
  type DispatchViewMode,
  type HostStatus,
  type SourceStatus,
  useDispatchStore,
} from '@/stores/dispatch-store';
import { useSettingsStore } from '@/stores/settings-store';
import { showToast, toastError } from '@/stores/toast-store';
import { shortcutLabel } from '@/utils/shortcut-label';
import { DispatchBoard } from './DispatchBoard';
import { DispatchDetail } from './DispatchDetail';
import { canStart, DispatchRow } from './DispatchRow';
import { LaunchSheet } from './LaunchSheet';
import { SlotStrip } from './SlotStrip';
import { shortAge } from './unit-copy';

const VIEW_MODES: readonly { value: DispatchViewMode; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'board', label: 'Board' },
];

/** How often the relative times ("4 min ago") are refreshed. */
const CLOCK_TICK_MS = 30_000;

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Group heading key of the rows in one bay. */
export function bayGroupKey(bay: Bay): string {
  return `dp-bay:${bay}`;
}

/** The items whose title or number contains `query`. */
export function searchItems(items: readonly ItemOverview[], query: string): ItemOverview[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter(
    (o) => o.item.title.toLowerCase().includes(needle) || String(o.item.id).includes(needle),
  );
}

/** Items grouped per bay, bays in order of urgency, empty ones left out. */
export function groupByBay(items: readonly ItemOverview[]): { bay: Bay; rows: ItemOverview[] }[] {
  return BAYS.map((bay) => ({ bay, rows: items.filter((o) => o.bay === bay) })).filter(
    (group) => group.rows.length > 0,
  );
}

function adoLine(status: SourceStatus, now: number): string {
  if (!status.ok) return status.at ? 'ADO not answering' : 'ADO';
  const age = status.at ? shortAge(status.at, now) : '';
  return age === 'just now' || age === '' ? `ADO ${age}`.trim() : `ADO ${age} ago`;
}

function Health({ ado, hosts, now }: { ado: SourceStatus; hosts: HostStatus[]; now: number }) {
  return (
    <span className="bd-dp-health">
      <span className="bd-dp-health__source" title={ado.error ?? undefined}>
        <Dot tone={ado.ok ? 'green' : 'red'} size={6} />
        {adoLine(ado, now)}
      </span>
      {hosts.map((host) => (
        <span key={host.id} className="bd-dp-health__source" title={host.error ?? undefined}>
          <Dot tone={host.ok ? 'green' : 'yellow'} size={6} />
          {host.ok ? host.label : `${host.label} offline`}
        </span>
      ))}
    </span>
  );
}

/**
 * A free slot was picked: open the launch sheet there for the item that is
 * next in line, the first one queued, else the first nobody started.
 */
function startNextIn(items: readonly ItemOverview[], slotId: string): void {
  const next =
    items.find((o) => o.bay === 'next') ?? items.find((o) => o.bay === 'idle' && canStart(o));
  if (!next) {
    showToast({ message: 'Nothing is waiting to be started.' });
    return;
  }
  useDispatchStore.getState().openLaunch({ itemId: next.item.id, slotId });
}

/** A local T3 that answers but rejects BorgDock, or has never been paired. */
function needsPairing(host: HostStatus | undefined): boolean {
  return !!host && !host.ok && host.id === LOCAL_T3_HOST_ID && /pair/i.test(host.error ?? '');
}

function PairingNotice({ error }: { error: string }) {
  const [pairing, setPairing] = useState(false);
  const pair = async () => {
    setPairing(true);
    try {
      await invoke('t3_pair_local', {
        executable: useSettingsStore.getState().settings.agents?.t3Path,
      });
      syncAll(true);
    } catch (err) {
      toastError('Pairing failed', err);
    } finally {
      setPairing(false);
    }
  };
  return (
    <div className="bd-dp-notice" role="status">
      <span>{error}</span>
      <Button variant="secondary" size="sm" loading={pairing} onClick={() => void pair()}>
        Pair with T3
      </Button>
    </div>
  );
}

/**
 * DispatchSection — the work assigned to you, sorted by what it needs.
 *
 * - Head row: title, List or Board, the health of the sources (ADO and every
 *   T3 host) and search.
 * - The slot strip: every T3 project an agent can run in, per host.
 * - List: the items grouped by bay (waiting on you first), beside the
 *   selected item's detail: the agent's question or last message, the next
 *   action and the item's place in its workflow.
 * - Board: the same items in four columns (`DispatchBoard`); a card opens its
 *   detail in a drawer.
 * - J / K move, Enter opens the work item full screen, A takes the selected
 *   item's first action, S starts an agent on it, M moves its state, O opens
 *   its thread in T3 (useKeyboardNav).
 * - Start opens the launch sheet. So does dropping a row on a free slot, or
 *   picking a free slot, which takes the item that is next in line.
 */
export function DispatchSection() {
  const ado = useSettingsStore((s) => s.settings.azureDevOps);
  const density = useSettingsStore((s) => s.settings.ui.prDensity ?? 'comfortable');
  const overview = useDispatchStore((s) => s.overview);
  const selectedId = useDispatchStore((s) => s.selectedItemId);
  const selectItem = useDispatchStore((s) => s.selectItem);
  const searchQuery = useDispatchStore((s) => s.searchQuery);
  const setSearchQuery = useDispatchStore((s) => s.setSearchQuery);
  const adoStatus = useDispatchStore((s) => s.ado);
  const hosts = useDispatchStore((s) => s.hosts);
  const busy = useDispatchStore((s) => s.busy);
  const launch = useDispatchStore((s) => s.launch);
  const viewMode = useDispatchStore((s) => s.viewMode);
  const setViewMode = useDispatchStore((s) => s.setViewMode);
  const openLaunch = useDispatchStore((s) => s.openLaunch);
  const now = useClock();

  const items = useMemo(
    () => searchItems(overview?.items ?? [], searchQuery),
    [overview, searchQuery],
  );
  const groups = useMemo(() => groupByBay(items), [items]);
  const selected = items.find((o) => o.item.id === selectedId) ?? groups[0]?.rows[0] ?? null;

  const hasCredentials = ado.authMethod === 'azCli' || !!ado.personalAccessToken;
  if (!ado.organization || !hasCredentials) return <AdoNotConfigured />;

  const localHost = hosts.find((host) => host.id === LOCAL_T3_HOST_ID);
  const total = overview?.items.length ?? 0;

  return (
    <div className="bd-wb-prs bd-dp">
      <header className="bd-wb-head bd-dp-head">
        <h1 className="bd-wb-head__title">Dispatch</h1>
        <Seg2
          ariaLabel="Dispatch layout"
          size="sm"
          value={viewMode}
          options={VIEW_MODES}
          onChange={setViewMode}
        />
        <Health ado={adoStatus} hosts={hosts} now={now} />
        <label className="bd-wb-head__search">
          <Search
            size={13}
            strokeWidth={2}
            aria-hidden="true"
            className="bd-wb-head__search-icon"
          />
          <input
            aria-label="Filter your work"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.preventDefault();
              if (searchQuery !== '') setSearchQuery('');
              else e.currentTarget.blur();
            }}
            placeholder="Search your work"
            data-section-search
          />
          <Kbd>{shortcutLabel('K')}</Kbd>
        </label>
      </header>

      {needsPairing(localHost) && <PairingNotice error={localHost?.error ?? ''} />}

      <SlotStrip
        slots={overview?.slots ?? []}
        onShowItem={selectItem}
        onStartIn={(slot) => startNextIn(overview?.items ?? [], slot.id)}
        onDropItem={(slot, itemId) => openLaunch({ itemId, slotId: slot.id })}
      />

      {viewMode === 'board' && overview !== null && (
        <DispatchBoard
          items={items}
          slots={overview.slots}
          openId={selectedId}
          now={now}
          busy={busy}
          actions={dispatchActions}
          onSelect={selectItem}
        />
      )}
      <div className="bd-dp-split" hidden={viewMode === 'board' && overview !== null}>
        <div className="bd-wb-list" data-density={density}>
          {overview === null && <div className="bd-wb-empty">Loading your work…</div>}
          {overview !== null && items.length === 0 && (
            <div className="bd-wb-empty">
              <p>
                {total > 0
                  ? 'No work matches this search'
                  : (adoStatus.error ?? 'Nothing is assigned to you')}
              </p>
            </div>
          )}
          {groups.map((group) => (
            <WorkbenchGroup
              key={group.bay}
              groupKey={bayGroupKey(group.bay)}
              label={BAY_LABEL[group.bay]}
              count={group.rows.length}
            >
              {group.rows.map((row) => (
                <DispatchRow
                  key={row.item.id}
                  overview={row}
                  selected={selected?.item.id === row.item.id}
                  now={now}
                  density={density}
                  onSelect={selectItem}
                  onOpen={(id) => void showWorkItem(id)}
                />
              ))}
            </WorkbenchGroup>
          ))}
        </div>
        {selected ? (
          <DispatchDetail
            overview={selected}
            slots={overview?.slots ?? []}
            actions={dispatchActions}
            now={now}
            busy={busy}
          />
        ) : (
          <div className="bd-dp-empty-detail">Pick an item to see its agent and its next step.</div>
        )}
      </div>
      {launch && overview && <LaunchSheet intent={launch} overview={overview} />}
    </div>
  );
}
