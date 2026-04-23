import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileViewerApp } from '../FileViewerApp';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('FileViewerApp', () => {
  beforeEach(async () => {
    window.history.replaceState(null, '', '/file-viewer.html?path=' + encodeURIComponent('E:/a.ts'));
    const { invoke } = await import('@tauri-apps/api/core');
    (invoke as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === 'read_text_file') return Promise.resolve('export const x = 1;');
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });
  });

  it('reads the file path from the URL and renders its content', async () => {
    render(<FileViewerApp />);
    await waitFor(() => expect(screen.getByText(/x = 1/)).toBeTruthy());
    expect(screen.getByText('E:/a.ts')).toBeTruthy();
  });
});
