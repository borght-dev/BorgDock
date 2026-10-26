import { MoreHorizontal, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BackButton } from '@/components/layout/BackButton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button, IconButton, Input, Pill, Tabs } from '@/components/shared/primitives';
import { isOverlayOpen, popView } from '@/services/navigation';
import { setStatus, setTitle } from '@/services/workstreams/edits';
import { LIMITS } from '@/services/workstreams/types';
import { toastError } from '@/stores/toast-store';
import { selectTopView, useUiStore, type WorkstreamTab } from '@/stores/ui-store';
import { useWorkstreamSourcesStore } from '@/stores/workstream-sources-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';
import { useWorkstreamsUiStore } from '@/stores/workstreams-ui-store';
import { ActivityTab } from './ActivityTab';
import { ConflictView } from './ConflictView';
import { DecisionPanel } from './DecisionPanel';
import { GoalEditor } from './GoalEditor';
import { MapTab } from './MapTab';
import { MembersTab } from './MembersTab';
import { Menu, type MenuItem } from './Menu';
import { NextActionCard } from './NextActionCard';
import { OutcomeList } from './OutcomeList';
import { wsEdit } from './ws-ui';

const STATUS_PILL = {
  active: null,
  paused: { tone: 'neutral', label: 'Paused' },
  done: { tone: 'merged', label: 'Done' },
  archived: { tone: 'ghost', label: 'Archived' },
} as const;

const CLOCK_TICK_MS = 30_000;

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

interface WorkstreamDetailViewProps {
  id: string;
  tab?: WorkstreamTab;
}

/**
 * WorkstreamDetailView — one workstream full screen in the main window.
 * Overview holds the goal, the next action with what the sources suggest,
 * the outcomes and the decisions; Members every record by role; Map the
 * graph of what blocks what; Activity the log.
 */
