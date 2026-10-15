import type { Lane } from '@/services/dispatch/walk';

/** LanePips — every lane as its name and one square per item, in the color of its verdict. */
export function LanePips({ lanes }: { lanes: readonly Lane[] }) {
  return (
    <span className="bd-dp-pips">
      {lanes
        .filter((lane) => lane.inWalk || lane.rows.length > 0)
        .map((lane) => (
          <span key={lane.state} className="bd-dp-pips__lane" title={lane.state}>
            {lane.state}
            {lane.rows.length === 0 ? (
              <em>0</em>
            ) : (
              lane.rows.map((o) => <i key={o.item.id} data-tone={o.verdict.tone} />)
            )}
          </span>
        ))}
    </span>
  );
}
