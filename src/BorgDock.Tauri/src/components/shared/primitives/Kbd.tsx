import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/**
 * Kbd — keyboard key chip.
 * Used inside tooltips, command palette, onboarding surfaces.
 */
export function Kbd({ children, className, ...rest }: KbdProps) {
  return (
    <kbd className={clsx('bd-kbd', className)} {...rest}>
      {children}
    </kbd>
  );
}
