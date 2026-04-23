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
  { key: 'palette', html: 'palette.html', script: '/src/palette-main.tsx' },
  { key: 'pr-detail', html: 'pr-detail.html', script: '/src/pr-detail-main.tsx' },
  { key: 'sql', html: 'sql.html', script: '/src/sql-main.tsx' },
  { key: 'worktree', html: 'worktree.html', script: '/src/worktree-main.tsx' },
  { key: 'workitem-detail', html: 'workitem-detail.html', script: '/src/workitem-detail-main.tsx' },
  { key: 'whats-new', html: 'whats-new.html', script: '/src/whats-new-main.tsx' },
  { key: 'filepalette', html: 'file-palette.html', script: '/src/file-palette-main.tsx' },
  { key: 'fileviewer', html: 'file-viewer.html', script: '/src/file-viewer-main.tsx' },
];

// Rust-side window URLs → expected HTML file (must be a valid entry point)
const RUST_WINDOW_URLS: Record<string, string> = {
  // tauri.conf.json
  main: 'index.html',
  // hotkey.rs
  palette: 'palette.html',
  'worktree-palette': 'worktree.html',
  'file-palette': 'file-palette.html',
  sql: 'sql.html',
  // window.rs
  'pr-detail': 'pr-detail.html',
  flyout: 'flyout.html',
  'workitem-detail': 'workitem-detail.html',
  'whats-new': 'whats-new.html',
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
