// Failure signals from a GitHub Actions job log. Ported from the desktop's src-tauri/src/ci_failures/extract/:
// the same parsers, matches and order, so a log reads the same on the phone as in BorgDock.

export type SignalKind = 'test' | 'compile' | 'lint' | 'annotation' | 'check-output' | 'tooling' | 'generic' | 'summary';

/** One failure found in a job's log, sanitized but not normalized (fingerprinting normalizes). */
export type Signal = {
  kind: SignalKind;
  /** msbuild, dotnet-test, typescript, eslint, playwright, vitest, cargo-test, rustc, npm, docker, actions-annotation, generic. */
  parser: string;
  testId: string | null;
  params: string | null;
  path: string | null;
  line: number | null;
  column: number | null;
  code: string | null;
  errorClass: string | null;
  expected: string | null;
  actual: string | null;
  /** The first line that says what went wrong. */
  message: string;
  excerpt: string[];
  frames: string[];
  /** How often the same failure repeated in this job (retries). */
  repeats: number;
};

export type Extraction = { signals: Signal[]; stepFound: boolean };

export const MAX_SIGNALS = 20;
export const MAX_EXCERPT_LINES = 30;
export const MAX_LINE_CHARS = 240;
export const MAX_FRAMES = 5;

export function signal(kind: SignalKind, parser: string, message: string, fields: Partial<Signal> = {}): Signal {
  return {
    kind, parser, message, testId: null, params: null, path: null, line: null, column: null, code: null, errorClass: null,
    expected: null, actual: null, excerpt: [], frames: [], repeats: 1, ...fields,
  };
}

export function clip(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

const num = (digits: string | undefined) => (digits === undefined ? null : Number.isFinite(Number(digits)) ? Number(digits) : null);
const withoutAnnotation = (text: string) => (text.startsWith('##[error]') ? text.slice(9) : text).trim();

/** The non-blank lines with their common indentation removed, so code frames and diffs keep their shape. */
function excerpt(lines: readonly string[]): string[] {
  const indent = (line: string) => line.length - line.replace(/^[ \t]+/, '').length;
  const kept = lines.filter((line) => line.trim() !== '');
  const common = kept.length ? Math.min(...kept.map(indent)) : 0;
  return kept.map((line) => line.slice(Math.min(common, indent(line))).trimEnd());
}

const EXPECTED_RECEIVED = /^(Expected|Received)(?: [a-z]+)?:\s+(.+)$/;

function expectedReceived(lines: readonly string[]): [string | null, string | null] {
  let expected: string | null = null;
  let received: string | null = null;
  for (const line of lines) {
    const m = EXPECTED_RECEIVED.exec(line.trim());
    if (!m) continue;
    if (m[1] === 'Expected') expected ??= m[2].trim();
    else received ??= m[2].trim();
  }
  return [expected, received];
}

/* ---------- msbuild ---------- */

const MSBUILD_LOCATED = /^(.+?)\((\d+),(\d+)\):\s*error\s+([A-Z]+\d+):\s*(.+)$/;
const MSBUILD_UNLOCATED = /^(\S.*?)\s+:\s+error\s+([A-Z]+\d+):\s*(.+)$/;
const PROJECT_SUFFIX = /\s+\[[^\]]*\.(?:[a-z]*proj|slnx?)(?:::[^\]]*)?\]$/;
const isTypescriptCode = (code: string) => code.startsWith('TS') && code.length >= 5;

function msbuild(lines: readonly string[]): Signal[] {
  const signals: Signal[] = [];
  const seen = new Map<string, number>();
  for (const line of lines) {
    if (!line.includes('error')) continue;
    let found: Signal | null = null;
    const located = MSBUILD_LOCATED.exec(line);
    if (located && !isTypescriptCode(located[4])) {
      found = signal('compile', 'msbuild', located[5].trim().replace(PROJECT_SUFFIX, ''), {
        path: withoutAnnotation(located[1]), line: num(located[2]), column: num(located[3]), code: located[4],
      });
    } else if (!located) {
      const unlocated = MSBUILD_UNLOCATED.exec(line);
      if (unlocated && !isTypescriptCode(unlocated[2])) {
        found = signal('compile', 'msbuild', unlocated[3].trim().replace(PROJECT_SUFFIX, ''), { path: withoutAnnotation(unlocated[1]), code: unlocated[2] });
      }
    }
    if (!found) continue;
    const key = JSON.stringify([found.path, found.line, found.code]);
    const index = seen.get(key);
    if (index !== undefined) signals[index].repeats += 1;
    else {
      seen.set(key, signals.length);
      signals.push(found);
    }
  }
  return signals;
}

