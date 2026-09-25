import { FRAME_RADIUS, type Palette } from '../theme';

/**
 * The site's WindowFrame: surface, hairline border, rounded corners and the
 * --elevation-3 shadow. Nothing is drawn inside but the recording.
 */
export const WindowFrame: React.FC<{
  width: number;
  height: number;
  palette: Palette;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ width, height, palette, style, children }) => (
  <div
    style={{
      position: 'relative',
      width,
      height,
      overflow: 'hidden',
      borderRadius: FRAME_RADIUS,
      border: `1px solid ${palette.strongBorder}`,
      background: palette.surface,
      boxShadow: palette.shadow,
      boxSizing: 'content-box',
      ...style,
    }}
  >
    {children}
  </div>
);
