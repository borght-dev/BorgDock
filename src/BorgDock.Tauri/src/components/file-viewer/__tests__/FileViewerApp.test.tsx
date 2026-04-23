import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileViewerApp } from '../FileViewerApp';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

type InvokeMock = (cmd: string, args?: unknown) => Promise<unknown>;

async function setInvoke(impl: InvokeMock) {
  const { invoke } = await import('@tauri-apps/api/core');
  (invoke as ReturnType<typeof vi.fn>).mockImplementation(impl);
}

const SAMPLE_PATCH = `diff --git a/a.ts b/a.ts
index 1111..2222 100644
--- a/a.ts
+++ b/a.ts
@@ -1,1 +1,1 @@
-export const x = 0;
+export const x = 1;
`;

describe('FileViewerApp', () => {
  beforeEach(() => {
    window.history.replaceState(
      null,
      '',
      '/file-viewer.html?path=' + encodeURIComponent('E:/a.ts'),
    );
  });

  it('renders plain content when not in a git repo', async () => {
    await setInvoke((cmd) => {
      if (cmd === 'read_text_file') return Promise.resolve('export const x = 1;');
      if (cmd === 'git_file_diff') {
        return Promise.resolve({ patch: '', baselineRef: '', inRepo: false });
      }
      if (cmd === 'load_settings') return Promise.resolve({ ui: {} });
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    render(<FileViewerApp />);
    await waitFor(() => expect(screen.getByText(/x = 1/)).toBeTruthy());
    expect(screen.getByText('E:/a.ts')).toBeTruthy();
  });

  it('opens in diff mode when the file has uncommitted changes', async () => {
    await setInvoke((cmd) => {
      if (cmd === 'read_text_file') return Promise.resolve('export const x = 1;');
      if (cmd === 'git_file_diff') {
        return Promise.resolve({ patch: SAMPLE_PATCH, baselineRef: 'HEAD', inRepo: true });
      }
      if (cmd === 'load_settings') return Promise.resolve({ ui: {} });
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    render(<FileViewerApp />);
    // The "Unified"/"Split" segment is only rendered when mode === 'diff'.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unified' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Split' })).toBeTruthy();
    // The hunk header from the patch is rendered verbatim as a row.
    expect(screen.getByText(/@@ -1,1 \+1,1 @@/)).toBeTruthy();
  });

  it('falls back to plain content when there is no diff vs HEAD', async () => {
    await setInvoke((cmd) => {
      if (cmd === 'read_text_file') return Promise.resolve('export const x = 1;');
      if (cmd === 'git_file_diff') {
        return Promise.resolve({ patch: '', baselineRef: 'HEAD', inRepo: true });
      }
      if (cmd === 'load_settings') return Promise.resolve({ ui: {} });
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    render(<FileViewerApp />);
    await waitFor(() => expect(screen.getByText(/x = 1/)).toBeTruthy());
  });

  it('starts in mergeBaseDefault mode when ?baseline=mergeBaseDefault is in the URL', async () => {
    window.history.replaceState(
      null,
      '',
      '/file-viewer.html?path=' +
        encodeURIComponent('E:/a.ts') +
        '&baseline=mergeBaseDefault',
    );
    await setInvoke((cmd, args) => {
      if (cmd === 'read_text_file') return Promise.resolve('export const x = 1;');
      if (cmd === 'git_file_diff') {
        const baseline = (args as { baseline?: string } | undefined)?.baseline;
        // Assert the initial diff fetch uses the URL-provided baseline.
        return Promise.resolve({
          patch: baseline === 'mergeBaseDefault' ? SAMPLE_PATCH : '',
          baselineRef: baseline === 'mergeBaseDefault' ? 'master' : 'HEAD',
          inRepo: true,
        });
      }
      if (cmd === 'load_settings') return Promise.resolve({ ui: {} });
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
    render(<FileViewerApp />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /vs master/ })).toHaveClass(
        'fv-seg-btn--active',
      ),
    );
  });
});
