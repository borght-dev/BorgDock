import { commands } from '@/generated/commands';
import type { GitHubClient } from '@/services/github/client';
import { getFileBase64AtRef, getTextFileAtRef } from '@/services/github/contents';
import { resolveRepoPath } from '@/services/rendered-file';

/** The key of every message between a preview frame and BorgDock. */
export const PREVIEW_MESSAGE = 'borgdockPreview';
/** Larger pages are shown as a diff only. */
export const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_ASSETS = 40;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_ASSETS_TOTAL = 8 * 1024 * 1024;

/** What the page tells BorgDock: how large it is, and where it scrolled to. */
export type PreviewReport =
  | { kind: 'size'; width: number; viewport: number }
  | { kind: 'scroll'; y: number };

/** What BorgDock tells the page. */
export type PreviewOrder =
  | { kind: 'scrollBy'; x: number; y: number }
  | { kind: 'scrollTo'; y: number };

/**
 * Runs inside the previewed page, which is someone else's code: it only
 * reports sizes and scroll positions and takes scroll orders. BorgDock treats
 * whatever comes back as numbers to clamp, never as an instruction.
 */
const BRIDGE = `<script>(()=>{const K=${JSON.stringify(PREVIEW_MESSAGE)};const say=(m)=>{try{parent.postMessage({[K]:m},"*")}catch{}};const size=()=>say({kind:"size",width:document.documentElement.scrollWidth,viewport:innerWidth});addEventListener("load",size);addEventListener("DOMContentLoaded",()=>{size();try{new ResizeObserver(size).observe(document.documentElement)}catch{}});addEventListener("scroll",()=>say({kind:"scroll",y:scrollY}),{passive:true});addEventListener("message",(e)=>{if(e.source!==parent)return;const m=e.data&&e.data[K];if(!m)return;if(m.kind==="scrollBy")scrollBy(m.x||0,m.y||0);if(m.kind==="scrollTo")scrollTo(scrollX,m.y||0)})})()</script>`;

/** `html` with the bridge as its first script, after the doctype so the page keeps its rendering mode. */
export function withPreviewBridge(html: string): string {
  const anchor =
    /<head(?:\s[^>]*)?>/i.exec(html) ??
    /<html(?:\s[^>]*)?>/i.exec(html) ??
    /<!doctype[^>]*>/i.exec(html);
  const at = anchor ? anchor.index + anchor[0].length : 0;
  return `${html.slice(0, at)}${BRIDGE}${html.slice(at)}`;
}

/** A report from a preview frame, or null for anything else a page may post. */
export function readPreviewReport(data: unknown): PreviewReport | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = (data as Record<string, unknown>)[PREVIEW_MESSAGE];
  if (typeof message !== 'object' || message === null) return null;
  const report = message as Record<string, unknown>;
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  if (report.kind === 'size') {
    const width = number(report.width);
    const viewport = number(report.viewport);
    return width === null || viewport === null ? null : { kind: 'size', width, viewport };
  }
  if (report.kind === 'scroll') {
    const y = number(report.y);
    return y === null ? null : { kind: 'scroll', y };
  }
  return null;
}

const ASSET_REFERENCES: ReadonlyArray<readonly [selector: string, attribute: string]> = [
  ['img[src]', 'src'],
  ['script[src]', 'src'],
  ['link[rel~="stylesheet"][href]', 'href'],
  ['link[rel~="icon"][href]', 'href'],
  ['source[src]', 'src'],
  ['video[src]', 'src'],
  ['video[poster]', 'poster'],
  ['audio[src]', 'src'],
];

/** The repository files the page at `path` loads by a relative address, in document order. */
export function relativeAssets(html: string, path: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const found: string[] = [];
  for (const [selector, attribute] of ASSET_REFERENCES) {
    for (const element of doc.querySelectorAll(selector)) {
      const asset = resolveRepoPath(path, element.getAttribute(attribute) ?? '');
      if (asset && asset !== path && !found.includes(asset)) found.push(asset);
    }
  }
  return found.slice(0, MAX_ASSETS);
}

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export interface PreviewFile {
  path: string;
  base64: string;
}

/** The page with its bridge, and the repository files it loads, all as they are at `ref`. */
export async function loadPreviewFiles(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<PreviewFile[] | null> {
  const html = await getTextFileAtRef(client, owner, repo, path, ref, MAX_PAGE_BYTES);
  if (html === null) return null;
  const files: PreviewFile[] = [{ path, base64: utf8ToBase64(withPreviewBridge(html)) }];
  const assets = await Promise.all(
    relativeAssets(html, path).map(async (asset) => {
      // A missing or unreadable asset leaves a hole in the page, not a failed preview.
      const base64 = await getFileBase64AtRef(
        client,
        owner,
        repo,
        asset,
        ref,
        MAX_ASSET_BYTES,
      ).catch(() => null);
      return base64 === null ? null : { path: asset, base64 };
    }),
  );
  let total = 0;
  for (const asset of assets) {
    if (!asset) continue;
    total += asset.base64.length * 0.75;
    if (total > MAX_ASSETS_TOTAL) break;
    files.push(asset);
  }
  return files;
}

function insideTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Puts a page on offer and returns the address a sandboxed frame loads it
 * from. In the app that is BorgDock's loopback preview server
 * (`src-tauri/src/file_preview.rs`); in Storybook and tests, where there is
 * no app CSP to keep the page's scripts from running, a blob.
 */
export async function publishPreview(path: string, files: PreviewFile[]): Promise<string> {
  if (!insideTauri()) {
    const page = files.find((file) => file.path === path);
    const bytes = Uint8Array.from(atob(page?.base64 ?? ''), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: 'text/html' }));
  }
  const result = await commands.filePreviewPublish(path, files);
  if (result.status === 'error') throw new Error(result.error);
  return result.data;
}

export function releasePreview(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
    return;
  }
  if (insideTauri()) void commands.filePreviewRelease(url).catch(() => undefined);
}
