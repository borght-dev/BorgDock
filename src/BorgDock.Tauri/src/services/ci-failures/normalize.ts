/**
 * Normalization for fingerprints: removes what differs between runs of the
 * same failure (runner paths, temp names, durations, ids, ephemeral ports)
 * and keeps what tells failures apart (expected and actual values, error
 * codes, well-known ports). Pure; runs over stored sanitized signals, so a
 * new rule can be applied without any log.
 */

const RUNNER_ROOTS = [
  // GitHub-hosted Linux and macOS: /home/runner/work/<repo>/<repo>/
  /(?:\/home\/runner|\/Users\/runner)\/work\/([^/\s]+)\/\1\//g,
  // GitHub-hosted Windows: D:\a\<repo>\<repo>\
  /\b[A-Za-z]:[\\/]a[\\/]([^\\/\s]+)[\\/]\1[\\/]/g,
  // Self-hosted runners: …/_work/<repo>/<repo>/
  /(?:[A-Za-z]:)?[^\s"'(]*[\\/]_work[\\/]([^\\/\s]+)[\\/]\1[\\/]/g,
];

const TEMP_PATHS = [
  /(?:\/home\/runner\/work|\/Users\/runner\/work)\/_temp\/[^\s/'"]+/g,
  /\b[A-Za-z]:[\\/]a[\\/]_temp[\\/][^\s\\/'"]+/g,
  /\b[A-Za-z]:\\Users\\[^\\\s]+\\AppData\\Local\\Temp\\[^\s\\'"]+/gi,
  /\b[A-Za-z]:\\Users\\RUNNER~\d\\AppData\\Local\\Temp\\[^\s\\'"]+/gi,
  /\/(?:private\/)?(?:tmp|var\/folders\/[^\s/]+\/[^\s/]+\/T)\/[^\s/'"]+/g,
];

const DURATION =
  /\b\d+(?:\.\d+)?\s?(?:ms|msec|milliseconds?|s|sec|secs|seconds?|m|min|mins|minutes?)\b/gi;
const ISO_TIME =
  /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/g;
const CLOCK = /\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\b/g;
const GUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ADDRESS = /\b0x[0-9a-f]{6,}\b/gi;
/**
 * Generated ids and SHAs: 8 or more hex characters with a digit among them
 * (short commit SHAs are 7). All-digit runs count too: a hex id can happen
 * to have no letters, and timestamps differ every run.
 */
const GENERATED_ID = /\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi;
const PID = /\b(pid|process id)[\s=:#]*\d+/gi;
const HOST_PORT = /(\b(?:\d{1,3}\.){3}\d{1,3}|\blocalhost|\[::1\]|\[::\]):(\d{2,5})\b/gi;
const EPHEMERAL_PORT_START = 32768;

/** A path relative to the repository root, forward slashes, no runner prefix. */
export function normalizePath(path: string): string {
  let result = path.trim();
  for (const root of RUNNER_ROOTS) result = result.replace(root, '');
  return result.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** `text` with run-specific details replaced by placeholders, whitespace collapsed. */
export function normalizeText(text: string): string {
  let result = text;
  for (const temp of TEMP_PATHS) result = result.replace(temp, '<tmp>');
  for (const root of RUNNER_ROOTS) result = result.replace(root, '');
  return result
    .replace(ISO_TIME, '<time>')
    .replace(CLOCK, '<time>')
    .replace(GUID, '<guid>')
    .replace(ADDRESS, '<addr>')
    .replace(GENERATED_ID, '<id>')
    .replace(PID, '$1 <n>')
    .replace(HOST_PORT, (match, host: string, port: string) =>
      Number(port) >= EPHEMERAL_PORT_START ? `${host}:<port>` : match,
    )
    .replace(DURATION, '<dur>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A stack frame without its line and column, so moving code doesn't split a group. */
export function normalizeFrame(frame: string): string {
  return normalizeText(frame)
    .replace(/:\d+(?::\d+)?(\)?)$/, '$1')
    .replace(/:line \d+$/, '');
}

const PARAMS = /^(.*?)\s*(?:\((.*)\)|\[(.*)\])\s*$/;

/** A test name split into its identity and its parameters (`Pays(card: "visa")`). */
export function splitTestParams(name: string): { testId: string; params: string | null } {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const match = PARAMS.exec(trimmed);
  if (!match?.[1]) return { testId: trimmed, params: null };
  return { testId: match[1], params: (match[2] ?? match[3] ?? '').trim() || null };
}

/** Words that alone say only that something failed. */
const GENERIC_WORDS = new Set([
  'a',
  'an',
  'the',
  'with',
  'of',
  'to',
  'in',
  'is',
  'was',
  'has',
  'and',
  'or',
  'not',
  'error',
  'errors',
  'err',
  'fatal',
  'failed',
  'failure',
  'fail',
  'failing',
  'exception',
  'process',
  'completed',
  'exit',
  'exited',
  'code',
  'status',
  'command',
  'returned',
  'non',
  'zero',
  'timeout',
  'timed',
  'out',
  'exceeded',
  'connect',
  'connection',
  'refused',
  'econnrefused',
  'npm',
  'run',
  'step',
  'job',
  'test',
  'tests',
  'unknown',
  'unexpected',
  'something',
  'went',
  'wrong',
  'after',
  'while',
  'running',
  'see',
  'above',
  'log',
  'logs',
  'details',
  'for',
  'more',
  'information',
  'build',
]);

/** True when `text` says only that something failed, with nothing to tell one failure from another. */
export function isGenericText(text: string): boolean {
  const words = normalizeText(text)
    .toLowerCase()
    .replace(/<[a-z]+>/g, ' ')
    .split(/[^a-z0-9_.@/-]+/)
    .filter((word) => word.length > 0 && !/^\d+$/.test(word));
  return words.filter((word) => !GENERIC_WORDS.has(word)).length < 2;
}
