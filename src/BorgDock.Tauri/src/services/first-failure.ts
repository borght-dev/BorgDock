import type { Signal } from '@/services/ci-failures/types';
import { isActionsJob } from '@/services/github/check-runs';
import { readJobEvidence } from '@/services/github/checks';
import { getClientForRepo } from '@/services/github/singleton';
import { createLogger } from '@/services/logger';
import type { CheckRun } from '@/types';

const log = createLogger('first-failure');

/** A short excerpt of the first failing check's log, for the Checks tab. */
export interface FirstFailure {
  /** The failing check the excerpt is from. */
  checkName: string;
  /** The excerpt, one entry per line; the first names the file or error. */
  lines: string[];
}

/** Lines of the excerpt at most, and characters per line. */
const MAX_LINES = 12;
const MAX_LINE_LENGTH = 240;
/** Signals the excerpt draws from. */
const MAX_SIGNALS = 3;

function linesOf(signal: Signal): string[] {
  const location = signal.path ? `${signal.path}${signal.line ? `:${signal.line}` : ''}` : '';
  const head = [location || signal.testId, signal.code].filter(Boolean).join(' ');
  const message = signal.message
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '');
  return head ? [head, ...message] : message;
}

/**
 * The excerpt for a job's signals: the first failures the log reader found
 * (its test-run totals left out), a dozen lines at most. Empty when it found
 * nothing.
 */
export function excerptFromSignals(signals: readonly Signal[]): string[] {
  return signals
    .filter((s) => s.kind !== 'summary')
    .slice(0, MAX_SIGNALS)
    .flatMap(linesOf)
    .slice(0, MAX_LINES)
    .map((line) =>
      line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH - 1)}…` : line,
    );
}

const cache = new Map<string, Promise<FirstFailure | null>>();

/**
 * The first failure's log excerpt for a PR's failed check runs: the first
 * failed GitHub Actions job's log, read once per job. Resolves null when
 * there is no such job, no client, the read fails or nothing was found.
 */
export function loadFirstFailure(
  owner: string,
  repo: string,
  failed: CheckRun[],
): Promise<FirstFailure | null> {
  const run = failed.find(isActionsJob);
  if (!run) return Promise.resolve(null);
  const key = `${owner}/${repo}:${run.id}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const client = getClientForRepo(owner, repo);
  if (!client) return Promise.resolve(null);
  const pending = readJobEvidence(client, owner, repo, run.id)
    .then((evidence) => {
      if (evidence.state === 'failed') {
        // A failed read may succeed later (rate limit, network).
        cache.delete(key);
        log.debug('job log read failed', { reason: evidence.reason, owner, repo, job: run.id });
        return null;
      }
      const lines = excerptFromSignals(evidence.signals);
      return lines.length > 0 ? { checkName: run.name, lines } : null;
    })
    .catch((err) => {
      log.debug('job log read failed', { error: String(err), owner, repo, job: run.id });
      cache.delete(key);
      return null;
    });
  cache.set(key, pending);
  return pending;
}
