/**
 * Build integrity tests — verify the wiring between:
 *   HTML entry points  →  JS/TSX entry modules  →  React #root mount
 *   Vite rollup inputs  →  HTML files on disk
 *   Rust window URLs    →  HTML files in rollup inputs
 *
 * These catch configuration bugs (like pointing a window at a non-existent
 * HTML file) that component-level tests miss because they mock Tauri APIs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');

// ── Expected entry points ────────────────────────────────────────────
// Each entry: { html file, vite rollup key, script src in HTML }
const ENTRY_POINTS = [
  { key: 'main', html: 'index.html', script: '/src/main.tsx' },
  { key: 'flyout', html: 'flyout.html', script: '/src/flyout-main.tsx' },
  {
    key: 'work-item-palette',
    html: 'work-item-palette.html',
    script: '/src/work-item-palette-main.tsx',
  },
  { key: 'pr-detail', html: 'pr-detail.html', script: '/src/pr-detail-main.tsx' },
  { key: 'sql', html: 'sql.html', script: '/src/sql-main.tsx' },
  { key: 'worktree', html: 'worktree.html', script: '/src/worktree-main.tsx' },
  { key: 'workitem-detail', html: 'workitem-detail.html', script: '/src/workitem-detail-main.tsx' },
  { key: 'whats-new', html: 'whats-new.html', script: '/src/whats-new-main.tsx' },
  { key: 'note-capture', html: 'note-capture.html', script: '/src/note-capture-main.tsx' },
  { key: 'settings', html: 'settings.html', script: '/src/settings-main.tsx' },
];

// Rust-side window URLs → expected HTML file (must be a valid entry point)
const RUST_WINDOW_URLS: Record<string, string> = {
  // tauri.conf.json
  main: 'index.html',
  // hotkey.rs
  'work-item-palette': 'work-item-palette.html',
  'worktree-palette': 'worktree.html',
  'note-capture': 'note-capture.html',
  sql: 'sql.html',
  // window.rs
  'pr-detail': 'pr-detail.html',
  flyout: 'flyout.html',
  'workitem-detail': 'workitem-detail.html',
  'whats-new': 'whats-new.html',
  // settings/window.rs
  settings: 'settings.html',
};

// ── Helpers ──────────────────────────────────────────────────────────

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Build integrity — HTML entry points', () => {
  for (const entry of ENTRY_POINTS) {
    describe(entry.html, () => {
      it('exists on disk', () => {
        expect(fileExists(entry.html)).toBe(true);
      });

      it('contains a <div id="root"> mount point', () => {
        const html = readFile(entry.html);
        expect(html).toMatch(/id=["']root["']/);
      });

      it(`references the correct entry module (${entry.script})`, () => {
        const html = readFile(entry.html);
        expect(html).toContain(entry.script);
      });

      it('entry module exists on disk', () => {
        // strip leading slash → relative path
        expect(fileExists(entry.script.replace(/^\//, ''))).toBe(true);
      });

      it('entry module imports React and mounts to #root', () => {
        const src = readFile(entry.script.replace(/^\//, ''));
        expect(src).toMatch(/ReactDOM\.createRoot/);
        expect(src).toMatch(/getElementById\(['"]root['"]\)/);
      });

      it('entry module wraps app in ErrorBoundary', () => {
        const src = readFile(entry.script.replace(/^\//, ''));
        expect(src).toMatch(/ErrorBoundary/);
      });
    });
  }
});

describe('Build integrity — Vite rollup inputs', () => {
  it('vite.config.ts defines all expected entry points', () => {
    const viteConfig = readFile('vite.config.ts');
    for (const entry of ENTRY_POINTS) {
      expect(viteConfig, `Missing rollup input for "${entry.key}" → "${entry.html}"`).toContain(
        entry.html,
      );
    }
  });

  it('every rollup input key has a matching HTML file', () => {
    const viteConfig = readFile('vite.config.ts');
    // Extract input keys from the rollup config
    const inputBlock = viteConfig.match(/input:\s*\{([^}]+)\}/s)?.[1] ?? '';
    const keyMatches = [...inputBlock.matchAll(/['"]?(\w[\w-]*)['"]?\s*:/g)];
    for (const [, key] of keyMatches) {
      const entry = ENTRY_POINTS.find((e) => e.key === key);
      expect(entry, `Rollup key "${key}" has no entry in ENTRY_POINTS`).toBeDefined();
    }
  });
});

// Packages whose module identity matters: a second copy brings its own facets,
// tags and contexts, so an extension or hook from one copy is invisible to the
// other. Two `@codemirror/language`s turned off SQL highlighting in 4.9.x.
const SINGLE_COPY_PACKAGES = /^(@codemirror\/[\w-]+|@lezer\/[\w-]+|react|react-dom|scheduler)$/;

/** `"@codemirror/lang-sql/@codemirror/language"` → `['@codemirror/lang-sql', '@codemirror/language']` */
function lockKeyPath(key: string): string[] {
  const names: string[] = [];
  const parts = key.split('/');
  for (let i = 0; i < parts.length; i++) {
    names.push(parts[i]?.startsWith('@') ? `${parts[i]}/${parts[++i]}` : (parts[i] ?? ''));
  }
  return names;
}

