import clsx from 'clsx';

const CLAUDE_RAYS =
  'M8 6.5V1.6M8.75 6.7l1.7-2.94M9.3 7.25l4.24-2.45M9.5 8h3.4M9.3 8.75l4.24 2.45M8.75 9.3l1.7 2.94M8 9.5v4.9M7.25 9.3l-1.7 2.94M6.7 8.75l-4.24 2.45M6.5 8H3.1M6.7 7.25L2.46 4.8M7.25 6.7l-1.7-2.94';
const CODEX_CELL = 'M8 1.7l5.46 3.15v6.3L8 14.3l-5.46-3.15v-6.3z';

export interface ProviderIconProps {
  /** `claude` or `codex`. */
  provider: string;
  size?: number;
  className?: string;
}

/** The mark that says which provider an account is with: a burst for Claude, a cell for Codex. */
export function ProviderIcon({ provider, size = 14, className }: ProviderIconProps) {
  const codex = provider === 'codex';
  return (
    <svg
      className={clsx('bd-ai-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={codex ? 1.5 : 1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-provider={codex ? 'codex' : 'claude'}
    >
      {codex ? (
        <>
          <path d={CODEX_CELL} />
          <circle cx="8" cy="8" r="1.7" />
        </>
      ) : (
        <path d={CLAUDE_RAYS} />
      )}
    </svg>
  );
}

export interface AccountBadgeProps {
  label: string;
  /** The label's identity colour, 1 to 5. */
  color: number;
  className?: string;
}

/** The short label that says which account: "GO", "OU". */
export function AccountBadge({ label, color, className }: AccountBadgeProps) {
  return (
    <b className={clsx('bd-ai-badge', className)} data-color={color}>
      {label}
    </b>
  );
}

export interface AccountMarkProps {
  provider: string;
  label: string;
  color: number;
}

/** Provider icon and account label side by side: how an account is named everywhere. */
export function AccountMark({ provider, label, color }: AccountMarkProps) {
  return (
    <span className="bd-ai-mark">
      <ProviderIcon provider={provider} />
      <AccountBadge label={label} color={color} />
    </span>
  );
}
