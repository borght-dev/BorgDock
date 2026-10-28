/**
 * Quick capture: a line appended to today's note under `## Captured`, with a
 * reference to the pull request or work item open in the most recently
 * focused detail window.
 */
import { appendUnderHeading } from './text-edits';

const CONTEXT_KEY = 'borgdock.notes.captureContext';
/** A detail window focused longer ago than this no longer counts as open. */
const CONTEXT_FRESH_MS = 2 * 60 * 60 * 1000;

/** What a capture can refer to: a pull request or a work item. */
export type CaptureTarget =
  | { kind: 'pr'; owner: string; repo: string; number: number; title: string }
  | { kind: 'item'; id: number; title: string };

export type CaptureContext = CaptureTarget & { at: number };

/** Detail windows call this when they open or get focus. Shared through localStorage. */
export function rememberCaptureContext(context: CaptureTarget) {
  try {
    window.localStorage.setItem(CONTEXT_KEY, JSON.stringify({ ...context, at: Date.now() }));
  } catch {
    // The capture works without a context.
  }
}

export function captureContext(now = Date.now()): CaptureContext | null {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(CONTEXT_KEY) ?? 'null',
    ) as CaptureContext | null;
    return stored && now - stored.at < CONTEXT_FRESH_MS ? stored : null;
  } catch {
    return null;
  }
}

export function contextRef(context: CaptureContext): string {
  return context.kind === 'pr'
    ? `${context.owner}/${context.repo}#${context.number}`
    : `AB#${context.id}`;
}

/** The capture as note lines: the first line timed and referenced, the rest indented under it. */
export function captureLines(text: string, at: Date, context: CaptureContext | null): string[] {
  const [first = '', ...rest] = text.trim().split(/\r?\n/);
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const ref = context ? ` · ${contextRef(context)}` : '';
  return [`- ${time} ${first.trim()}${ref}`, ...rest.map((line) => `  ${line}`)];
}

/** Today's note with the capture appended. */
export function withCapture(note: string, lines: string[]): string {
  return appendUnderHeading(note, 'Captured', lines);
}
