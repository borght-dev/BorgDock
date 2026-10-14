import { describe, expect, it, vi } from 'vitest';
import type { DiffFile } from '@/types';
import type { GitHubClient } from '../client';
import { getImageComparison, isImagePath } from '../images';

const content = {
  type: 'file',
  sha: 'old-blob',
  encoding: 'base64',
  content: 'aW1hZ2U=\n',
  size: 5,
};
const file: DiffFile = {
  filename: 'images/new icon#.PNG',
  status: 'modified',
  additions: 0,
  deletions: 0,
  isBinary: true,
  isTruncated: false,
  sha: 'new-blob',
};
function setup() {
  const get = vi.fn(async (path: string) =>
    path.includes('/compare/') ? { merge_base_commit: { sha: 'merge-base' } } : content,
  );
  const client = { get } as unknown as GitHubClient;
  const load = (change: Partial<DiffFile> = {}) =>
    getImageComparison(client, 'owner', 'repo', { ...file, ...change }, 'base-tip', 'head');
  return { get, load, client };
}

describe('image revisions', () => {
  it('uses the merge base and encoded old path, and the exact head blob', async () => {
    const { get, load } = setup();
    const result = await load();
    expect(get).toHaveBeenCalledWith('repos/owner/repo/compare/base-tip...head?per_page=1');
    expect(get).toHaveBeenCalledWith(
      'repos/owner/repo/contents/images/new%20icon%23.PNG?ref=merge-base',
      { accept: 'application/vnd.github.object+json' },
    );
    expect(get).toHaveBeenCalledWith('repos/owner/repo/git/blobs/new-blob');
    expect(result.before).toMatchObject({
      state: 'ready',
      image: { ref: 'merge-base', src: 'data:image/png;base64,aW1hZ2U=' },
    });
    expect(result.after).toMatchObject({ state: 'ready', image: { ref: 'head' } });
  });

  it.each([
    'added',
    'copied',
  ] as const)('%s images do not request a nonexistent base file', async (status) => {
    const { get, load } = setup();
    expect((await load({ status })).before.state).toBe('absent');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('removed images do not request a nonexistent head file', async () => {
    const { get, load } = setup();
    expect((await load({ status: 'removed' })).after.state).toBe('absent');
    expect(get).not.toHaveBeenCalledWith('repos/owner/repo/git/blobs/new-blob');
  });

  it('renamed images load the previous filename at the merge base', async () => {
    const { get, load } = setup();
    await load({ status: 'renamed', previousFilename: 'old/icon.svg' });
    expect(get).toHaveBeenCalledWith('repos/owner/repo/contents/old/icon.svg?ref=merge-base', {
      accept: 'application/vnd.github.object+json',
    });
  });

  it('keeps the head preview when the original image is unavailable', async () => {
    const { get, load } = setup();
    get.mockImplementation(async (path) => {
      if (path.includes('/compare/')) throw new Error('Original revision unavailable');
      return content;
    });
    const result = await load();
    expect(result.before).toEqual({ state: 'error', message: 'Original revision unavailable' });
    expect(result.after.state).toBe('ready');
  });

  it('loads base images over 1 MB through their blob metadata', async () => {
    const { get, load } = setup();
    get.mockImplementation(async (path) => {
      if (path.includes('/compare/')) return { merge_base_commit: { sha: 'merge-base' } };
      if (path.includes('/contents/'))
        return { ...content, encoding: 'none', content: '', size: 2 * 1024 * 1024 };
      return content;
    });
    expect((await load()).before.state).toBe('ready');
    expect(get).toHaveBeenCalledWith('repos/owner/repo/git/blobs/old-blob');
  });

  it('rejects oversized base images before downloading the blob', async () => {
    const { get, load } = setup();
    get.mockImplementation(async (path) => {
      if (path.includes('/compare/')) return { merge_base_commit: { sha: 'merge-base' } };
      return { ...content, encoding: 'none', size: 11 * 1024 * 1024 };
    });
    expect((await load()).before).toMatchObject({
      state: 'error',
      message: expect.stringContaining('10 MB'),
    });
    expect(get).not.toHaveBeenCalledWith('repos/owner/repo/git/blobs/old-blob');
  });

  it('reports Git LFS pointers instead of presenting them as image bytes', async () => {
    const { get, load } = setup();
    get.mockResolvedValue({
      ...content,
      content: btoa('version https://git-lfs.github.com/spec/v1\noid sha256:123\nsize 5\n'),
    });
    expect((await load({ status: 'added' })).after).toMatchObject({
      state: 'error',
      message: expect.stringContaining('Git LFS'),
    });
  });

  it('rejects missing revision references', async () => {
    const { client } = setup();
    await expect(getImageComparison(client, 'owner', 'repo', file, '', 'head')).rejects.toThrow(
      'Review revisions',
    );
  });

  it('recognizes supported images without treating other binaries as images', () => {
    expect(isImagePath('image.PNG')).toBe(true);
    expect(isImagePath('icon.svg')).toBe(true);
    expect(isImagePath('archive.zip')).toBe(false);
    expect(isImagePath('notes.png.txt')).toBe(false);
  });
});
