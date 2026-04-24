import clsx from 'clsx';
import type { InputHTMLAttributes, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Rendered to the left of the input, inside the wrapper. */
  leading?: ReactNode;
  /** Rendered to the right of the input, inside the wrapper. */
  trailing?: ReactNode;
}

/**
 * Input — themed text field.
 * Wraps a transparent <input> with optional leading/trailing adornments.
 * `className` lands on the wrapper, not the input, so callers can tweak width.
 */
export function Input({ leading, trailing, className, ...rest }: InputProps) {
  return (
    <div className={clsx('bd-input', className)}>
      {leading !== undefined && <span className="bd-input__adornment">{leading}</span>}
      <input {...rest} />
      {trailing !== undefined && <span className="bd-input__adornment">{trailing}</span>}
    </div>
  );
}
