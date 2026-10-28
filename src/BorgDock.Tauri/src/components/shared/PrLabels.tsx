import clsx from 'clsx';
import type { CSSProperties } from 'react';
import type { PullRequest } from '@/types';
import './pr-labels.css';

const HEX_COLOR = /^[0-9a-f]{6}$/i;

function labelStyle(color: string | undefined): CSSProperties | undefined {
  return color && HEX_COLOR.test(color) ? ({ '--label': `#${color}` } as CSSProperties) : undefined;
}

/** A PR's GitHub labels as chips in GitHub's colours; nothing for a PR without labels. */
export function PrLabels({
  pr,
  className,
}: {
  pr: Pick<PullRequest, 'labels' | 'labelColors'>;
  className?: string;
}) {
  if (pr.labels.length === 0) return null;
  return (
    <ul className={clsx('bd-pr-labels', className)} aria-label="Labels">
      {pr.labels.map((name) => (
        <li key={name} className="bd-pr-label" style={labelStyle(pr.labelColors?.[name])}>
          {name}
        </li>
      ))}
    </ul>
  );
}
