// The site's graphite (dark) and porcelain (light) tokens, hard-coded because
// Remotion cannot read site/src/styles/tokens.css. Values copied from that
// file on 2026-09-25; if the app's tokens change, update these by hand.

export type ThemeName = 'dark' | 'light';

export interface Palette {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentForeground: string;
  strongBorder: string;
  logoStart: string;
  logoEnd: string;
  /** --elevation-3 */
  shadow: string;
}

export const palettes: Record<ThemeName, Palette> = {
  dark: {
    background: '#151618',
    surface: '#1b1c1f',
    textPrimary: '#ededef',
    textSecondary: '#9c9da4',
    accent: '#7f7eff',
    accentForeground: '#12121a',
    strongBorder: 'rgba(255, 255, 255, 0.12)',
    logoStart: '#7f7eff',
    logoEnd: '#a5a4ff',
    shadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
  },
  light: {
    background: '#f5f5f7',
    surface: '#ffffff',
    textPrimary: '#17181c',
    textSecondary: '#5d606a',
    accent: '#4f46e5',
    accentForeground: '#ffffff',
    strongBorder: '#d4d6dc',
    logoStart: '#4f46e5',
    logoEnd: '#8b8cff',
    shadow: '0 20px 60px rgba(16, 18, 27, 0.28)',
  },
};

// --font-ui and --font-reading from tokens.css. The fontsource packages
// register the families as "Inter Variable" and "Instrument Sans Variable".
export const fonts = {
  ui: '"Inter Variable", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
  reading: '"Instrument Sans Variable", "Inter Variable", "Segoe UI", system-ui, sans-serif',
  code: '"JetBrains Mono Variable", "Cascadia Code", Consolas, monospace',
};

/** The site's WindowFrame, scaled up for video: 14 px corners at 1080p. */
export const FRAME_RADIUS = 14;