/* ---------- dotnet test ---------- */

const DOTNET_FAILED = /^\s*Failed\s+(\S+?(?:\(.*\))?)(?:\s+\[[^\]]*\])?\s*$/;
const DOTNET_OTHER_RESULT = /^\s*(?:Passed|Skipped)\s/;
const DOTNET_FRAME = /^at (.+?)(?: in (.+):line (\d+))?$/;
const DOTNET_EXCEPTION = /^((?:[A-Za-z_]\w*\.)+[A-Za-z_]\w*(?:Exception|Error))\b/;
const DOTNET_ASSERT = /^(Assert\.\w+)(?:\(\))? (?:Failure|failed)\b/;
const NUNIT_ONE_LINE = /^Expected:\s*(.*?)\s+But was:\s*(.*)$/;
const MSTEST_VALUES = /Expected:<(.*?)>\.?\s*Actual:<(.*?)>/;
const SECTION_HEADERS = ['Error Message:', 'Stack Trace:', 'Standard Output Messages:', 'Standard Error Messages:'];
const FRAMEWORK_FRAMES = ['System.', 'Microsoft.', 'Xunit.', 'NUnit.'];

function dotnetTest(lines: readonly string[]): Signal[] {
  const signals: Signal[] = [];
  lines.forEach((line, index) => {
    const name = DOTNET_FAILED.exec(line)?.[1];
    if (!name) return;
    const block: string[] = [];
    for (let i = index + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (block.length === MAX_EXCERPT_LINES || trimmed.startsWith('Failed ') || DOTNET_OTHER_RESULT.test(lines[i])) break;
      if (trimmed === '') {
        if (lines[i + 1]?.trim() === 'Stack Trace:') continue;
        break;
      }
      block.push(trimmed);
    }
    const open = name.indexOf('(');
    const [testId, params] = open > 0 && name.endsWith(')') ? [name.slice(0, open), name.slice(open + 1, -1)] : [name, null];
    const message = block.find((l) => !SECTION_HEADERS.includes(l)) ?? `Test failed: ${name}`;
    let expected: string | null = null;
    let actual: string | null = null;
    for (const l of block) {
      const pair = NUNIT_ONE_LINE.exec(l) ?? MSTEST_VALUES.exec(l);
      if (pair) {
        expected ??= pair[1].trim();
        actual ??= pair[2].trim();
      } else if (l.startsWith('Expected:')) expected ??= l.slice(9).trim();
      else if (l.startsWith('Actual:')) actual ??= l.slice(7).trim();
      else if (l.startsWith('But was:')) actual ??= l.slice(8).trim();
    }
    const frames = block
      .map((l) => DOTNET_FRAME.exec(l))
      .filter((m): m is RegExpExecArray => m !== null && !FRAMEWORK_FRAMES.some((p) => m[1].startsWith(p)))
      .slice(0, MAX_FRAMES);
    const located = frames.find((m) => m[2]);
    const named = block.map((l) => DOTNET_EXCEPTION.exec(l) ?? DOTNET_ASSERT.exec(l)).find(Boolean)?.[1] ?? null;
    const nunit = block.some((l) => l.startsWith('But was:') || NUNIT_ONE_LINE.test(l)) ? 'NUnit.Framework.AssertionException' : null;
    signals.push(signal('test', 'dotnet-test', message, {
      testId, params, path: located?.[2] ?? null, line: num(located?.[3]), errorClass: named ?? nunit, expected, actual,
      excerpt: block.slice(0, 10), frames: frames.map((m) => m[1]),
    }));
  });
  return signals;
}

/* ---------- typescript and eslint ---------- */

const TSC = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/;
const TSC_PRETTY = /^(.+?):(\d+):(\d+)\s+-\s+error\s+(TS\d+):\s*(.+)$/;
const ESLINT_INLINE = /^(.+?):(\d+):(\d+)\s+-\s+error\s+(.+)$/;
const ESLINT_STYLISH = /^\s+(\d+):(\d+)\s+error\s+(.+?)\s*$/;
const STYLISH_FILE = /^\S*[\\/]\S*\.[A-Za-z]+$/;
const RULE_ID = /^(?:@[\w-]+\/)?(?:[\w-]+\/)?[a-z][\w-]*$/;