export function WorkstreamDetailView({ id, tab = 'overview' }: WorkstreamDetailViewProps) {
  const entry = useWorkstreamsStore((s) => s.entries[id]);
  const assessment = useWorkstreamSourcesStore((s) => s.assessments[id]);
  const suggestions = useWorkstreamSourcesStore((s) => s.suggestions[id]);
  const openPicker = useWorkstreamsUiStore((s) => s.openPicker);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const now = useClock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || isOverlayOpen())
        return;
      const top = selectTopView(useUiStore.getState());
      if (top.kind !== 'workstream' || top.id !== id) return;
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        useWorkstreamsUiStore.getState().openPicker(id);
      } else if (e.key === 'e' || e.key === 'E') {
        const edit = window.document.querySelector<HTMLButtonElement>('[data-next-action-edit]');
        if (edit) {
          e.preventDefault();
          edit.click();
        }
      }
    };
    window.document.addEventListener('keydown', onKey);
    return () => window.document.removeEventListener('keydown', onKey);
  }, [id]);

  if (!entry) {
    return (
      <article className="bd-detail bd-ws-detail" aria-label="Workstream">
        <header className="bd-detail__head">
          <div className="bd-detail__bar">
            <BackButton />
            <span className="bd-detail__crumb">Workstream</span>
          </div>
        </header>
        <div className="bd-detail__state" role="status">
          <p>This workstream is gone: deleted here or on another machine.</p>
        </div>
      </article>
    );
  }

  const document = entry.document;
  const readOnly = entry.readOnly || document.status === 'archived';
  const status = STATUS_PILL[document.status];
  const setTab = (next: string) => {
    useUiStore.getState().replaceView({ kind: 'workstream', id, tab: next as WorkstreamTab });
  };
  const saveTitle = () => {
    if (titleDraft !== null && wsEdit(id, (d, c) => setTitle(d, titleDraft, c)))
      setTitleDraft(null);
  };

  const statusItems: MenuItem[] = [];
  if (document.status === 'active') {
    statusItems.push({
      id: 'pause',
      label: 'Pause',
      onSelect: () => wsEdit(id, (d, c) => setStatus(d, 'paused', c)),
    });
  }
  if (document.status === 'paused') {
    statusItems.push({
      id: 'resume',
      label: 'Resume',
      onSelect: () => wsEdit(id, (d, c) => setStatus(d, 'active', c)),
    });
  }
  if (document.status === 'active' || document.status === 'paused') {
    statusItems.push({
      id: 'complete',
      label: 'Complete',
      disabled: !assessment?.ready,
      hint: assessment?.ready ? undefined : 'Every required outcome has to be verified first',
      onSelect: () => wsEdit(id, (d, c) => setStatus(d, 'done', c)),
    });
  }
  if (document.status === 'done') {
    statusItems.push({
      id: 'reopen',
      label: 'Reopen',
      onSelect: () => wsEdit(id, (d, c) => setStatus(d, 'active', c)),
    });
  }
  if (document.status !== 'archived') {
    statusItems.push({
      id: 'archive',
      label: 'Archive',
      onSelect: () => wsEdit(id, (d, c) => setStatus(d, 'archived', c)),
    });
  } else {
    statusItems.push({
      id: 'restore',
      label: 'Restore from the archive',
      onSelect: () => wsEdit(id, (d, c) => setStatus(d, 'active', c)),
    });
    statusItems.push({
      id: 'delete',
      label: 'Delete…',
      danger: true,
      onSelect: () => setDeleting(true),
    });
  }

  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      count: assessment?.attention.filter((a) => a.tone === 'bad').length || undefined,
    },
    { id: 'members', label: 'Members', count: document.members.length || undefined },
    { id: 'map', label: 'Map' },
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <article className="bd-detail bd-ws-detail" aria-label={`Workstream ${document.title}`}>
      <header className="bd-detail__head">
        <div className="bd-detail__bar">
          <BackButton />
          <span className="bd-detail__crumb">Workstream</span>
          <span className="bd-ws-detail__actions">
            {!readOnly && (
              <Button
                variant="secondary"
                size="sm"
                leading={<Plus size={12} />}
                onClick={() => openPicker(id)}
              >
                Add records
              </Button>
            )}
            {!entry.readOnly && (
              <Menu
                label="Workstream"
                trigger={(props) => (
                  <IconButton
                    {...props}
                    icon={<MoreHorizontal size={14} />}
                    size={26}
                    aria-label="More for this workstream"
                  />
                )}
                groups={[{ items: statusItems }]}
              />
            )}
          </span>
        </div>
        <div className="bd-detail__titlerow">
          {titleDraft !== null ? (
            <Input
              autoFocus
              className="bd-ws-detail__title-input"
              aria-label="Title"
              value={titleDraft}
              maxLength={LIMITS.title}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  saveTitle();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setTitleDraft(null);
                }
              }}
            />
          ) : (
            <h1 className="bd-detail__title">
              {readOnly ? (
                document.title
              ) : (
                <button
                  type="button"
                  className="bd-ws-detail__title"
                  title="Rename"
                  onClick={() => setTitleDraft(document.title)}
                >
                  {document.title}
                </button>
              )}
            </h1>
          )}
          {status && <Pill tone={status.tone}>{status.label}</Pill>}
        </div>
        {assessment && (
          <p className="bd-detail__meta">
            {assessment.progress.required > 0
              ? `${assessment.progress.counted} of ${assessment.progress.required} required outcomes verified`
              : 'No required outcomes yet'}
            {assessment.ready && document.status !== 'done' && ' · ready to complete'}
          </p>
        )}
      </header>

      {entry.readOnly && (
        <div className="bd-dp-notice" role="status">
          <span>
            A newer BorgDock made this workstream. It shows here read-only; update BorgDock to edit
            it.
          </span>
        </div>
      )}
      {entry.conflict && (
        <div className="bd-dp-notice" role="status">
          <span>
            Changed on {entry.conflict.theirsDevice} as well. Choose what to keep before editing on.
          </span>
          <Button variant="secondary" size="sm" onClick={() => setMerging(true)}>
            Choose
          </Button>
        </div>
      )}
      {entry.saveError && !entry.conflict && (
        <div className="bd-dp-notice" role="alert">
          <span>Not saved: {entry.saveError} Your edits are kept here and on this machine.</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => useWorkstreamsStore.getState().retrySave(id)}
          >
            Retry
          </Button>
        </div>
      )}

      <div className="bd-detail__tabs">
        <Tabs value={tab} onChange={setTab} tabs={tabs} sliding aria-label="Workstream" />
      </div>
      <div className="bd-detail__content">
        <div className="bd-detail__pane bd-detail__pane-body bd-ws-pane" key={tab}>
          {tab === 'overview' && (
            <div className="bd-ws-overview">
              <div className="bd-ws-overview__main">
                <NextActionCard
                  document={document}
                  assessment={assessment}
                  readOnly={readOnly}
                  now={now}
                />
                <OutcomeList document={document} assessment={assessment} readOnly={readOnly} />
                <DecisionPanel document={document} assessment={assessment} readOnly={readOnly} />
              </div>
              <div className="bd-ws-overview__side">
                <GoalEditor workstreamId={id} goal={document.goal} readOnly={readOnly} />
                {assessment && assessment.health.length > 0 && (
                  <section className="bd-ws-panel" aria-label="Sources">
                    <h2 className="bd-ws-panel__title">Sources</h2>
                    <ul className="bd-ws-health">
                      {assessment.health.map((source) => (
                        <li key={source.label} data-tone={source.tone}>
                          <span>{source.label}</span>
                          <span className="bd-ws-muted">{source.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          )}
          {tab === 'members' && (
            <MembersTab
              document={document}
              assessment={assessment}
              suggestions={suggestions ?? []}
              readOnly={readOnly}
            />
          )}
          {tab === 'map' && (
            <MapTab document={document} assessment={assessment} readOnly={readOnly} />
          )}
          {tab === 'activity' && <ActivityTab document={document} />}
        </div>
      </div>

      {merging && entry.conflict && (
        <ConflictView
          workstreamId={id}
          conflict={entry.conflict}
          onClose={() => setMerging(false)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting}
        title={`Delete "${document.title}"?`}
        message="It moves to Recently deleted under Archived and stays there for 30 days."
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          void useWorkstreamsStore
            .getState()
            .trash(id)
            .then(() => popView())
            .catch((error) => toastError('Not deleted', error));
        }}
      />
    </article>
  );
}
