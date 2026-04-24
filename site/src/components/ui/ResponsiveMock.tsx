import type { ReactNode, CSSProperties } from 'react';

interface ResponsiveMockProps {
  designWidth: number;
  designHeight: number;
  children: ReactNode;
}

/**
 * Renders a fixed-design-width mock and scales it down to fit a narrower
 * container via CSS container queries + transform. Pure CSS — no hydration.
 * The outer uses aspect-ratio so layout height collapses to scaled height.
 */
export function ResponsiveMock({ designWidth, designHeight, children }: ResponsiveMockProps) {
  const style = {
    '--mock-dw': designWidth,
    '--mock-dh': designHeight,
  } as CSSProperties;

  return (
    <div className="responsive-mock" style={style}>
      <div className="responsive-mock__inner">{children}</div>
    </div>
  );
}
