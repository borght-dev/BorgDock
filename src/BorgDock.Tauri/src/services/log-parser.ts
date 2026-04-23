import type { ParsedError } from '@/types';

// --- Regex patterns ---

// MSBuild: path(line,col): error CODE: message
const MSBUILD_RE = /^(.+?)\((\d+),(\d+)\):\s*error\s+([A-Z]+\d+):\s*(.+)$/gm;

// dotnet test: "Failed <TestName>"
const DOTNET_TEST_FAILED_RE = /^\s*Failed\s+(\S+)\s*$/gm;

// TypeScript: file(line,col): error TSXXXX: message
const TYPESCRIPT_RE = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/gm;

// ESLint: file:line:col - error message
const ESLINT_RE = /^(.+?):(\d+):(\d+)\s+-\s+error\s+(.+)$/gm;

// Playwright: numbered failure header
const PLAYWRIGHT_FAILURE_RE = /\d+\)\s*\[(\w+)\]\s*›\s*(.+?):(\d+):\d+\s*›\s*(.+?)\s*$/gm;

// Playwright summary line
const PLAYWRIGHT_SUMMARY_LINE_RE = /^\s*(\d+)\s+(failed|flaky|skipped|did not run|passed)/gm;

// GitHub Actions error annotation
const GITHUB_ACTIONS_ERROR_RE = /^##\[error\](.+)$/gm;

// MSBuild pattern in message (for dedup)
const MSBUILD_PATTERN_RE = /\(\d+,\d+\):\s*error\s+[A-Z]+\d+:/;

// Timestamp prefix
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/gm;

