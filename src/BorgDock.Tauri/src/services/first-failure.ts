import { isActionsJob } from '@/services/github/check-runs';
import { getJobLog } from '@/services/github/checks';
import { getClientForRepo } from '@/services/github/singleton';
import { parseLogForErrors } from '@/services/log-parser';
import { createLogger } from '@/services/logger';
import type { CheckRun, ParsedError } from '@/types';

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
/** Parsed errors the excerpt draws from. */
const MAX_ERRORS = 3;

function linesOf(error: ParsedError): string[] {
  const location = error.filePath
    ? `${error.filePath}${error.lineNumber ? `:${error.lineNumber}` : ''}`
    : '';
  const head = [location, error.errorCode].filter(Boolean).join(' ');
  const message = error.message
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '');
  return head ? [head, ...message] : message;
}

/**
 * The excerpt for a job log: the first errors the log parser finds (its
 * summary line left out), a dozen lines at most. Empty when the parser finds
 * nothing.
 */
export function excerptFromLog(logText: string): string[] {
  const errors = parseLogForErrors(logText).filter((e) => e.category !== 'PlaywrightSummary');
  return errors
    .slice(0, MAX_ERRORS)
    .flatMap(linesOf)
    .slice(0, MAX_LINES)
    .map((line) =>
      line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH - 1)}…` : line,
    );
}

const cache = new Map<string, Promise<FirstFailure | null>>();

/**
 * The first failure's log excerpt for a PR's failed check runs: the first
 * failed GitHub Actions job's log, fetched once per job and parsed with the
 * existing log parser. Resolves null when there is no such job, no client,
 * the fetch fails or the parser finds nothing.
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
  const pending = getJobLog(client, owner, repo, run.id)
    .then((text) => {
      const lines = excerptFromLog(text);
      return lines.length > 0 ? { checkName: run.name, lines } : null;
    })
    .catch((err) => {
      log.debug('job log fetch failed', { error: String(err), owner, repo, job: run.id });
      // A failed fetch may succeed later (rate limit, network).
      cache.delete(key);
      return null;
    });
  cache.set(key, pending);
  return pending;
}
