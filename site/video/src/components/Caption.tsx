import { useCurrentFrame, useVideoConfig } from 'remotion';
import { captionEntrance, enter } from '../motion';
import { fonts, type Palette } from '../theme';

/** Two lines under the window: the benefit, then the feature by its app name. */
export const Caption: React.FC<{
  headline: string;
  detail: string;
  palette: Palette;
  delay: number;
  size: { headline: number; detail: number; width: number };
}> = ({ headline, detail, palette, delay, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = enter(frame, fps, delay);
  const b = enter(frame, fps, delay + 5);
  return (
    <div style={{ width: size.width, textAlign: 'center' }}>
      <div
        style={{
          fontFamily: fonts.ui,
          fontSize: size.headline,
          fontWeight: 650,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          color: palette.textPrimary,
          ...captionEntrance(a),
        }}
      >
        {headline}
      </div>
      <div
        style={{
          marginTop: Math.round(size.detail * 0.45),
          fontFamily: fonts.reading,
          fontSize: size.detail,
          lineHeight: 1.4,
          color: palette.textSecondary,
          ...captionEntrance(b),
        }}
      >
        {detail}
      </div>
    </div>
  );
};
