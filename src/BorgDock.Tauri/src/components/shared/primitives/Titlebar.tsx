import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface TitleBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Default middle-slot title text. Ignored when `left` is supplied. */
  title?: ReactNode;
  /** Numeric badge rendered next to the title. Ignored when `left` is supplied. */
  count?: number;
  /** Meta content (e.g. breadcrumb, filter hint). Ignored when `left` is supplied. */
  meta?: ReactNode;
  /** Override the middle slot entirely. Useful when consumers need a composite title. */
  left?: ReactNode;
  /** Trailing slot — typically window controls or action buttons. */
  right?: ReactNode;
}

/**
 * TitleBar — shared chrome bar used by every window (main, flyout, palette, pr-detail, sql).
 * Slots: `left` (or auto-composed title/count/meta) — spacer — `right`.
 */
export function TitleBar({
  title,
  count,
  meta,
  left,
  right,
  className,
  ...rest
}: TitleBarProps) {
  return (
    <div className={clsx('bd-title-bar', className)} {...rest}>
      {left ?? (
        <>
          {title !== undefined && <span className="bd-title-bar__title">{title}</span>}
          {count !== undefined && <span className="bd-title-bar__count">{count}</span>}
          {meta !== undefined && <span className="bd-title-bar__meta">{meta}</span>}
        </>
      )}
      <span className="bd-title-bar__spacer" />
      {right}
    </div>
  );
}
