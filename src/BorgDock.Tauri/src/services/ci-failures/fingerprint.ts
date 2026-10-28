import { CATALOG_VERSION, catalogEntry, matchCatalog } from './catalog';
import { isGenericText, normalizePath, normalizeText, splitTestParams } from './normalize';
import type { Signal, SignalKind } from './types';

/**
 * Version of the rules below, catalog included. Stored with every signal;
 * raising it re-fingerprints the stored signals (see `refingerprint`).
 */
export const FINGERPRINT_VERSION = 2 * 100 + CATALOG_VERSION;

/**
 * - `high`: equal fingerprints are the same failure and group on their own.
 * - `medium`: grouped only when an infrastructure fingerprint lacks its step.
 * - `low`: says only that something failed; never grouped or suggested.
 */
export type Tier = 'high' | 'medium' | 'low';

/** The parts of a fingerprint that candidate links compare. */
export interface Facets {
  kind: SignalKind;
  parser: string;
  testId: string | null;
  code: string | null;
  path: string | null;
  catalogId: string | null;
  step: string | null;
  workflowPath: string | null;
}

export interface Fingerprint {
  value: string;
  tier: Tier;
  facets: Facets;
  /** A short name for a group this fingerprint starts. */
  title: string;
}

export interface FingerprintContext {
  failedStep: string | null;
  workflowPath: string | null;
  conclusion?: string | null;
  /** For other apps' checks: the app and check that reported the output. */
  appSlug?: string | null;
  checkName?: string | null;
}

/** cyrb53: a fast, stable 53-bit string hash, written as 14 hex digits. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** The longest group title; the signal text it comes from is already cut at 240 characters. */
const TITLE_MAX = 240;
/** Groups made before titles kept their length were cut at this many characters. */
const LEGACY_TITLE_MAX = 90;

function clipTitle(text: string, max = TITLE_MAX): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

/** A title cut by the old 90-character limit, which the group's signals can restore. */
export function hasLegacyClip(title: string): boolean {
  return title.length === LEGACY_TITLE_MAX && title.endsWith('…');
}

/** `full` is what the old limit cut down to `clipped`. */
export function restoresClip(clipped: string, full: string): boolean {
  return full !== clipped && full.startsWith(clipped.slice(0, -1));
}

/** The message, error class and expected/actual values: what makes two failures of one test the same. */
function messageKey(signal: Signal): string {
  return hashText(
    [
      normalizeText(signal.message),
      signal.errorClass ?? '',
      normalizeText(signal.expected ?? ''),
      normalizeText(signal.actual ?? ''),
    ].join('\u0000'),
  );
}

/**
 * The fingerprint of one failure signal, or null for test-run totals.
 * Equal values mean "the same failure"; the tier says how far to trust that.
 */
export function fingerprintOf(signal: Signal, context: FingerprintContext): Fingerprint | null {
  if (signal.kind === 'summary') return null;
  const text = [signal.message, ...signal.excerpt].join('\n');
  const catalog =
    matchCatalog(text) ??
    (context.conclusion === 'startup_failure' ? (catalogEntry('not-acquired') ?? null) : null);
  const step = context.failedStep ? normalizeText(context.failedStep) : null;
  const path = signal.path ? normalizePath(signal.path) : null;
  const testId = signal.testId ? splitTestParams(normalizePath(signal.testId)).testId : null;
  const facets: Facets = {
    kind: signal.kind,
    parser: signal.parser,
    testId,
    code: signal.code,
    path,
    catalogId: catalog?.id ?? null,
    step,
    workflowPath: context.workflowPath,
  };
  const make = (value: string, tier: Tier, title: string): Fingerprint => ({
    value,
    tier,
    facets,
    title: clipTitle(title),
  });

  if (signal.kind === 'test' && testId) {
    return make(
      `test:${signal.parser}:${testId}|${signal.errorClass ?? ''}|${messageKey(signal)}`,
      'high',
      testId,
    );
  }
  if (signal.kind === 'compile' && signal.code) {
    return make(
      `compile:${signal.code}:${path ?? ''}|${hashText(normalizeText(signal.message))}`,
      'high',
      `${signal.code}${path ? ` in ${path}` : ''}`,
    );
  }
  if (signal.kind === 'lint') {
    const rule = signal.code ?? hashText(normalizeText(signal.message));
    return make(
      `lint:${rule}:${path ?? ''}`,
      'high',
      `${signal.code ?? 'Lint'}${path ? ` in ${path}` : ''}`,
    );
  }
  if (catalog) {
    const label = catalog.label.charAt(0).toUpperCase() + catalog.label.slice(1);
    return make(
      `infra:${catalog.id}:${step ?? ''}:${context.workflowPath ?? ''}`,
      step ? 'high' : 'medium',
      step ? `${label} (${step})` : label,
    );
  }
  if (isGenericText(signal.message)) {
    return make(`generic:${step ?? ''}|${messageKey(signal)}`, 'low', signal.message);
  }
  switch (signal.kind) {
    case 'tooling':
      return make(
        `tooling:${signal.parser}:${signal.code ?? ''}|${messageKey(signal)}`,
        'high',
        signal.code ? `${signal.code}: ${signal.message}` : signal.message,
      );
    case 'check-output':
      return make(
        `check-output:${context.appSlug ?? ''}:${context.checkName ?? ''}|${messageKey(signal)}`,
        'high',
        signal.message,
      );
    case 'annotation':
      return make(`annotation:${path ?? ''}|${messageKey(signal)}`, 'high', signal.message);
    default:
      // The generic fallback guesses from words alone: equal text shares a group
      // that says "possibly the same", never a confident one.
      return make(`text:${step ?? ''}|${messageKey(signal)}`, 'medium', signal.message);
  }
}

/**
 * Why two fingerprints that differ may still share a cause, or null when
 * nothing ties them. These links are suggestions; they never merge groups.
 */
export function candidateReasons(a: Facets, b: Facets): string[] | null {
  if (a.kind === 'test' && b.kind === 'test' && a.testId && a.testId === b.testId) {
    return ['Same test, different message'];
  }
  if (
    a.kind === 'compile' &&
    b.kind === 'compile' &&
    a.code &&
    a.code === b.code &&
    a.path === b.path
  ) {
    return ['Same error code and file, different message'];
  }
  if (a.catalogId && a.catalogId === b.catalogId) {
    const where = [a.step !== b.step && 'step', a.workflowPath !== b.workflowPath && 'workflow']
      .filter(Boolean)
      .join(' and ');
    return [
      where ? `Same infrastructure error in a different ${where}` : 'Same infrastructure error',
    ];
  }
  return null;
}
