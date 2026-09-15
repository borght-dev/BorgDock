import { RefreshCw } from 'lucide-react';

export interface RefreshIconProps {
  /** When true, rotates the icon using the
   * shared `sidebar-spin` keyframe defined in styles/index.css. */
  spinning?: boolean;

  /** Square pixel size. Defaults to 14. */
  size?: number;
}

export function RefreshIcon({ spinning = false, size = 14 }: RefreshIconProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        transformOrigin: '50% 50%',
        animation: spinning ? 'sidebar-spin 0.8s linear infinite' : undefined,
        willChange: spinning ? 'transform' : undefined,
      }}
    >
      <RefreshCw size={size} strokeWidth={2.25} />
    </span>
  );
}
