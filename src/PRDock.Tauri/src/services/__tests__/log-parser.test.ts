import { describe, it, expect } from 'vitest';
import { parseLogForErrors, preprocessLog } from '../log-parser';

describe('preprocessLog', () => {
  it('strips GitHub Actions timestamps', () => {
    const input = '2024-01-15T10:30:45.1234567Z Hello world';
    expect(preprocessLog(input)).toBe('Hello world');
  });

  it('strips ANSI escape codes', () => {
    const input = '\x1b[31;1mError\x1b[0m: something failed';
    expect(preprocessLog(input)).toBe('Error: something failed');
  });
});

describe('parseLogForErrors', () => {
  describe('MSBuild errors', () => {
    it('parses MSBuild error format', () => {
      const log = 'src/Foo.cs(42,10): error CS1002: ; expected';
      const errors = parseLogForErrors(log);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.filePath).toBe('src/Foo.cs');
      expect(errors[0]!.lineNumber).toBe(42);
      expect(errors[0]!.columnNumber).toBe(10);
      expect(errors[0]!.errorCode).toBe('CS1002');
      expect(errors[0]!.message).toBe('; expected');
      expect(errors[0]!.category).toBe('MSBuild');
    });

    it('deduplicates same file/line/code', () => {
      const log = [
        'src/Foo.cs(42,10): error CS1002: ; expected',
        'src/Foo.cs(42,10): error CS1002: ; expected',
      ].join('\n');

      const errors = parseLogForErrors(log);
      expect(errors).toHaveLength(1);
    });

    it('strips ##[error] prefix from file path', () => {
      const log = '##[error]src/Foo.cs(10,5): error CS0246: Type not found';
      const errors = parseLogForErrors(log);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.filePath).toBe('src/Foo.cs');
    });

    it('handles various error code formats', () => {
      const log = [
        'src/A.cs(1,1): error ASPDEPR002: deprecated',
        'src/B.cs(2,2): error NETSDK1100: sdk error',
        'src/C.cs(3,3): error CA1234: code analysis',
      ].join('\n');

      const errors = parseLogForErrors(log);
      expect(errors).toHaveLength(3);
      expect(errors.map((e) => e.errorCode)).toEqual([
        'ASPDEPR002',
        'NETSDK1100',
        'CA1234',
      ]);
    });
  });

  describe('dotnet test failures', () => {
    it('parses failed test names', () => {
      const log = [
        '  Failed MyNamespace.MyTest',
        '    Expected: 1',
        '    Actual:   2',
        '',
      ].join('\n');

      const errors = parseLogForErrors(log);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.category).toBe('DotnetTest');
      expect(errors[0]!.message).toContain('MyNamespace.MyTest');
      expect(errors[0]!.message).toContain('Expected: 1');
    });
  });

  describe('TypeScript errors', () => {
    it('parses TypeScript error format', () => {
      const log = 'src/app.ts(15,3): error TS2322: Type mismatch';
      const errors = parseLogForErrors(log);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.filePath).toBe('src/app.ts');
      expect(errors[0]!.lineNumber).toBe(15);
      expect(errors[0]!.errorCode).toBe('TS2322');
      expect(errors[0]!.category).toBe('TypeScript');
    });
  });

  describe('ESLint errors', () => {
    it('parses ESLint error format', () => {
      const log = 'src/index.ts:10:5 - error no-unused-vars';
      const errors = parseLogForErrors(log);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.filePath).toBe('src/index.ts');
      expect(errors[0]!.lineNumber).toBe(10);
      expect(errors[0]!.columnNumber).toBe(5);
      expect(errors[0]!.category).toBe('ESLint');
    });
  });

  describe('Playwright failures', () => {
    it('parses Playwright failure headers', () => {
      const log = [
        '1) [chromium] \u203A tests/login.spec.ts:42:10 \u203A Login flow',
        '  Error: expect(locator).toBeVisible()',
        '  Expected: visible',
        '  Received: hidden',
        '',
        '  1 failed',
        '  38 passed (11.0m)',
      ].join('\n');

      const errors = parseLogForErrors(log);

      // Should have summary + failure
      const playwrightErrors = errors.filter(
        (e) => e.category === 'Playwright'
      );
      const summaryErrors = errors.filter(
        (e) => e.category === 'PlaywrightSummary'
      );

      expect(playwrightErrors).toHaveLength(1);
      expect(playwrightErrors[0]!.filePath).toBe('tests/login.spec.ts');
      expect(playwrightErrors[0]!.lineNumber).toBe(42);
      expect(playwrightErrors[0]!.errorCode).toContain('[chromium]');

      expect(summaryErrors).toHaveLength(1);
      expect(summaryErrors[0]!.message).toContain('failed');
    });

    it('skips Playwright parsing without browser tags', () => {
      const log = [
        '1 failed',
        '38 passed',
      ].join('\n');

      const errors = parseLogForErrors(log);
      const playwrightErrors = errors.filter(
        (e) => e.category === 'Playwright' || e.category === 'PlaywrightSummary'
      );
      expect(playwrightErrors).toHaveLength(0);
    });
  });

  describe('GitHub Actions annotations', () => {
    it('parses ##[error] annotations', () => {
      const log = '##[error]Coverage is below threshold: 80%';
      const errors = parseLogForErrors(log);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.category).toBe('GitHubActions');
      expect(errors[0]!.message).toBe('Coverage is below threshold: 80%');
    });

    it('skips process exit messages', () => {
      const log = '##[error]Process completed with exit code 1';
      const errors = parseLogForErrors(log);
      expect(errors).toHaveLength(0);
    });

    it('skips MSBuild errors in annotations (handled by MSBuild parser)', () => {
      const log = [
        'src/Foo.cs(42,10): error CS1002: ; expected',
        '##[error]src/Foo.cs(42,10): error CS1002: ; expected',
      ].join('\n');

      const errors = parseLogForErrors(log);
      // Only MSBuild parser should pick this up, not the GH Actions parser
      const ghErrors = errors.filter((e) => e.category === 'GitHubActions');
      expect(ghErrors).toHaveLength(0);
    });
  });

  describe('Generic fallback', () => {
    it('catches generic error lines when no specific parser matches', () => {
      const log = 'FATAL: something went very wrong';
      const errors = parseLogForErrors(log);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.category).toBe('Generic');
      expect(errors[0]!.message).toContain('FATAL');
    });

    it('skips summary lines', () => {
      const log = '0 Error(s)';
      const errors = parseLogForErrors(log);
      expect(errors).toHaveLength(0);
    });
  });

  describe('PR file matching', () => {
    it('marks errors as introduced by PR when file matches', () => {
      const log = 'src/Foo.cs(42,10): error CS1002: ; expected';
      const errors = parseLogForErrors(log, ['src/Foo.cs']);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.isIntroducedByPr).toBe(true);
    });

    it('does not mark errors for unrelated files', () => {
      const log = 'src/Foo.cs(42,10): error CS1002: ; expected';
      const errors = parseLogForErrors(log, ['src/Bar.cs']);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.isIntroducedByPr).toBe(false);
    });

    it('normalizes path separators for matching', () => {
      const log = 'src\\Foo.cs(42,10): error CS1002: ; expected';
      const errors = parseLogForErrors(log, ['src/Foo.cs']);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.isIntroducedByPr).toBe(true);
    });
  });
});
