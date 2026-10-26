import { useMemo } from 'react';
import { Button, Dot } from '@/components/shared/primitives';
import { showSection, showWorkstream } from '@/services/navigation';
import { WORKSTREAMS_ENABLED } from '@/services/workstreams/feature';
import { useWorkstreamSourcesStore } from '@/stores/workstream-sources-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';
import { ATTENTION_DOT } from './ws-ui';

/** At most this many workstreams are named. */
const SHOWN = 3;

/**
 * WorkstreamsFocusCard — on Focus, the workstreams that need you: each with
 * what needs you first and its next action. Renders nothing when none does.
 */
export function WorkstreamsFocusCard() {
  const entries = useWorkstreamsStore((s) => s.entries);
  const assessments = useWorkstreamSourcesStore((s) => s.assessments);
  const needing = useMemo(
    () =>
      Object.values(entries)
        .filter((e) => e.document.status === 'active')
        .map((e) => ({ document: e.document, top: assessments[e.document.id]?.attention[0] }))
        .filter(
          (w): w is typeof w & { top: NonNullable<typeof w.top> } => !!w.top && w.top.tone !== 'ok',
        )
        .sort((a, b) => Number(b.top.tone === 'bad') - Number(a.top.tone === 'bad')),
    [entries, assessments],
  );
  if (!WORKSTREAMS_ENABLED || needing.length === 0) return null;
  const bad = needing.filter((w) => w.top.tone === 'bad').length;

  return (
    <section className="bd-dp-fcard bd-ws-fcard" aria-label="Workstreams">
      <header className="bd-dp-fcard__head">
        <span className="bd-dp-fcard__summary" data-waiting={bad > 0 || undefined}>
          {bad > 0 ? `${bad} workstream${bad === 1 ? '' : 's'} need you` : 'Workstreams to look at'}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void showSection('workstreams')}>
          Open Workstreams
        </Button>
      </header>
      <ul className="bd-dp-fcard__items">
        {needing.slice(0, SHOWN).map(({ document, top }) => (
          <li key={document.id}>
            <button
              type="button"
              className="bd-dp-fcard__item"
              onClick={() => void showWorkstream(document.id)}
            >
              <span className="bd-dp-fcard__line">
                <Dot tone={ATTENTION_DOT[top.tone]} size={7} />
                <span className="bd-dp-fcard__title">{document.title}</span>
              </span>
              <span className="bd-dp-fcard__latest">{top.reason}</span>
              {document.nextAction && (
                <span className="bd-dp-fcard__latest">Next: {document.nextAction.text}</span>
              )}
            </button>
          </li>
        ))}
        {needing.length > SHOWN && (
          <li className="bd-dp-fcard__more">and {needing.length - SHOWN} more</li>
        )}
      </ul>
    </section>
  );
}
