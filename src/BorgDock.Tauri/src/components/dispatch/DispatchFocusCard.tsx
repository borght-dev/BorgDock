import { useMemo } from 'react';
import { Button } from '@/components/shared/primitives';
import { showDispatchItem } from '@/services/dispatch/actions';
import { needingYou, walkLanes } from '@/services/dispatch/walk';
import { showSection } from '@/services/navigation';
import { useDispatchStore } from '@/stores/dispatch-store';
import { LanePips } from './LanePips';

/** At most this many items are named; the rest are counted. */
const SHOWN = 4;

/**
 * DispatchFocusCard — Dispatch at the top of Focus: the shape of the work,
 * one square per item in each state, and the items that wait on you, each
 * with the newest thing said about it. Picking one opens it in Dispatch.
 * Renders nothing until Dispatch has items.
 */
export function DispatchFocusCard() {
  const overview = useDispatchStore((s) => s.overview);
  const items = overview?.items ?? [];
  const lanes = useMemo(() => walkLanes(items), [items]);
  const waiting = useMemo(() => needingYou(items), [items]);
  if (items.length === 0) return null;

  const canMove = items.filter((o) => o.verdict.tone === 'ok').length;
  const working = items.filter((o) =>
    o.threads.some((t) => t.open && t.status === 'running'),
  ).length;
  const summary = [
    waiting.length > 0 ? `${waiting.length} need you` : 'Nothing waits on you',
    canMove > 0 ? `${canMove} can move` : null,
    working > 0 ? `${working} agents working` : null,
  ].filter(Boolean);

  return (
    <section className="bd-dp-fcard" aria-label="Dispatch">
      <header className="bd-dp-fcard__head">
        <span className="bd-dp-fcard__summary" data-waiting={waiting.length > 0 || undefined}>
          {summary.join(' · ')}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void showSection('dispatch')}>
          Open Dispatch
        </Button>
      </header>
      <LanePips lanes={lanes} />
      {waiting.length > 0 && (
        <ul className="bd-dp-fcard__items">
          {waiting.slice(0, SHOWN).map((o) => (
            <li key={o.item.id}>
              <button
                type="button"
                className="bd-dp-fcard__item"
                onClick={() => showDispatchItem(o.item.id)}
              >
                <span className="bd-dp-fcard__line">
                  <em>{o.item.id}</em>
                  <span className="bd-dp-fcard__verdict" data-tone={o.verdict.tone}>
                    {o.verdict.label}
                  </span>
                  <span className="bd-dp-fcard__title">{o.item.title}</span>
                </span>
                {o.latest && (
                  <span className="bd-dp-fcard__latest">
                    {o.latest.author}: {o.latest.text}
                  </span>
                )}
              </button>
            </li>
          ))}
          {waiting.length > SHOWN && (
            <li className="bd-dp-fcard__more">and {waiting.length - SHOWN} more</li>
          )}
        </ul>
      )}
    </section>
  );
}
