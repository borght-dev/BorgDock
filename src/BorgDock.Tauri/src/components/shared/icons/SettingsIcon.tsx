import { Settings } from 'lucide-react';

export interface SettingsIconProps {
  size?: number;
}

/** Lucide gear. */
export function SettingsIcon({ size = 14 }: SettingsIconProps) {
  return <Settings size={size} aria-hidden="true" />;
}
