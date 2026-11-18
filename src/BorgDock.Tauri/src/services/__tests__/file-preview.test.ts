import { describe, expect, it, vi } from 'vitest';
import type { GitHubClient } from '@/services/github/client';
import {
  loadPreviewFiles,
  PREVIEW_MESSAGE,
  readPreviewReport,
  relativeAssets,
  utf8ToBase64,
  withPreviewBridge,
} from '../file-preview';

function decode(base64: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
}

describe('withPreviewBridge', () => {
  it('puts the bridge first in the head, after the doctype', () => {
    const html = '<!doctype html><html><head><title>Plan</title></head><body></body></html>';
    const page = withPreviewBridge(html);
    expect(page.startsWith('<!doctype html><html><head><script>')).toBe(true);
    expect(page.endsWith('</script><title>Plan</title></head><body></body></html>')).toBe(true);
  });

  it('keeps the doctype first on a page without a head', () => {
    expect(withPreviewBridge('<!DOCTYPE html>\n<p>Hi</p>')).toMatch(
      /^<!DOCTYPE html><script>.*<\/script>\n<p>Hi<\/p>$/s,
    );
    expect(withPreviewBridge('<html lang="en"><body>Hi</body></html>')).toMatch(
      /^<html lang="en"><script>/,
    );
  });

  it('starts a bare fragment with the bridge', () => {
    expect(withPreviewBridge('<p>Hi</p>')).toMatch(/^<script>.*<\/script><p>Hi<\/p>$/s);
  });

  it('does not take <header> for the head', () => {
    expect(withPreviewBridge('<header>Top</header>')).toMatch(/^<script>/);
  });
});

describe('readPreviewReport', () => {
  it('reads sizes and scroll positions', () => {
    expect(
      readPreviewReport({ [PREVIEW_MESSAGE]: { kind: 'size', width: 1280, viewport: 900 } }),
    ).toEqual({ kind: 'size', width: 1280, viewport: 900 });
    expect(readPreviewReport({ [PREVIEW_MESSAGE]: { kind: 'scroll', y: 240 } })).toEqual({
      kind: 'scroll',
      y: 240,
    });
  });

  it('drops whatever else a page posts', () => {
    expect(readPreviewReport(null)).toBeNull();
    expect(readPreviewReport('scroll')).toBeNull();
    expect(readPreviewReport({ kind: 'scroll', y: 1 })).toBeNull();
    expect(readPreviewReport({ [PREVIEW_MESSAGE]: { kind: 'approve' } })).toBeNull();
    expect(readPreviewReport({ [PREVIEW_MESSAGE]: { kind: 'scroll', y: '9' } })).toBeNull();
    expect(readPreviewReport({ [PREVIEW_MESSAGE]: { kind: 'scroll', y: -5 } })).toBeNull();
    expect(
      readPreviewReport({
        [PREVIEW_MESSAGE]: { kind: 'size', width: Number.POSITIVE_INFINITY, viewport: 1 },
      }),
    ).toBeNull();
  });
});

describe('relativeAssets', () => {
  it('lists the repository files a page loads, once each', () => {
    const html = `
      <link rel="stylesheet" href="plan.css">
      <link rel="stylesheet" href="https://fonts.example.com/inter.css">
      <script src="./chart.js"></script>
      <script src="https://cdn.example.com/lib.js"></script>
      <img src="img/before.png"><img src="img/before.png">
      <img src="data:image/png;base64,AAAA">
      <video src="../media/demo.mp4" poster="img/poster.png"></video>
      <a href="other.html">Another page</a>`;
    expect(relativeAssets(html, 'docs/plans/plan.html')).toEqual([
      'docs/plans/img/before.png',
      'docs/plans/chart.js',
      'docs/plans/plan.css',
      'docs/media/demo.mp4',
      'docs/plans/img/poster.png',
    ]);
  });

  it('does not list the page itself', () => {
    expect(relativeAssets('<img src="plan.html">', 'docs/plan.html')).toEqual([]);
  });
});

describe('utf8ToBase64', () => {
  it('round-trips text beyond Latin-1 and longer than one chunk', () => {
    const text = `€ ü 😀 ${'x'.repeat(70_000)}`;
    expect(decode(utf8ToBase64(text))).toBe(text);
  });
});

describe('loadPreviewFiles', () => {
  const file = (text: string) => ({
    type: 'file',
    size: text.length,
    encoding: 'base64',
    content: utf8ToBase64(text),
  });

  it('reads the page with its bridge and the repository files it links', async () => {
    const get = vi.fn(async (url: string) => {
      if (url.includes('/contents/docs/plan.html'))
        return file('<html><head><link rel="stylesheet" href="plan.css"></head></html>');
      if (url.includes('/contents/docs/plan.css')) return file('body{}');
      throw new Error(`unexpected ${url}`);
    });
    const files = await loadPreviewFiles(
      { get } as unknown as GitHubClient,
      'acme',
      'shop',
      'docs/plan.html',
      'abc123',
    );
    expect(files?.map((f) => f.path)).toEqual(['docs/plan.html', 'docs/plan.css']);
    expect(decode(files![0]!.base64)).toMatch(/^<html><head><script>/);
    expect(decode(files![1]!.base64)).toBe('body{}');
    expect(get.mock.calls[0]![0]).toContain('?ref=abc123');
  });

  it('shows the page without an asset that cannot be read', async () => {
    const get = vi.fn(async (url: string) => {
      if (url.includes('/contents/plan.html')) return file('<img src="missing.png">');
      throw new Error('boom');
    });
    const files = await loadPreviewFiles(
      { get } as unknown as GitHubClient,
      'acme',
      'shop',
      'plan.html',
      'abc123',
    );
    expect(files?.map((f) => f.path)).toEqual(['plan.html']);
  });

  it('has no preview for a page that is too large', async () => {
    const get = vi.fn(async () => ({ ...file('x'), size: 2 * 1024 * 1024 }));
    expect(
      await loadPreviewFiles({ get } as unknown as GitHubClient, 'acme', 'shop', 'p.html', 'abc'),
    ).toBeNull();
  });
});
