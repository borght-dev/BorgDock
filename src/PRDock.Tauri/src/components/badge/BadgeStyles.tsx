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

export { GlassCapsule } from './styles/GlassCapsule';
export { MinimalNotch } from './styles/MinimalNotch';
export { FloatingIsland } from './styles/FloatingIsland';
export { LiquidMorph } from './styles/LiquidMorph';
export { SpectralBar } from './styles/SpectralBar';

// Re-import for the map (tree-shaking still works since the map references all variants)
import { GlassCapsule } from './styles/GlassCapsule';
import { MinimalNotch } from './styles/MinimalNotch';
import { FloatingIsland } from './styles/FloatingIsland';
import { LiquidMorph } from './styles/LiquidMorph';
import { SpectralBar } from './styles/SpectralBar';

export const badgeStyleMap: Record<string, React.ComponentType<BadgeStyleProps>> = {
  GlassCapsule,
  MinimalNotch,
  FloatingIsland,
  LiquidMorph,
  SpectralBar,
};
