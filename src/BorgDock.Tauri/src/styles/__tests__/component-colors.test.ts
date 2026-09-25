import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Components take colours from the tokens in src/styles/index.css, never from
 * literals, so both themes (and a future retint) reach every surface
 * (plans/ui-overhaul-workbench.md, phase 6). Exceptions are listed in ALLOWED.
 */
const COMPONENTS = resolve(__dirname, '../../components');
/**
 * Files allowed to keep literals, each with the reason. None since the 3.0.0
 * cutover: the splash reads the tokens too. (public/entry/splash.css inlines
 * the few values the static pre-bundle splash needs; it is not a component.)
 */
const ALLOWED = new Set<string>();

function isExcluded(rel: string): boolean {
  return (
    /(^|\/)(__tests__|__fixtures__|fixtures)\//.test(rel) ||
    /\.(stories|test|spec)\.tsx?$/.test(rel) ||
    ALLOWED.has(rel)
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** #rgb, #rgba, #rrggbb and #rrggbbaa. */
const HEX = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/i;
/** rgb(), rgba(), hsl(), hsla(). */
const FUNCTIONAL = /\b(?:rgba?|hsla?)\(/i;
/**
 * Tailwind's black / white utilities: the palette reset in index.css
 * (`--color-*: initial`) removes them, so `bg-black/50` or `text-white`
 * silently render nothing.
 */
const PALETTE_UTILITY = /\b(?:bg|text|border|from|to|via|fill|stroke)-(?:black|white)\b/;

describe('component colours come from tokens', () => {
  it('no hex, rgb() or hsl() literal in src/components (outside stories, tests, fixtures)', () => {
    const hits: string[] = [];
    for (const file of sourceFiles(COMPONENTS)) {
      const rel = relative(COMPONENTS, file).split(sep).join('/');
      if (isExcluded(rel)) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          // Comment lines name things like `#1234` (an issue); they draw nothing.
          if (/^\s*(\/\/|\/?\*)/.test(line)) return;
          if (HEX.test(line) || FUNCTIONAL.test(line) || PALETTE_UTILITY.test(line))
            hits.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('walks the component tree (guards against a wrong path passing vacuously)', () => {
    expect(sourceFiles(COMPONENTS).length).toBeGreaterThan(200);
  });
});
