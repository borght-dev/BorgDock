import type { StatusColor } from './FloatingBadge';

export interface BadgeStyleProps {
  totalPrCount: number;
  failingCount: number;
  pendingCount: number;
  statusColor: StatusColor;
  statusText: string;
  onClick: () => void;
  onToggleExpand?: () => void;
  isExpanded?: boolean;
}

export { FloatingIsland } from './styles/FloatingIsland';
export { GlassCapsule } from './styles/GlassCapsule';
export { LiquidMorph } from './styles/LiquidMorph';
export { MinimalNotch } from './styles/MinimalNotch';
export { SpectralBar } from './styles/SpectralBar';

import { FloatingIsland } from './styles/FloatingIsland';
// Re-import for the map (tree-shaking still works since the map references all variants)
import { GlassCapsule } from './styles/GlassCapsule';
import { LiquidMorph } from './styles/LiquidMorph';
import { MinimalNotch } from './styles/MinimalNotch';
import { SpectralBar } from './styles/SpectralBar';

export const badgeStyleMap: Record<string, React.ComponentType<BadgeStyleProps>> = {
  GlassCapsule,
  MinimalNotch,
  FloatingIsland,
  LiquidMorph,
  SpectralBar,
};
