import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiffPreview } from '../DiffPreview';

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

afterEach(() => invokeMock.mockReset());

describe('DiffPreview', () => {
  it('loads diff for the given path and baseline', async () => {
    invokeMock.mockResolvedValue({
      patch: 'diff --git a/x b/x\n@@ -1,2 +1,3 @@\n one\n+two\n three\n',
      baselineRef: 'HEAD',
      inRepo: true,
    });
    render(<DiffPreview path="/r/x" relPath="x" initialBaseline="HEAD" onPopOut={() => {}} />);
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('git_file_diff', { path: '/r/x', baseline: 'HEAD' }),
    );
  });

  it('refetches when compare toggle flips to vs main', async () => {
    invokeMock.mockResolvedValue({ patch: '', baselineRef: 'HEAD', inRepo: true });
    render(<DiffPreview path="/r/x" relPath="x" initialBaseline="HEAD" onPopOut={() => {}} />);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /vs main/i }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock).toHaveBeenLastCalledWith('git_file_diff', {
      path: '/r/x',
      baseline: 'mergeBaseDefault',
    });
  });

  it('Open in window calls onPopOut with the current baseline', async () => {
    invokeMock.mockResolvedValue({ patch: '', baselineRef: 'HEAD', inRepo: true });
    const onPopOut = vi.fn();
    render(<DiffPreview path="/r/x" relPath="x" initialBaseline="HEAD" onPopOut={onPopOut} />);
    fireEvent.click(await screen.findByLabelText(/Open in window/i));
    expect(onPopOut).toHaveBeenCalledWith('HEAD');
  });
});
