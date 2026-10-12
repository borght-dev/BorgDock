import type { DispatchItem } from '@/services/dispatch/types';

/** Position of a state on the track, relative to where the item is now. */
export function trackStep(
  item: Pick<DispatchItem, 'state' | 'states'>,
  stateName: string,
  suggested: string | null,
): 'now' | 'suggested' | 'done' | 'ahead' {
  const names = item.states.map((s) => s.name);
  const now = names.indexOf(item.state);
  const index = names.indexOf(stateName);
  if (index === now) return 'now';
  if (stateName === suggested) return 'suggested';
  return now !== -1 && index < now ? 'done' : 'ahead';
}

/** The item's workflow as a row of steps: where it is, and where a suggestion would move it. */
export function StateTrack({ item, suggested }: { item: DispatchItem; suggested: string | null }) {
  if (item.states.length === 0) return null;
  return (
    <ol className="bd-dp-track" aria-label="Workflow">
      {item.states.map((state) => {
        const step = trackStep(item, state.name, suggested);
        return (
          <li
            key={state.name}
            className="bd-dp-track__step"
            data-step={step}
            aria-current={step === 'now' ? 'step' : undefined}
            title={state.name}
          >
            {state.name}
          </li>
        );
      })}
    </ol>
  );
}