function typescript(lines: readonly string[]): Signal[] {
  const signals: Signal[] = [];
  for (const line of lines) {
    const m = TSC.exec(line) ?? TSC_PRETTY.exec(line);
    if (m) signals.push(signal('compile', 'typescript', m[5].trim(), { path: withoutAnnotation(m[1]), line: num(m[2]), column: num(m[3]), code: m[4] }));
  }
  let file: string | null = null;
  for (const line of lines) {
    const inline = ESLINT_INLINE.exec(line);
    if (inline) {
      if (!TSC_PRETTY.test(line)) signals.push(lint(inline[1].trim(), inline[2], inline[3], inline[4]));
      continue;
    }
    const stylish = ESLINT_STYLISH.exec(line);
    if (stylish) {
      if (file) signals.push(lint(file, stylish[1], stylish[2], stylish[3]));
    } else if (!line.startsWith(' ') && !line.startsWith('\t')) {
      file = STYLISH_FILE.test(line) ? line : null;
    }
  }
  return signals;
}

function lint(path: string, line: string, column: string, text: string): Signal {
  const message = text.trim();
  return signal('lint', 'eslint', message, { path, line: num(line), column: num(column), code: ruleId(message) });
}

function ruleId(message: string): string | null {
  const gap = message.lastIndexOf('  ');
  let candidate: string;
  if (gap >= 0) candidate = message.slice(gap + 2).trim();
  else {
    const space = message.lastIndexOf(' ');
    if (space < 0) candidate = message;
    else if (message.slice(space + 1).includes('/')) candidate = message.slice(space + 1);
    else return null;
  }
  return RULE_ID.test(candidate) ? candidate : null;
}

/* ---------- playwright ---------- */

const PW_FAILURE = /\d+\)\s*\[(\w+)\]\s*›\s*(.+?):(\d+):\d+\s*›\s*(.+?)\s*$/;
const PW_SUMMARY = /^\s*(\d+)\s+(failed|flaky|skipped|did not run|passed)/;
const PW_ERROR_CLASS = /^(\w*Error):/;
const BROWSERS = ['[chromium]', '[firefox]', '[webkit]'];
const CONTEXT_ENDS = ['Retry #', 'attachment #', 'Error Context:'];

export const isPlaywrightHeader = (text: string) => PW_FAILURE.test(text);

function playwright(lines: readonly string[]): Signal[] {
  if (!lines.some((l) => PW_SUMMARY.test(l)) || !lines.some((l) => BROWSERS.some((b) => l.includes(b)))) return [];
  const signals: Signal[] = [];
  const summary = playwrightSummary(lines);
  if (summary) signals.push(summary);
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const m = PW_FAILURE.exec(line);
    if (!m) return;
    const title = m[4].replace(/[─\s]+$/, '');
    if (seen.has(`[${m[1]}] ${title}`)) return;
    seen.add(`[${m[1]}] ${title}`);
    const block: string[] = [];
    for (const l of lines.slice(index + 1)) {
      if (PW_FAILURE.test(l) || PW_SUMMARY.test(l)) break;
      block.push(l);
    }
    const context: string[] = [];
    for (const l of block) {
      if (CONTEXT_ENDS.some((end) => l.trim().startsWith(end))) break;
      if (l.trim() !== '' && context.length < MAX_EXCERPT_LINES) context.push(l);
    }
    const path = m[2].trim();
    const [expected, actual] = expectedReceived(context);
    signals.push(signal('test', 'playwright', context[0]?.trim() ?? `Test failed: ${title}`, {
      testId: `${path} › ${title}`, params: m[1], path, line: num(m[3]),
      errorClass: context.map((l) => PW_ERROR_CLASS.exec(l.trim())?.[1]).find(Boolean) ?? null,
      expected, actual, excerpt: excerpt(context), repeats: block.filter((l) => l.trim().startsWith('Retry #')).length + 1,
    }));
  });
  return signals;
}

