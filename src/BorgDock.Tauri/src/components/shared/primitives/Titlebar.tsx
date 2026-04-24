import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface TitlebarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
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
 * Titlebar — shared chrome bar used by every window (main, flyout, palette, pr-detail, sql).
 * Slots: `left` (or auto-composed title/count/meta) — spacer — `right`.
 */
export function Titlebar({
  title,
  count,
  meta,
  left,
  right,
  className,
  ...rest
}: TitlebarProps) {
  return (
    <div className={clsx('bd-titlebar', className)} {...rest}>
      {left ?? (
        <>
          {title !== undefined && <span className="bd-titlebar__title">{title}</span>}
          {count !== undefined && <span className="bd-titlebar__count">{count}</span>}
          {meta !== undefined && <span className="bd-titlebar__meta">{meta}</span>}
        </>
      )}
      <span className="bd-titlebar__spacer" />
      {right}
    </div>
  );
}
