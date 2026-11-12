import { ChevronRight, ExternalLink, Maximize2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DetailDialog } from '@/components/shared/DetailDialog';
import { Button, IconButton, Tabs } from '@/components/shared/primitives';
import { DetailsPane } from '@/components/work-items/detail/DetailsPane';
import { LatestCard } from '@/components/work-items/detail/LatestCard';
import { LayoutRail } from '@/components/work-items/detail/LayoutRail';
import { RichTextBlock } from '@/components/work-items/detail/RichTextBlock';
import { useItemContext } from '@/components/work-items/detail/useItemContext';
import { factText } from '@/components/work-items/detail/WorkItemFacts';
import { WorkItemNow } from '@/components/work-items/detail/WorkItemNow';
import {
  avatarToneFor,
  getInitials,
  MiniAvatar,
  PrioBars,
  StatePill,
  typeVisual,
  useTypeMeta,
} from '@/components/work-items/shared/wi-visuals';
import { ActivityTab } from '@/components/work-items/WorkItemDetailPanel/ActivityTab';
import { AttachmentsTab } from '@/components/work-items/WorkItemDetailPanel/AttachmentsTab';
import { useWorkItemDetailData } from '@/hooks/useWorkItemDetailData';
import type { HtmlBlock } from '@/services/ado/form-model';
import { gistText } from '@/services/ado/html-noise';
import { itemLatest, notesFieldOf } from '@/services/ado/work-item-latest';
import { openWorkItemFull } from '@/services/work-item-window';
import { useWorkItemsStore } from '@/stores/work-items-store';
import type { WorkItem } from '@/types';

/** How many rail groups a compact peek shows; the rest are in the full view. */
const PEEK_GROUPS = 3;
/** From this width (a big screen) the peek reads like the full view's Details. */
const ROOMY_PX = 1200;
/** From this width (a 4K screen) Activity gets its own column beside Details. */
const WIDE_PX = 1900;

/** The width of `ref`, kept current as it resizes; 0 before it mounts. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  return width;
}

function Accordion({
  block,
  aside,
  summary,
}: {
  block: HtmlBlock;
  aside?: React.ReactNode;
  /** Replaces the text preview (a dated log says how many updates it has). */
  summary?: string;
}) {
  const [open, setOpen] = useState(false);
  const preview = useMemo(() => summary ?? gistText(block.html, 160), [block.html, summary]);
  return (
    <div className="bd-wid-acc" data-wid-acc={block.key}>
      <button
        type="button"
        className="bd-wid-acc__row"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight className="bd-wid-acc__chev" size={12} strokeWidth={2} aria-hidden />
        <b>{block.label}</b>
        <span className="bd-wid-acc__preview">{preview}</span>
        {aside}
      </button>
      {open && (
        <div className="bd-wid-acc__body">
          <RichTextBlock block={block} headless clamp={false} />
        </div>
      )}
    </div>
  );
}

function TypePill({ type }: { type: string }) {
  const visual = typeVisual(type, useTypeMeta(type));
  return (
    <span className="bd-wid-typepill" style={{ '--bd-wid-type': visual.color } as never}>
      <span className="bd-wid-typepill__glyph" aria-hidden="true">
        {visual.glyph}
      </span>
      {type || 'Work item'}
    </span>
  );
}

/**
 * The peek of a work item from a pull request (design/work-item-detail/mockups.html,
 * frame D): its facts on one line, what happens now, Latest, the cleaned
 * description and the other long-text fields one row each, and the first
 * groups of its layout. "Open" shows it in full.
 */