function playwrightSummary(lines: readonly string[]): Signal | null {
  let start: number | null = null;
  let end: number | null = null;
  for (let index = lines.length - 1; index >= 0; index--) {
    const trimmed = lines[index].trim();
    if (trimmed === '') {
      if (start !== null) break;
    } else if (PW_SUMMARY.test(trimmed)) {
      start = index;
      end ??= index;
    } else if (start !== null) {
      if (!(trimmed.includes('] ›') && BROWSERS.some((b) => trimmed.includes(b)))) break;
      start = index;
    }
  }
  if (start === null || end === null) return null;
  const block = lines.slice(start, end + 1);
  return signal('summary', 'playwright', block[0].trim(), { excerpt: excerpt(block) });
}

/* ---------- actions annotations ---------- */

export const EXIT_CODE = 'Process completed with exit code';
const COMPILER_ERROR = /\(\d+,\d+\):\s*error\s+[A-Z]+\d+:/;

function annotations(lines: readonly string[]): Signal[] {
  return lines
    .filter((l) => l.startsWith('##[error]'))
    .map((l) => l.slice(9).trim())
    .filter((m) => m !== '' && !m.startsWith(EXIT_CODE) && !COMPILER_ERROR.test(m) && !isPlaywrightHeader(m))
    .map((m) => signal('annotation', 'actions-annotation', m));
}

/* ---------- vitest ---------- */

const VT_FAIL = /^\s*FAIL\s+(?:\|[^|]+\|\s+|[A-Za-z][\w.-]*\s{2,})?(\S+)(?:\s+>\s+(.+?)|\s+\[[^\]]*\])\s*$/;
const VT_CROSSED = /^\s*[×✗]\s+(.+?)(?:\s+\(retry x\d+\))?(?:\s+\d+(?:\.\d+)?m?s)?\s*$/;
const VT_FILE = /^\s*❯\s+(\S+)\s+\(\d+ tests?\b/;
const VT_ARROW = /^\s*→\s+(.+)$/;
const VT_FRAME = /^\s*❯\s+(.+?)\s*$/;
const VT_LOCATION = /(\S+):(\d+):(\d+)\)?$/;
const VT_ERROR_CLASS = /^(\w*(?:Error|Exception))(?:\s*\[[^\]]*\])?:/;
const VT_BLOCK_LINES = 60;

function vitest(lines: readonly string[]): Signal[] {
  const signals: Signal[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!VT_FAIL.test(lines[index])) {
      index++;
      continue;
    }
    const headers = index;
    while (index < lines.length && VT_FAIL.test(lines[index])) index++;
    let end = Math.min(index + VT_BLOCK_LINES, lines.length);
    for (let i = index; i < Math.min(index + VT_BLOCK_LINES, lines.length); i++) {
      const t = lines[i].trim();
      if (t.startsWith('⎯') || t.startsWith('Test Files ') || VT_FAIL.test(lines[i])) {
        end = i;
        break;
      }
    }
    const block = lines.slice(index, end);
    const first = block.map((l) => l.trim()).find((l) => l !== '') ?? null;
    const frames = block.map((l) => VT_FRAME.exec(l)?.[1]).filter((f): f is string => !!f && !f.includes('node_modules'));
    const location = frames.map((f) => VT_LOCATION.exec(f)).find(Boolean) ?? null;
    const [expected, actual] = vitestDiff(block) ?? expectedReceived(block);
    const errorClass = first ? (VT_ERROR_CLASS.exec(first)?.[1] ?? null) : null;
    for (const header of lines.slice(headers, index)) {
      const m = VT_FAIL.exec(header)!;
      const testId = m[2] ? `${m[1]} > ${m[2]}` : m[1];
      signals.push(signal('test', 'vitest', first ?? `Test failed: ${testId}`, {
        testId, path: location?.[1] ?? m[1], line: num(location?.[2]), column: num(location?.[3]), errorClass, expected, actual,
        excerpt: excerpt(block), frames,
      }));
    }
    index = end;
  }
  const named = new Set(signals.map((s) => s.testId));
  let file: string | null = null;
  lines.forEach((line, i) => {
    const f = VT_FILE.exec(line);
    if (f) {
      file = f[1];
      return;
    }
    const crossed = VT_CROSSED.exec(line);
    if (!file || !crossed) return;
    const testId = `${file} > ${crossed[1]}`;
    if (named.has(testId)) return;
    const reasons: string[] = [];
    for (const next of lines.slice(i + 1)) {
      const r = VT_ARROW.exec(next);
      if (!r) break;
      reasons.push(r[1]);
    }
    signals.push(signal('test', 'vitest', reasons[0] ?? `Test failed: ${testId}`, { testId, path: file, excerpt: reasons }));
  });
  return signals;
}

