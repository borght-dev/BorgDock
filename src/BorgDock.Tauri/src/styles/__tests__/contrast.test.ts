import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

// The checks below read the token values straight from index.css, so they
// follow any retint without a mirrored constant to update.
const INDEX_CSS = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

/** Every `--name: value;` declaration of the first block that opens with `selector {`. */
function tokenBlock(selector: string): Map<string, string> {
  const start = INDEX_CSS.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block in index.css`);
  const body = INDEX_CSS.slice(start, INDEX_CSS.indexOf('\n}', start));
  const tokens = new Map<string, string>();
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens.set(m[1] as string, (m[2] as string).replace(/\s+/g, ' ').trim());
  }
  return tokens;
}

const LIGHT = tokenBlock(':root');
const DARK = tokenBlock('.dark');
const THEMES = {
  light: LIGHT,
  // A token `.dark` does not declare inherits the light value. One it does
  // declare is used as declared (never silently replaced by the light value).
  dark: new Map([...LIGHT, ...DARK]),
};

const HEX_VALUE = /^#[0-9a-fA-F]{6}$/;

/** A solid token as `#rrggbb`; throws when the theme's value is not a plain hex. */
function token(theme: keyof typeof THEMES, name: string): string {
  const value = THEMES[theme].get(name);
  if (!value) throw new Error(`--${name} is not declared for the ${theme} theme`);
  if (!HEX_VALUE.test(value)) {
    throw new Error(
      `--${name} is \`${value}\` in the ${theme} theme; this check needs a #rrggbb value`,
    );
  }
  return value;
}

/** An `rgba(r, g, b, a)` token composited over a solid `#rrggbb`. */
function overlay(theme: keyof typeof THEMES, name: string, base: string): string {
  const value = THEMES[theme].get(name) ?? '';
  const m = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (!m) throw new Error(`--${name} is \`${value}\` in the ${theme} theme; expected rgba()`);
  const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  const under = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  return `#${[r, g, b]
    .map((c, i) => Math.round(c * a + (under[i] as number) * (1 - a)))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
  it('accent-foreground on the accent fill meets 4.5:1 (primary buttons, checkboxes)', () => {
    expect(
      contrastRatio(token(theme, 'color-accent-foreground'), token(theme, 'color-accent')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    'color-status-green',
    'color-status-yellow',
  ])('status-fill-foreground on %s meets 4.5:1 (solid action pills)', (fill) => {
    expect(
      contrastRatio(token(theme, 'color-status-fill-foreground'), token(theme, fill)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['color-status-yellow', 'color-status-fill-foreground'],
    ['color-status-green', 'color-status-fill-foreground'],
    ['color-error-badge-fg', 'color-danger-fill-foreground'],
    ['color-accent', 'color-accent-foreground'],
  ])('flyout banner: text on %s meets 4.5:1', (fill, fg) => {
    expect(contrastRatio(token(theme, fg), token(theme, fill))).toBeGreaterThanOrEqual(4.5);
  });

  const SYNTAX = [
    'keyword',
    'string',
    'comment',
    'number',
    'type',
    'function',
    'variable',
    'operator',
    'punctuation',
    'constant',
    'property',
    'tag',
    'attribute',
    'plain',
  ];
  // Code sits on the window background, on surfaces and in code blocks.
  const CODE_SURFACES = ['color-background', 'color-surface', 'color-code-block-bg'];
  // Diff lines tint the pane background with these overlays.
  const DIFF_OVERLAYS = [
    'color-diff-added-bg',
    'color-diff-added-bg-highlight',
    'color-diff-deleted-bg',
    'color-diff-deleted-bg-highlight',
  ];

  it.each(SYNTAX)('syntax %s meets 4.5:1 on every code surface', (name) => {
    for (const surface of CODE_SURFACES) {
      expect(
        contrastRatio(token(theme, `color-syntax-${name}`), token(theme, surface)),
        `${name} on ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(SYNTAX)('syntax %s meets 4.5:1 on added and deleted diff lines', (name) => {
    const pane = token(theme, 'color-background');
    for (const tint of DIFF_OVERLAYS) {
      expect(
        contrastRatio(token(theme, `color-syntax-${name}`), overlay(theme, tint, pane)),
        `${name} on ${tint}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
