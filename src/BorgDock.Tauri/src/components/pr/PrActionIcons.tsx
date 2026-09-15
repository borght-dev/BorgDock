import {
  Check,
  Copy,
  Ellipsis,
  ExternalLink,
  Eye,
  GitBranch,
  GitMerge,
  type LucideIcon,
  RefreshCw,
} from 'lucide-react';

// Lucide draws on a 24-unit grid; 2.4 matches the old 1.6-on-16 stroke weight.
const STROKE_WIDTH = 2.4;

function renderIcon(Icon: LucideIcon, size: number) {
  return <Icon size={size} strokeWidth={STROKE_WIDTH} aria-hidden />;
}

export function BranchIcon({ size = 12 }: { size?: number }) {
  return renderIcon(GitBranch, size);
}

export function EyeIcon({ size = 12 }: { size?: number }) {
  return renderIcon(Eye, size);
}

export function MergeIcon({ size = 12 }: { size?: number }) {
  return renderIcon(GitMerge, size);
}

export function RefreshIcon({ size = 12 }: { size?: number }) {
  return renderIcon(RefreshCw, size);
}

export function ExternalIcon({ size = 12 }: { size?: number }) {
  return renderIcon(ExternalLink, size);
}

export function MoreHIcon({ size = 12 }: { size?: number }) {
  return <Ellipsis size={size} strokeWidth={3} aria-hidden />;
}

export function CopyIcon({ size = 12 }: { size?: number }) {
  return renderIcon(Copy, size);
}

export function CheckIcon({ size = 12 }: { size?: number }) {
  return renderIcon(Check, size);
}

export type PrActionIconKind =
  | 'branch'
  | 'eye'
  | 'merge'
  | 'refresh'
  | 'external'
  | 'more'
  | 'copy'
  | 'check';

export function PrActionIcon({ kind, size = 12 }: { kind: PrActionIconKind; size?: number }) {
  switch (kind) {
    case 'branch':
      return <BranchIcon size={size} />;
    case 'eye':
      return <EyeIcon size={size} />;
    case 'merge':
      return <MergeIcon size={size} />;
    case 'refresh':
      return <RefreshIcon size={size} />;
    case 'external':
      return <ExternalIcon size={size} />;
    case 'more':
      return <MoreHIcon size={size} />;
    case 'copy':
      return <CopyIcon size={size} />;
    case 'check':
      return <CheckIcon size={size} />;
  }
}