function vitestDiff(block: readonly string[]): [string | null, string | null] | null {
  const header = block.findIndex((l, i) => l.trim().startsWith('- Expected') && block[i + 1]?.trim().startsWith('+ Received'));
  if (header < 0) return null;
  const body: string[] = [];
  let started = false;
  for (const l of block.slice(header + 2)) {
    if (l.trim() === '') {
      if (started) break;
      continue;
    }
    started = true;
    body.push(l);
  }
  const side = (sign: string) => {
    const values = body
      .map((l) => l.trimStart())
      .filter((l) => l.startsWith(sign))
      .map((l) => l.slice(1).replace(/^ /, '').trimEnd());
    return values.length ? values.join('\n') : null;
  };
  return [side('-'), side('+')];
}

/* ---------- cargo ---------- */

const CARGO_STDOUT = /^---- (.+) stdout ----$/;
const CARGO_PANIC = /^thread '([^']*)'(?: \(\d+\))? panicked at (?:'(.*)', )?(.+?):(\d+):(\d+):?$/;
const CARGO_SIDE = /^\s*(left|right): (.*)$/;
const CARGO_FRAME = /^\s*\d+: (\S+)/;
const RUSTC_ERROR = /^error(?:\[(E\d+)\])?: (.+)$/;
const RUSTC_LOCATION = /^\s*--> (.+?):(\d+):(\d+)$/;
const RUNTIME_FRAMES = ['std::', 'core::', 'alloc::', 'test::', '<', 'rust_', '__rust'];

function cargo(lines: readonly string[]): Signal[] {
  const signals: Signal[] = [];
  let index = 0;
  while (index < lines.length) {
    const header = CARGO_STDOUT.exec(lines[index]);
    const loose = header ? null : CARGO_PANIC.exec(lines[index]);
    if (header) {
      let end = lines.length;
      for (let i = index + 1; i < lines.length; i++) {
        if (CARGO_STDOUT.test(lines[i]) || lines[i].trim() === 'failures:' || lines[i].startsWith('test result:')) {
          end = i;
          break;
        }
      }
      signals.push(cargoTest(header[1], lines.slice(index + 1, end)));
      index = end;
    } else if (loose && loose[1] !== 'main' && loose[1] !== '<unnamed>') {
      let end = index;
      while (end < lines.length && end - index < 20 && lines[end].trim() !== '') end++;
      signals.push(cargoTest(loose[1], lines.slice(index, end)));
      index = end;
    } else index++;
  }
  lines.forEach((line, i) => {
    const error = RUSTC_ERROR.exec(line);
    if (!error) return;
    const location = lines.slice(i + 1, i + 4).map((l) => RUSTC_LOCATION.exec(l)).find(Boolean);
    if (!location) return;
    let length = 0;
    while (i + length < lines.length && length < MAX_EXCERPT_LINES && lines[i + length].trim() !== '') length++;
    signals.push(signal('compile', 'rustc', error[2].trim(), {
      path: location[1], line: num(location[2]), column: num(location[3]), code: error[1] ?? null, excerpt: excerpt(lines.slice(i, i + length)),
    }));
  });
  return signals;
}

function cargoTest(testId: string, block: readonly string[]): Signal {
  const lines = block.filter((l) => l.trim() !== '' && !l.startsWith('note: run with `RUST_BACKTRACE'));
  const panicIndex = lines.findIndex((l) => CARGO_PANIC.test(l));
  const panic = panicIndex >= 0 ? CARGO_PANIC.exec(lines[panicIndex]) : null;
  const message = (panic ? (panic[2] ?? lines[panicIndex + 1]?.trim()) : lines[0]?.trim()) ?? `Test failed: ${testId}`;
  let left: string | null = null;
  let right: string | null = null;
  for (const l of lines) {
    const m = CARGO_SIDE.exec(l);
    if (!m) continue;
    const value = m[2].trim().replace(/,$/, '').replace(/^`+|`+$/g, '');
    if (m[1] === 'left') left ??= value;
    else right ??= value;
  }
  const errorClass = message.includes('left == right') ? 'assert_eq'
    : message.includes('left != right') ? 'assert_ne'
    : message.startsWith('assertion failed') ? 'assert'
    : (/^called `(\w+::\w+)\(\)`/.exec(message)?.[1] ?? null);
  const frames = lines
    .map((l) => CARGO_FRAME.exec(l)?.[1]?.replace(/::h[0-9a-f]{16}$/, ''))
    .filter((s): s is string => !!s && !RUNTIME_FRAMES.some((p) => s.startsWith(p)))
    .slice(0, MAX_FRAMES);
  return signal('test', 'cargo-test', message, {
    testId, path: panic?.[3] ?? null, line: num(panic?.[4]), column: num(panic?.[5]), errorClass, expected: right, actual: left,
    excerpt: excerpt(lines.slice(0, MAX_EXCERPT_LINES)), frames,
  });
}

