import { describe, expect, it } from 'vitest';
import type { PullRequestFileChange } from '@/types';
import { toDiffFile } from '../FilesTab';

const makeFileChange = (overrides: Partial<PullRequestFileChange> = {}): PullRequestFileChange => ({
  filename: 'src/app.ts',
  status: 'modified',
  additions: 10,
  deletions: 5,
  patch: '@@ -1,3 +1,3 @@\n-old\n+new\n ctx',
  sha: 'abc1234',
  ...overrides,
});

describe('toDiffFile', () => {
  it('maps basic fields', () => {
    const fc = makeFileChange();
    const df = toDiffFile(fc);

    expect(df.filename).toBe('src/app.ts');
    expect(df.additions).toBe(10);
    expect(df.deletions).toBe(5);
    expect(df.patch).toBe(fc.patch);
    expect(df.sha).toBe('abc1234');
  });

  it('normalizes status "added"', () => {
    expect(toDiffFile(makeFileChange({ status: 'added' })).status).toBe('added');
  });

  it('normalizes status "removed"', () => {
    expect(toDiffFile(makeFileChange({ status: 'removed' })).status).toBe('removed');
  });

  it('normalizes status "renamed"', () => {
    expect(toDiffFile(makeFileChange({ status: 'renamed' })).status).toBe('renamed');
  });

  it('normalizes status "copied"', () => {
    expect(toDiffFile(makeFileChange({ status: 'copied' })).status).toBe('copied');
  });

  it('normalizes unknown status to "modified"', () => {
    expect(toDiffFile(makeFileChange({ status: 'changed' })).status).toBe('modified');
    expect(toDiffFile(makeFileChange({ status: 'modified' })).status).toBe('modified');
  });

  it('preserves previousFilename', () => {
    const df = toDiffFile(makeFileChange({
      status: 'renamed',
      previousFilename: 'old/path.ts',
    }));
    expect(df.previousFilename).toBe('old/path.ts');
  });

  it('detects binary file (no patch, zero additions/deletions)', () => {
    const df = toDiffFile(makeFileChange({
      patch: undefined,
      additions: 0,
      deletions: 0,
      status: 'modified',
    }));
    expect(df.isBinary).toBe(true);
  });

  it('does not mark as binary if patch exists', () => {
    const df = toDiffFile(makeFileChange({
      additions: 0,
      deletions: 0,
    }));
    expect(df.isBinary).toBe(false);
  });

  it('does not mark renamed files without patch as binary', () => {
    const df = toDiffFile(makeFileChange({
      status: 'renamed',
      patch: undefined,
      additions: 0,
      deletions: 0,
    }));
    expect(df.isBinary).toBe(false);
  });

  it('does not mark removed files without patch as binary', () => {
    const df = toDiffFile(makeFileChange({
      status: 'removed',
      patch: undefined,
      additions: 0,
      deletions: 0,
    }));
    expect(df.isBinary).toBe(false);
  });

  it('does not mark as binary if additions > 0', () => {
    const df = toDiffFile(makeFileChange({
      patch: undefined,
      additions: 5,
      deletions: 0,
    }));
    expect(df.isBinary).toBe(false);
  });

  it('defaults sha to empty string when undefined', () => {
    const df = toDiffFile(makeFileChange({ sha: undefined }));
    expect(df.sha).toBe('');
  });

  it('sets isTruncated to false', () => {
    const df = toDiffFile(makeFileChange());
    expect(df.isTruncated).toBe(false);
  });
});