export function WorkItemPreview({
  id,
  item,
  onClose,
}: {
  id: number;
  item?: WorkItem;
  onClose: () => void;
}) {
  const data = useWorkItemDetailData(id, { initialItem: item, resolveImages: true });
  const [tab, setTab] = useState('details');
  const bodyRef = useRef<HTMLDivElement>(null);
  // A big peek (a large screen) shows every field open and every rail group.
  const width = useWidth(bodyRef);
  const roomy = width >= ROOMY_PX;
  // On a 4K screen Details and Activity read side by side.
  const sideActivity = width >= WIDE_PX && tab === 'details';
  const fieldDefinitions = useWorkItemsStore((s) => s.fieldDefinitions);
  const context = useItemContext(data.detailData?.id);
  const detail = data.detailData;
  const workItem = data.workItem;
  const page = data.form?.tabs[0] ?? null;
  const notes = useMemo(
    () => (workItem ? notesFieldOf(workItem, fieldDefinitions) : null),
    [workItem, fieldDefinitions],
  );
  const newestComment = data.comments.length > 0 ? data.comments[data.comments.length - 1]! : null;
  const latest = useMemo(
    () => itemLatest({ notes, newestComment, threads: context.overview?.threads ?? [] }),
    [notes, newestComment, context.overview],
  );
  const openFull = () => {
    onClose();
    openWorkItemFull(id);
  };
  const moreTabs = (data.form?.tabs.length ?? 1) > 1 ? ', Notes and custom pages' : ' and Notes';
  const [first, ...others] = page?.html ?? [];
  const typeFact = data.form?.typeFact ?? null;

  return (
    <DetailDialog
      title={`AB#${id}`}
      className="bd-work-item-preview bd-wid-peek"
      onClose={onClose}
      header={(titleId) => (
        <div className="bd-wid-peek__head bd-wid" style={{ flex: 'none', display: 'block' }}>
          <div className="bd-wid-peek__top">
            {detail && <TypePill type={detail.workItemType} />}
            <span className="bd-wid-id" id={titleId}>
              AB#{id}
            </span>
            {detail && <StatePill state={detail.state} compact />}
            {detail?.priority != null && (
              <>
                <span className="bd-wid-vsep" />
                <span className="bd-wid-peek__fact">
                  <PrioBars prio={detail.priority} />P{detail.priority}
                </span>
              </>
            )}
            {typeFact?.text && (
              <>
                <span className="bd-wid-vsep" />
                <span className="bd-wid-peek__fact">
                  {typeFact.key.endsWith('.Severity')
                    ? `Sev ${factText(typeFact).split(' · ')[0]}`
                    : `${typeFact.label} ${factText(typeFact)}`}
                </span>
              </>
            )}
            {detail && (
              <>
                <span className="bd-wid-vsep" />
                <span className="bd-wid-peek__fact">
                  {detail.assignedTo ? (
                    <MiniAvatar
                      initials={getInitials(detail.assignedTo)}
                      tone={avatarToneFor(getInitials(detail.assignedTo))}
                      size={16}
                    />
                  ) : (
                    <span className="bd-wid-avatar-empty" aria-hidden="true">
                      ?
                    </span>
                  )}
                  {detail.assignedTo || 'Unassigned'}
                </span>
              </>
            )}
            {detail?.iteration && (
              <>
                <span className="bd-wid-vsep" />
                <span className="bd-wid-peek__fact">{detail.iteration}</span>
              </>
            )}
            <span className="bd-wid-spacer" />
            <Button
              variant="secondary"
              size="sm"
              leading={<Maximize2 size={12} aria-hidden />}
              onClick={openFull}
            >
              Open
            </Button>
            {detail?.htmlUrl && (
              <Button
                variant="secondary"
                size="sm"
                leading={<ExternalLink size={12} aria-hidden />}
                onClick={() => void data.openInBrowser(detail.htmlUrl)}
              >
                ADO
              </Button>
            )}
            <IconButton
              icon={<X size={15} aria-hidden />}
              aria-label={`Close AB#${id}`}
              tooltip="Close (Esc)"
              onClick={onClose}
            />
          </div>
          <h2 className="bd-wid-peek__title">{detail?.title ?? `AB#${id}`}</h2>
          <WorkItemNow context={context} />
        </div>
      )}
    >
      {data.error && (
        <p className="qr-warning" role="alert" style={{ margin: 20 }}>
          {data.error}
        </p>
      )}
      {!detail || !workItem || !page ? (
        <p role="status" className="bd-preview-state">
          {data.isLoading
            ? 'Loading work item…'
            : 'Connect Azure DevOps in Settings to read this item.'}
        </p>
      ) : (
        <div className="bd-wid" style={{ flex: 1, minHeight: 0, background: 'transparent' }}>
          <div className="bd-wid-tabs">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'details', label: 'Details' },
                { id: 'activity', label: 'Activity', count: data.comments.length || undefined },
                { id: 'files', label: 'Attachments', count: data.attachments.length || undefined },
              ]}
            />
            <span className="bd-wid-tabs__layout">Links{moreTabs} are in the full view</span>
          </div>
          <div
            ref={bodyRef}
            className="bd-wid-peek__body"
            data-roomy={roomy || undefined}
            data-side-activity={sideActivity || undefined}
          >
            <div className="bd-wid-peek__main bd-scroll">
              {tab === 'details' && roomy && (
                <DetailsPane
                  tab={page}
                  latest={latest}
                  notes={notes}
                  onShowActivity={() => setTab('activity')}
                  onOpenInAdo={() => void data.openInBrowser(detail.htmlUrl)}
                />
              )}
              {tab === 'details' && !roomy && (
                <>
                  {latest && <LatestCard latest={latest} compact />}
                  {first && <RichTextBlock block={first} compactFolds />}
                  {others.map((block) => (
                    <Accordion
                      key={block.key}
                      block={block}
                      summary={
                        notes && block.key === notes.key
                          ? `${notes.entries.length} update${notes.entries.length === 1 ? '' : 's'}${
                              latest?.message.source === 'notes' ? ' · newest is in Latest' : ''
                            }`
                          : undefined
                      }
                      aside={
                        /\[\s*fail(ed)?\s*\]/i.test(block.html) ? (
                          <span className="bd-wi-fails">Fails</span>
                        ) : undefined
                      }
                    />
                  ))}
                </>
              )}
              {tab === 'activity' && (
                <ActivityTab
                  itemId={id}
                  comments={data.comments}
                  isLoadingComments={data.isLoadingComments}
                  getClient={data.getClient}
                  readOnly
                />
              )}
              {tab === 'files' && (
                <AttachmentsTab
                  attachments={data.attachments}
                  onDownload={(a) => void data.downloadAttachment(a)}
                />
              )}
            </div>
            {sideActivity && (
              <section className="bd-wid-peek__activity bd-scroll" aria-label="Activity">
                <h3 className="bd-wid-peek__colhead">Activity</h3>
                <ActivityTab
                  itemId={id}
                  comments={data.comments}
                  isLoadingComments={data.isLoadingComments}
                  getClient={data.getClient}
                  readOnly
                />
              </section>
            )}
            <aside className="bd-wid-peek__rail bd-scroll" aria-label="Fields">
              <LayoutRail
                groups={page.groups}
                workItem={workItem}
                context={context}
                workItemType={detail.workItemType}
                fromLayout={data.form?.fromLayout ?? false}
                getClient={data.getClient}
                onOpenInAdo={() => void data.openInBrowser(detail.htmlUrl)}
                limit={roomy ? undefined : PEEK_GROUPS}
              />
            </aside>
          </div>
        </div>
      )}
    </DetailDialog>
  );
}