/* ---------- npm, pnpm, bun ---------- */

const NPM_DETAIL_KEY = /^(?:code|errno|syscall|path|dest|command|cwd|signal|file)\b/;
const PNPM = /^\s*(ERR_PNPM_[A-Z0-9_]+)\s+(.+)$/;
const BUN = /^error: (.+ failed to resolve|lockfile had changes, but lockfile is frozen|No version matching .+|package "[^"]+" not found.*)$/;
const BUN_FETCH = /^error: GET \S+ - (\d{3})$/;

function npmText(line: string): string | null {
  const rest = line.startsWith('npm ERR!') ? line.slice(8) : line.startsWith('npm error') ? line.slice(9) : null;
  return rest !== null && (rest === '' || rest.startsWith(' ')) ? rest.trim() : null;
}

function npm(lines: readonly string[]): Signal[] {
  const signals: Signal[] = [];
  let index = 0;
  while (index < lines.length) {
    const text = npmText(lines[index]);
    if (!text?.startsWith('code ')) {
      index++;
      continue;
    }
    const code = text.slice(5);
    const details: string[] = [];
    for (const l of lines.slice(index + 1)) {
      const t = npmText(l);
      if (t === null || t.startsWith('code ')) break;
      details.push(t);
    }
    const end = index + 1 + details.length;
    if (code !== 'ELIFECYCLE' && !/^\d+$/.test(code)) {
      const message = details.find((t) => t !== '' && !NPM_DETAIL_KEY.test(t)) ?? `npm ${code}`;
      signals.push(signal('tooling', 'npm', message, { code, excerpt: lines.slice(index, end).map((l) => l.trimEnd()) }));
    }
    index = end;
  }
  for (const line of lines) {
    const m = PNPM.exec(line);
    if (m) signals.push(signal('tooling', 'npm', m[2].trim(), { code: m[1], excerpt: [line.trim()] }));
  }
  lines.forEach((line, i) => {
    const m = BUN.exec(line);
    if (!m) return;
    const before = lines.slice(Math.max(0, i - 3), i).reverse();
    const fetchLine = before.find((l) => BUN_FETCH.test(l));
    const status = fetchLine ? BUN_FETCH.exec(fetchLine)![1] : null;
    signals.push(signal('tooling', 'npm', m[1].trim(), { code: status ? `E${status}` : null, excerpt: [...(fetchLine ? [fetchLine] : []), line] }));
  });
  return signals;
}

/* ---------- docker ---------- */

const DOCKER_STEP_ERROR = /^#\d+ ERROR: (.+)$/;
const DOCKER_SOLVE = /^ERROR: (?:failed to build: )?failed to solve: (.+)$/;
const DOCKER_CLASSIC = /^The command '.+' returned a non-zero code: \d+$/;
const DOCKERFILE_LINE = /^(\S*Dockerfile\S*):(\d+)$/;

function docker(lines: readonly string[]): Signal[] {
  const signals: Signal[] = [];
  let steps: [number, string][] = [];
  lines.forEach((line, index) => {
    const step = DOCKER_STEP_ERROR.exec(line);
    const solve = step ? null : DOCKER_SOLVE.exec(line);
    if (step) steps.push([index, step[1]]);
    else if (solve) {
      const message = solve[1].trim();
      steps = steps.filter(([, s]) => !message.includes(s.trim()));
      signals.push(dockerFailure(lines, index, message));
    } else if (DOCKER_CLASSIC.test(line)) signals.push(dockerFailure(lines, index, line.trim()));
  });
  for (const [index, message] of steps) signals.push(dockerFailure(lines, index, message.trim()));
  return signals;
}

