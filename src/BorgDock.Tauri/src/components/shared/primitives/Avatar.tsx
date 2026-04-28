import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

export type AvatarTone = 'own' | 'them' | 'blue' | 'rose';
export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Two-letter initials shown in the centre. */
  initials: string;
  /** Gradient preset. Default 'them'. */
  tone?: AvatarTone;
  /** Size preset. Default 'md'. */
  size?: AvatarSize;
}

/**
 * Avatar — gradient-filled initial bubble.
 * Replaces gradient avatar patterns in PR/Focus/Reviews/WorkItems.
 */
export function Avatar({
  initials,
  tone = 'them',
  size = 'md',
  className,
  ...rest
}: AvatarProps) {
  return (
    <span
      className={clsx(
        'bd-avatar',
        `bd-avatar--${tone}`,
        size === 'sm' && 'bd-avatar--sm',
        size === 'lg' && 'bd-avatar--lg',
        className,
      )}
      {...rest}
    >
      {initials}
    </span>
  );
}
