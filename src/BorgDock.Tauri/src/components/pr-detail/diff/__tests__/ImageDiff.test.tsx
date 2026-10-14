import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getImageComparison, type ImageComparison } from '@/services/github/images';
import type { DiffFile } from '@/types';
import { ImageDiff } from '../ImageDiff';

vi.mock('@/services/github/images', () => ({ getImageComparison: vi.fn() }));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => ({}) }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const file: DiffFile = {
  filename: 'first.png',
  status: 'modified',
  sha: 'blob',
  additions: 0,
  deletions: 0,
  isBinary: true,
  isTruncated: false,
};
const props = { owner: 'owner', repo: 'repo', baseSha: 'base', headSha: 'head', file };
function ready(path: string): ImageComparison {
  const image = { path, src: 'data:image/png;base64,aW1hZ2U=', size: 5, ref: 'revision' };
  return { before: { state: 'ready', image }, after: { state: 'ready', image } };
}

describe('image comparison', () => {
  it('keeps the available side visible and retries a failed side', async () => {
    vi.mocked(getImageComparison)
      .mockResolvedValueOnce({
        before: { state: 'error', message: 'Original unavailable' },
        after: ready('first.png').after,
      })
      .mockResolvedValueOnce(ready('first.png'));
    render(<ImageDiff {...props} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Original unavailable');
    expect(screen.getByAltText('After: first.png')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry images' }));
    await waitFor(() => expect(getImageComparison).toHaveBeenCalledTimes(2));
    expect(await screen.findByAltText('Before: first.png')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not show a late response after the reviewer changes files', async () => {
    let resolveFirst!: (value: ImageComparison) => void;
    let resolveSecond!: (value: ImageComparison) => void;
    const first = new Promise<ImageComparison>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<ImageComparison>((resolve) => {
      resolveSecond = resolve;
    });
    vi.mocked(getImageComparison).mockReturnValueOnce(first).mockReturnValueOnce(second);
    const view = render(<ImageDiff {...props} />);
    await waitFor(() => expect(getImageComparison).toHaveBeenCalledTimes(1));
    view.rerender(<ImageDiff {...props} file={{ ...file, filename: 'second.png' }} />);
    await waitFor(() => expect(getImageComparison).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveSecond(ready('second.png'));
      await second;
    });
    expect(screen.getByAltText('After: second.png')).toBeInTheDocument();
    await act(async () => {
      resolveFirst(ready('first.png'));
      await first;
    });
    expect(screen.queryByAltText('After: first.png')).not.toBeInTheDocument();
    expect(screen.getByAltText('After: second.png')).toBeInTheDocument();
  });

  it('reports a decoding failure without affecting the other revision', async () => {
    vi.mocked(getImageComparison).mockResolvedValue(ready('first.png'));
    render(<ImageDiff {...props} />);
    const before = await screen.findByAltText('Before: first.png');
    fireEvent.error(before);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be decoded');
    expect(screen.getByAltText('After: first.png')).toBeInTheDocument();
  });
});