function dockerFailure(lines: readonly string[], index: number, message: string): Signal {
  const report = lines.slice(Math.max(0, index - 60), index);
  const location = [...report].reverse().map((l) => DOCKERFILE_LINE.exec(l)).find(Boolean) ?? null;
  const start = report.findLastIndex((l) => l.trimStart().startsWith('> ['));
  const output: string[] = [];
  if (start >= 0) {
    for (const l of report.slice(start).map((x) => x.trim())) {
      if (l === '------') break;
      if (l !== '') output.push(l);
    }
  }
  return signal('tooling', 'docker', message, { path: location?.[1] ?? null, line: num(location?.[2]), excerpt: output.length ? output : [lines[index].trim()] });
}

/* ---------- generic ---------- */

const FAILURE_WORD = /(?:^|[^\w/.-])(?:error|failed|fatal)(?:$|[^\w/-])|exception/i;
const TOTALS = /^\s*\d+\s+(?:error|warning)|\b(?:failed|errors?)\s*[:=]\s*0\b/i;
const TEST_CHATTER = /^\s*(?:[✓✔√]|(?:stdout|stderr)\s*\|)/;

function generic(lines: readonly string[], firstLine: number): Signal[] {
  const signals: Signal[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (FAILURE_WORD.test(line) && !TOTALS.test(line) && !TEST_CHATTER.test(line) && !line.trimStart().startsWith('##[')) {
      signals.push(signal('generic', 'generic', line.trim(), { line: firstLine + index + 1 }));
      index += 3;
    }
  }
  return signals;
}

/* ---------- the whole log ---------- */

const PARSERS = [msbuild, dotnetTest, typescript, playwright, annotations, vitest, cargo, npm, docker];
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal escapes are what this removes
const ANSI = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g;
const MIN_RESTATED_CHARS = 12;

/** Strips the runner's per-line timestamps and terminal escapes; indentation stays. */
export function preprocess(log: string): string {
  return log.split(/\r?\n/).map((line) => line.replace(TIMESTAMP, '').replace(ANSI, '')).join('\n');
}

/** `log` is sanitized already. `failedStep` is the job step that failed, when known. */
export function extract(log: string, failedStep: string | null): Extraction {
  const all = preprocess(log).split('\n');
  const step = failedStep?.trim() ?? null;
  const header = step === null ? -1 : all.findLastIndex((line) => {
    const h = line.trim().startsWith('##[group]') ? line.trim().slice(9) : null;
    return h !== null && h.startsWith('Run ') && (h === step || h.slice(4) === step);
  });
  const start = Math.max(header, 0);
  const exit = all.slice(start).findIndex((line) => line.trimStart().startsWith(`##[error]${EXIT_CODE}`));
  const lines = all.slice(start, exit < 0 ? all.length : start + exit + 1);
  let signals = PARSERS.flatMap((parse) => parse(lines));
  if (signals.every((s) => s.kind === 'summary')) signals.push(...generic(lines, start));
  return { signals: finish(signals), stepFound: header >= 0 };
}

function finish(signals: Signal[]): Signal[] {
  const stated = signals.filter((s) => s.kind !== 'annotation' && s.kind !== 'summary' && [...s.message].length >= MIN_RESTATED_CHARS).map((s) => s.message);
  const kept = signals.filter((s) => s.kind !== 'annotation' || !stated.some((m) => s.message.includes(m)));
  const collapsed: Signal[] = [];
  const seen = new Map<string, number>();
  for (const s of kept) {
    const key = JSON.stringify([s.kind, s.parser, s.testId, s.path, s.line, s.code, s.message]);
    const index = seen.get(key);
    if (index !== undefined) collapsed[index].repeats += s.repeats;
    else {
      seen.set(key, collapsed.length);
      collapsed.push(s);
    }
  }
  const ordered = [...collapsed.filter((s) => s.kind === 'summary'), ...collapsed.filter((s) => s.kind !== 'summary')].slice(0, MAX_SIGNALS);
  for (const s of ordered) {
    s.excerpt = s.excerpt.slice(0, MAX_EXCERPT_LINES).map((l) => clip(l, MAX_LINE_CHARS));
    s.frames = s.frames.slice(0, MAX_FRAMES).map((l) => clip(l, MAX_LINE_CHARS));
    s.message = clip(s.message, MAX_LINE_CHARS);
    for (const field of ['testId', 'params', 'path', 'code', 'errorClass', 'expected', 'actual'] as const) {
      const value = s[field];
      if (value !== null) s[field] = clip(value, MAX_LINE_CHARS);
    }
  }
  return ordered;
}