describe('Build integrity — single-copy packages', () => {
  it('bun.lock installs one copy of each', () => {
    const lock = fs.readFileSync(path.join(ROOT, '..', '..', 'bun.lock'), 'utf-8');
    const packagesBlock = lock.slice(lock.indexOf('"packages": {'));
    const nestedCopies = [...packagesBlock.matchAll(/^ {4}"([^"]+)": \[/gm)]
      .map(([, key]) => lockKeyPath(key ?? ''))
      .filter((names) => names.length > 1 && SINGLE_COPY_PACKAGES.test(names.at(-1) ?? ''))
      .map((names) => `${names.at(-1)} nested under ${names.slice(0, -1).join(' > ')}`);
    expect(nestedCopies, 'Run `bun update <package>` so every dependent shares one copy').toEqual(
      [],
    );
  });
});

describe('Build integrity — Rust window URLs', () => {
  it('every Rust window URL maps to a valid entry point HTML file', () => {
    const validHtmlFiles = new Set(ENTRY_POINTS.map((e) => e.html));
    for (const [label, htmlFile] of Object.entries(RUST_WINDOW_URLS)) {
      expect(
        validHtmlFiles.has(htmlFile),
        `Window "${label}" points to "${htmlFile}" which is not a valid entry point`,
      ).toBe(true);
    }
  });

  it('tauri.conf.json main window URL is a valid entry point', () => {
    const conf = JSON.parse(readFile('src-tauri/tauri.conf.json'));
    const mainUrl = conf.app.windows[0].url;
    const validHtmlFiles = new Set(ENTRY_POINTS.map((e) => e.html));
    expect(
      validHtmlFiles.has(mainUrl),
      `tauri.conf.json main window URL "${mainUrl}" is not a valid entry point`,
    ).toBe(true);
  });

  it('hotkey.rs window URLs all reference valid entry points', () => {
    const hotkeyRs = readFile('src-tauri/src/platform/hotkey.rs');
    const urlMatches = [...hotkeyRs.matchAll(/WebviewUrl::App\("([^"]+)"\.into\(\)\)/g)];
    const validHtmlFiles = new Set(ENTRY_POINTS.map((e) => e.html));

    for (const [, url] of urlMatches) {
      if (!url) continue;
      expect(
        validHtmlFiles.has(url),
        `hotkey.rs references "${url}" which is not a valid entry point. ` +
          `Valid: ${[...validHtmlFiles].join(', ')}`,
      ).toBe(true);
    }
  });

  it('window.rs window URLs all reference valid entry points', () => {
    const windowRs = readFile('src-tauri/src/platform/window.rs');
    // Match both WebviewUrl::App("xxx".into()) and format strings like "pr-detail.html?..."
    const urlMatches = [...windowRs.matchAll(/WebviewUrl::App\((?:"([^"?]+)|format!\("([^"?]+))/g)];
    const validHtmlFiles = new Set(ENTRY_POINTS.map((e) => e.html));

    for (const [, directUrl, formatUrl] of urlMatches) {
      const url = directUrl ?? formatUrl;
      if (url) {
        expect(
          validHtmlFiles.has(url),
          `window.rs references "${url}" which is not a valid entry point`,
        ).toBe(true);
      }
    }
  });
});
