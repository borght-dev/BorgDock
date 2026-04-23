import { FloatingBadgeMock } from './FloatingBadgeMock';
import { WindowFrame } from './WindowFrame';

interface BadgeSetProps {
  width?: number;
  height?: number;
}

export function BadgeSet({ width = 380, height = 620 }: BadgeSetProps) {
  return (
    <WindowFrame
      title="Floating badge"
      width={width}
      height={height}
      statusbar="always-on-top · drag to move · ⌘⇧B toggle"
    >
      <div
        style={{
          flex: 1,
          padding: '36px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-background)',
        }}
      >
        <FloatingBadgeMock status="red" count={23} failing={2} width={320} />
        <FloatingBadgeMock status="yellow" count={18} failing={0} width={320} />
        <FloatingBadgeMock status="green" count={11} failing={0} width={320} />
        <FloatingBadgeMock status="green" count={3} failing={0} width={220} />
        <FloatingBadgeMock status="red" count={1} failing={1} width={180} />
      </div>
    </WindowFrame>
  );
}
