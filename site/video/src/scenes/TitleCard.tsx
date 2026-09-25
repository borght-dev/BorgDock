import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Logo } from '../components/Logo';
import { captionEntrance, enter } from '../motion';
import { fonts, type Palette } from '../theme';

export const HEADLINE = 'Every pull request, one window.';
export const SUBHEAD =
  'BorgDock watches your checks, tells you what needs you, hands failures to Claude, and lets you review and merge without opening a browser tab.';

/** The site's hero in one frame: headline in Inter, subhead in Instrument Sans. */
export const TitleCard: React.FC<{ palette: Palette }> = ({ palette }) => {
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
      <div style={captionEntrance(enter(frame, fps, 4))}>
        <Logo size={72} palette={palette} />
      </div>
      <div
        style={{
          marginTop: 44,
          fontFamily: fonts.ui,
          fontSize: 108,
          fontWeight: 700,
          letterSpacing: '-0.035em',
          lineHeight: 1.02,
          color: palette.textPrimary,
          ...captionEntrance(enter(frame, fps, 10)),
        }}
      >
        {HEADLINE}
      </div>
      <div
        style={{
          marginTop: 36,
          maxWidth: 1340,
          fontFamily: fonts.reading,
          fontSize: 38,
          lineHeight: 1.45,
          color: palette.textSecondary,
          ...captionEntrance(enter(frame, fps, 22)),
        }}
      >
        {SUBHEAD}
      </div>
    </AbsoluteFill>
  );
};