// ANSI escape codes
const ANSI_RE = /\x1b\[\d*(?:;\d+)*m/g;

// Generic error patterns
const GENERIC_ERROR_RE = /\b(error|FAILED|fatal)\b|exception/i;

// Summary lines like "0 Error(s)"
const SUMMARY_LINE_RE = /^\s*\d+\s+(error|warning)/i;

// --- Public API ---

export function parseLogForErrors(logText: string, changedFiles: string[] = []): ParsedError[] {
  if (!logText.trim()) return [];

  const cleanLog = preprocessLog(logText);

  const errors: ParsedError[] = [];

  errors.push(...parseMsBuild(cleanLog));
  errors.push(...parseDotnetTest(cleanLog));
  errors.push(...parseTypeScriptEsLint(cleanLog));
  errors.push(...parsePlaywright(cleanLog));
  errors.push(...parseGitHubActionsAnnotations(cleanLog));

  if (errors.length === 0) {
    errors.push(...parseGenericFallback(cleanLog));
  }

  // Mark errors as introduced by PR
  const normalizedChanged = new Set(changedFiles.map(normalizePath));

  for (const error of errors) {
    if (error.filePath) {
      const normalized = normalizePath(error.filePath);
      error.isIntroducedByPr = [...normalizedChanged].some(
        (changed) => normalized.endsWith(changed) || changed.endsWith(normalized),
      );
    }
  }

  return errors;
}

export function preprocessLog(logText: string): string {
  let result = logText;
  result = result.replace(TIMESTAMP_RE, '');
  result = result.replace(ANSI_RE, '');
  return result;
}

// --- Parsers ---

function parseMsBuild(logText: string): ParsedError[] {
  const errors: ParsedError[] = [];
  const re = new RegExp(MSBUILD_RE.source, MSBUILD_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(logText)) !== null) {
    const errorCode = match[4]!;

    // Skip TypeScript errors (handled by TS parser)
    if (errorCode.startsWith('TS') && errorCode.length >= 5) continue;

    let filePath = match[1]!.trim();
    if (filePath.startsWith('##[error]')) {
      filePath = filePath.slice('##[error]'.length);
    }

    errors.push({
      filePath,
      lineNumber: parseInt(match[2]!, 10),
      columnNumber: parseInt(match[3]!, 10),
      errorCode,
      message: match[5]!.trim(),
      category: 'MSBuild',
      isIntroducedByPr: false,
    });
  }

  // Deduplicate
  const seen = new Set<string>();
  return errors.filter((e) => {
    const key = `${e.filePath}:${e.lineNumber}:${e.errorCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseDotnetTest(logText: string): ParsedError[] {
  const errors: ParsedError[] = [];
  const lines = logText.split('\n');
  const re = new RegExp(DOTNET_TEST_FAILED_RE.source, DOTNET_TEST_FAILED_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(logText)) !== null) {
    const testName = match[1]!;
    const matchLineIndex = getLineIndex(lines, match.index);
    const message = collectTestErrorContext(lines, matchLineIndex);

    errors.push({
      filePath: '',
      message: `Test failed: ${testName}. ${message}`.trim(),
      errorCode: testName,
      category: 'DotnetTest',
      isIntroducedByPr: false,
    });
  }

  return errors;
}

function parseTypeScriptEsLint(logText: string): ParsedError[] {
  const errors: ParsedError[] = [];

  const tsRe = new RegExp(TYPESCRIPT_RE.source, TYPESCRIPT_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = tsRe.exec(logText)) !== null) {
    errors.push({
      filePath: match[1]!.trim(),
      lineNumber: parseInt(match[2]!, 10),
      columnNumber: parseInt(match[3]!, 10),
      errorCode: match[4]!,
      message: match[5]!.trim(),
      category: 'TypeScript',
      isIntroducedByPr: false,
    });
  }

  const eslintRe = new RegExp(ESLINT_RE.source, ESLINT_RE.flags);
  while ((match = eslintRe.exec(logText)) !== null) {
    errors.push({
      filePath: match[1]!.trim(),
      lineNumber: parseInt(match[2]!, 10),
      columnNumber: parseInt(match[3]!, 10),
      errorCode: '',
      message: match[4]!.trim(),
      category: 'ESLint',
      isIntroducedByPr: false,
    });
  }

  return errors;
}

function parsePlaywright(logText: string): ParsedError[] {
  const errors: ParsedError[] = [];

  // Must have Playwright summary and browser tags
  const summaryRe = new RegExp(PLAYWRIGHT_SUMMARY_LINE_RE.source, PLAYWRIGHT_SUMMARY_LINE_RE.flags);
  if (!summaryRe.test(logText)) return errors;

  if (
    !logText.includes('[chromium]') &&
    !logText.includes('[firefox]') &&
    !logText.includes('[webkit]')
  ) {
    return errors;
  }

  const lines = logText.split('\n');
  const failureRe = new RegExp(PLAYWRIGHT_FAILURE_RE.source, PLAYWRIGHT_FAILURE_RE.flags);
  let match: RegExpExecArray | null;
  const seenErrorCodes = new Set<string>();

  while ((match = failureRe.exec(logText)) !== null) {
    const browser = match[1]!;
    const filePath = match[2]!.trim();
    const lineNumber = parseInt(match[3]!, 10);
    const testName = match[4]!.trim();
    const errorCode = `[${browser}] ${testName}`;

    if (seenErrorCodes.has(errorCode)) continue;
    seenErrorCodes.add(errorCode);

    const matchLineIndex = getLineIndex(lines, match.index);
    const errorMessage = collectPlaywrightErrorContext(lines, matchLineIndex);

    errors.push({
      filePath,
      lineNumber,
      errorCode,
      message: errorMessage,
      category: 'Playwright',
      isIntroducedByPr: false,
    });
  }

  // Extract summary
  const summary = collectPlaywrightSummary(lines);
  if (summary) {
    errors.unshift({
      filePath: '',
      errorCode: 'Test Results',
      message: summary,
      category: 'PlaywrightSummary',
      isIntroducedByPr: false,
    });
  }

  return errors;
}

function parseGitHubActionsAnnotations(logText: string): ParsedError[] {
  const errors: ParsedError[] = [];
  const re = new RegExp(GITHUB_ACTIONS_ERROR_RE.source, GITHUB_ACTIONS_ERROR_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(logText)) !== null) {
    const message = match[1]!.trim();

    if (message.startsWith('Process completed with exit code')) continue;
    if (MSBUILD_PATTERN_RE.test(message)) continue;

    errors.push({
      filePath: '',
      errorCode: '',
      message,
      category: 'GitHubActions',
      isIntroducedByPr: false,
    });
  }

  return errors;
}

function parseGenericFallback(logText: string): ParsedError[] {
  const errors: ParsedError[] = [];
  const lines = logText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!GENERIC_ERROR_RE.test(line)) continue;
    if (SUMMARY_LINE_RE.test(line)) continue;
    if (line.trimStart().startsWith('##[')) continue;

    const contextEnd = Math.min(lines.length - 1, i + 3);

    errors.push({
      filePath: '',
      errorCode: `Line ${i + 1}`,
      message: line.replace(/\r$/, '').trim(),
      category: 'Generic',
      isIntroducedByPr: false,
    });

    i = contextEnd;
  }

  return errors;
}

// --- Helpers ---

function getLineIndex(lines: string[], charIndex: number): number {
  let currentPos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (currentPos >= charIndex) return i;
    currentPos += lines[i]!.length + 1;
  }
  return lines.length - 1;
}

function collectTestErrorContext(lines: string[], startLine: number): string {
  const contextLines: string[] = [];
  for (let i = startLine + 1; i < lines.length && i <= startLine + 10; i++) {
    const line = lines[i]!.replace(/\r$/, '');
    if (!line.trim()) break;
    if (line.trimStart().startsWith('Failed ')) break;
    contextLines.push(line.trim());
  }
  return contextLines.join(' ');
}

function collectPlaywrightErrorContext(lines: string[], startIndex: number): string {
  const contextLines: string[] = [];
  const failureRe = new RegExp(PLAYWRIGHT_FAILURE_RE.source, PLAYWRIGHT_FAILURE_RE.flags);

  for (let i = startIndex + 1; i < lines.length && contextLines.length < 30; i++) {
    const line = lines[i]!.replace(/\r$/, '');
    const trimmed = line.trim();

    if (i > startIndex + 1 && failureRe.test(line)) break;
    if (trimmed.startsWith('Retry #')) break;
    if (trimmed.startsWith('attachment #')) break;
    if (trimmed.startsWith('Error Context:')) break;

    if (trimmed) contextLines.push(trimmed);
  }

  return contextLines.join('\n');
}

function collectPlaywrightSummary(lines: string[]): string {
  let summaryStart = -1;
  let summaryEnd = -1;
  const summaryRe = new RegExp(PLAYWRIGHT_SUMMARY_LINE_RE.source, PLAYWRIGHT_SUMMARY_LINE_RE.flags);

  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i]!.replace(/\r$/, '').trim();

    if (!trimmed) {
      if (summaryStart !== -1) break;
      continue;
    }

    summaryRe.lastIndex = 0;
    if (summaryRe.test(trimmed)) {
      summaryStart = i;
      if (summaryEnd === -1) summaryEnd = i;
    } else if (summaryStart !== -1) {
      if (
        trimmed.includes('] \u203A') &&
        (trimmed.includes('[chromium]') ||
          trimmed.includes('[firefox]') ||
          trimmed.includes('[webkit]'))
      ) {
        summaryStart = i;
      } else {
        break;
      }
    }
  }

  if (summaryStart === -1) return '';

  const result: string[] = [];
  for (let i = summaryStart; i <= summaryEnd; i++) {
    result.push(lines[i]!.replace(/\r$/, ''));
  }

  return result.join('\n').trimEnd();
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\//, '');
}
