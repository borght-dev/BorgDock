import { useMemo } from 'react';
import { Button } from '@/components/shared/primitives';
import { showDispatchItem } from '@/services/dispatch/actions';
import { showSection } from '@/services/navigation';
import { useDispatchStore } from '@/stores/dispatch-store';
import { UnitAside } from './DispatchRow';

/** At most this many items are named; the rest are counted. */
const SHOWN = 3;

/**
 * DispatchFocusStrip — the agents that wait on you, at the top of Focus. A
 * pull request that needs you and an agent that needs you are the same kind
 * of interruption, so both show where you look first. Picking one opens it
 * in Dispatch. Renders nothing while no agent waits.
 */
export function DispatchFocusStrip() {
  const overview = useDispatchStore((s) => s.overview);
  const waiting = useMemo(
    () => overview?.items.filter((o) => o.bay === 'waiting') ?? [],
    [overview],
  );
  if (waiting.length === 0) return null;

  return (
    <section className="bd-dp-focus-strip" aria-label="Agents that need you">
      <span className="bd-dp-focus-strip__count">
        {waiting.length === 1 ? '1 agent needs you' : `${waiting.length} agents need you`}
      </span>
      {waiting.slice(0, SHOWN).map((o) => (
        <button
          key={o.item.id}
          type="button"
          className="bd-dp-focus-strip__item"
          title={`${o.waitingFor ?? ''}: ${o.item.title}`}
          onClick={() => showDispatchItem(o.item.id)}
        >
          <UnitAside overview={o} />
          <span className="bd-dp-focus-strip__title">{o.item.title}</span>
        </button>
      ))}
      {waiting.length > SHOWN && (
        <span className="bd-dp-focus-strip__more">and {waiting.length - SHOWN} more</span>
      )}
      <Button variant="ghost" size="sm" onClick={() => void showSection('dispatch')}>
        Open Dispatch
      </Button>
    </section>
  );
}
