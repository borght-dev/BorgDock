import { describe, expect, it } from 'vitest';

function relLum(hex: string): number {
  const n = hex.replace('#', '');
  const channels = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)].map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const l1 = relLum(a);
  const l2 = relLum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// These mirror the index.css values. Update both when the tokens change.
// Light (Porcelain) surface-raised = rgba(23,24,28,0.03) blended onto white → #f8f8f8
const LIGHT_TEXT_MUTED = '#6b6e78';
const LIGHT_SURFACE_RAISED = '#f8f8f8';
// Dark (graphite) surface-raised is the solid #212226
const DARK_TEXT_MUTED = '#8e8f96';
const DARK_SURFACE_RAISED = '#212226';

describe('text-muted contrast against surface-raised', () => {
  it('light theme: text-muted on surface-raised meets WCAG 2.1 AA (≥4.5:1)', () => {
    expect(contrastRatio(LIGHT_TEXT_MUTED, LIGHT_SURFACE_RAISED)).toBeGreaterThanOrEqual(4.5);
  });
  it('dark theme: text-muted on surface-raised meets WCAG 2.1 AA (≥4.5:1)', () => {
    expect(contrastRatio(DARK_TEXT_MUTED, DARK_SURFACE_RAISED)).toBeGreaterThanOrEqual(4.5);
  });
});

// CheckBar labels use the badge foregrounds; list rows sit on the surface
// (#ffffff) or directly on the window background (#f5f5f7).
const LIGHT_BACKGROUND = '#f5f5f7';
const LIGHT_SURFACE = '#ffffff';
const LIGHT_WARNING_BADGE_FG = '#8f620b';
const LIGHT_ERROR_BADGE_FG = '#bf3552';

describe('light badge foregrounds (CheckBar running / failing labels)', () => {
  it.each([
    ['warning', LIGHT_WARNING_BADGE_FG],
    ['error', LIGHT_ERROR_BADGE_FG],
  ])('%s badge fg meets 4.5:1 on surface and background', (_name, fg) => {
    expect(contrastRatio(fg, LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fg, LIGHT_BACKGROUND)).toBeGreaterThanOrEqual(4.5);
  });
});
