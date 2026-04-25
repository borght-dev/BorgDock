import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('console.log("hello")'),
}));

import { PreviewPane } from '../PreviewPane';

describe('PreviewPane', () => {
  it('marks the success container with data-file-preview', async () => {
    const { container } = render(
      <PreviewPane rootPath="/repo" relPath="src/foo.ts" />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-file-preview]')).not.toBeNull();
    });
  });
});
