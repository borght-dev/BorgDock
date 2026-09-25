import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Logo } from '../components/Logo';
import { captionEntrance, enter } from '../motion';
import { fonts, type Palette } from '../theme';

export const SITE_HOST = 'borgdock.koenvdborght.nl';

/** Wordmark, the address, and what it costs. The URL is the one accent. */
export const DownloadCard: React.FC<{ palette: Palette; scale?: number }> = ({
  palette,
  scale = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        background: palette.background,
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 28 * scale,
          ...captionEntrance(enter(frame, fps, 6)),
        }}
      >
        <Logo size={96 * scale} palette={palette} />
        <span
          style={{
            fontFamily: fonts.ui,
            fontSize: 92 * scale,
            fontWeight: 650,
            letterSpacing: '-0.03em',
            color: palette.textPrimary,
          }}
        >
          BorgDock
        </span>
      </div>
      <div
        style={{
          marginTop: 56 * scale,
          padding: `${16 * scale}px ${34 * scale}px`,
          borderRadius: 9999,
          border: `1px solid ${palette.strongBorder}`,
          fontFamily: fonts.ui,
          fontSize: 42 * scale,
          fontWeight: 550,
          letterSpacing: '-0.01em',
          color: palette.accent,
          ...captionEntrance(enter(frame, fps, 16)),
        }}
      >
        {SITE_HOST}
      </div>
      <div
        style={{
          marginTop: 30 * scale,
          fontFamily: fonts.reading,
          fontSize: 34 * scale,
          color: palette.textSecondary,
          ...captionEntrance(enter(frame, fps, 24)),
        }}
      >
        Free, open source, Windows today
      </div>
    </AbsoluteFill>
  );
};
