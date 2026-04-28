import { Pill } from '@/components/shared/primitives';

interface LabelBadgeProps {
  label: string;
}

export function LabelBadge({ label }: LabelBadgeProps) {
  return <Pill tone="neutral">{label}</Pill>;
}
