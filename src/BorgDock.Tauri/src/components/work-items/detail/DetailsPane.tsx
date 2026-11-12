import { Plus } from 'lucide-react';
import type { FormTab } from '@/services/ado/form-model';
import type { ItemLatest, NotesField } from '@/services/ado/work-item-latest';
import { LatestCard } from './LatestCard';
import { NotesLog } from './NotesLog';
import { RichTextBlock } from './RichTextBlock';

export interface DetailsPaneProps {
  tab: FormTab;
  /** Latest shows on the Details tab only. */
  latest: ItemLatest | null;
  notes: NotesField | null;
  /** Opens the Activity tab ("All updates" when the latest is a comment). */
  onShowActivity?: () => void;
  /** Opens the item in ADO, where an empty long-text field is filled in. */
  onOpenInAdo?: () => void;
}

/**
 * One page of the form: Latest, then the page's long-text fields in layout
 * order (a dated log as a list), its short wide-column fields, and the empty
 * long-text fields as "+ Add".
 */
export function DetailsPane({ tab, latest, notes, onShowActivity, onOpenInAdo }: DetailsPaneProps) {
  const scrollToNotes = () => {
    if (!notes) return;
    document
      .querySelector(`[data-wid-field="${CSS.escape(notes.key)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const nothing =
    tab.html.length === 0 && tab.plain.length === 0 && tab.emptyHtml.length === 0 && !latest;

  return (
    <>
      {latest && (
        <LatestCard
          latest={latest}
          noteCount={latest.entry ? (notes?.entries.length ?? null) : null}
          onShowAll={latest.message.source === 'notes' ? scrollToNotes : onShowActivity}
          showAllLabel={latest.message.source === 'notes' ? 'All updates' : 'Activity'}
        />
      )}
      {tab.html.map((block) =>
        notes && block.key === notes.key ? (
          <NotesLog
            key={block.key}
            block={block}
            entries={notes.entries}
            newestInLatest={latest?.message.source === 'notes'}
          />
        ) : (
          <RichTextBlock key={block.key} block={block} />
        ),
      )}
      {tab.plain.length > 0 && (
        <dl className="bd-wid-grid">
          {tab.plain.map((field) => (
            <div key={field.key} style={{ display: 'contents' }}>
              <dt>{field.label}</dt>
              <dd>{field.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {tab.emptyHtml.length > 0 && (
        <div className="bd-wid-empties" data-wid-empties="">
          <span>Empty in this layout:</span>
          {tab.emptyHtml.map((field) => (
            <button
              key={field.key}
              type="button"
              className="bd-wid-addf"
              title={`Add ${field.label} in Azure DevOps`}
              onClick={onOpenInAdo}
            >
              <Plus size={12} strokeWidth={2} aria-hidden />
              {field.label}
            </button>
          ))}
        </div>
      )}
      {nothing && <p className="bd-wid-empty-tab">Nothing on this page yet.</p>}
    </>
  );
}
