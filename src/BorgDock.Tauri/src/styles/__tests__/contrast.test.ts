import { describe, expect, it } from 'vitest';

function relLum(hex: string): number {
  const n = hex.replace('#', '');
  const channels = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)].map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
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
// Light surface-raised = rgba(90,86,112,0.03) blended onto white → #fafafb
const LIGHT_TEXT_MUTED = '#6a6580'; // post-PR6 (was #8a85a0 → 3.39:1; now → 5.32:1)
const LIGHT_SURFACE_RAISED = '#fafafb';
// Dark surface-raised = rgba(138,133,160,0.03) blended onto #1a1726 → #1d1a2a
const DARK_TEXT_MUTED = '#9490a8'; // post-PR6 (was #5a5670 → 2.43:1; now → 5.52:1)
const DARK_SURFACE_RAISED = '#1d1a2a';

describe('text-muted contrast against surface-raised', () => {
  it('light theme: text-muted on surface-raised meets WCAG 2.1 AA (≥4.5:1)', () => {
    expect(contrastRatio(LIGHT_TEXT_MUTED, LIGHT_SURFACE_RAISED)).toBeGreaterThanOrEqual(4.5);
  });
  it('dark theme: text-muted on surface-raised meets WCAG 2.1 AA (≥4.5:1)', () => {
    expect(contrastRatio(DARK_TEXT_MUTED, DARK_SURFACE_RAISED)).toBeGreaterThanOrEqual(4.5);
  });
});
