import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef, type RefObject } from 'react';

// Mock settings store
const mockSettings = {
  azureDevOps: {
    personalAccessToken: 'test-pat',
  },
};

vi.mock('@/stores/settings-store', () => ({
  useSettingsStore: {
    getState: () => ({ settings: mockSettings }),
  },
}));

import { useAdoImageAuth } from '../useAdoImageAuth';

// Helpers to build mock DOM
function createMockImg(src: string): HTMLImageElement {
  const img = document.createElement('img');
  img.setAttribute('src', src);
  return img;
}

function createContainer(imgs: HTMLImageElement[]): HTMLDivElement {
  const div = document.createElement('div');
  for (const img of imgs) {
    div.appendChild(img);
  }
  return div;
}

// Persistent mocks for URL methods — must survive React cleanup effects
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:http://localhost/abc');
const mockRevokeObjectURL = vi.fn();

describe('useAdoImageAuth', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;

    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('does nothing when containerRef is null', () => {
    globalThis.fetch = vi.fn();

    const { result } = renderHook(() => {
      const ref = useRef<HTMLElement | null>(null);
      useAdoImageAuth(ref, '<img src="https://dev.azure.com/img.png">');
      return ref;
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does nothing when htmlContent is undefined', () => {
    globalThis.fetch = vi.fn();
    const container = createContainer([createMockImg('https://dev.azure.com/img.png')]);

    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container);
      useAdoImageAuth(ref, undefined);
      return ref;
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does nothing when no PAT is configured', () => {
    const origPat = mockSettings.azureDevOps.personalAccessToken;
    mockSettings.azureDevOps.personalAccessToken = '';
    globalThis.fetch = vi.fn();

    const container = createContainer([createMockImg('https://dev.azure.com/img.png')]);

    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container);
      useAdoImageAuth(ref, '<img src="https://dev.azure.com/img.png">');
      return ref;
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    mockSettings.azureDevOps.personalAccessToken = origPat;
  });

  it('fetches http images with auth header and replaces src with blob URL', async () => {
    const mockBlob = new Blob(['image data'], { type: 'image/png' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const img = createMockImg('https://dev.azure.com/org/project/_apis/wit/attachments/123');
    const container = createContainer([img]);

    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container);
      useAdoImageAuth(ref, '<img src="https://dev.azure.com/org/project/_apis/wit/attachments/123">');
      return ref;
    });

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://dev.azure.com/org/project/_apis/wit/attachments/123',
        { headers: { Authorization: `Basic ${btoa(':test-pat')}` } },
      );
    });

    await vi.waitFor(() => {
      expect(img.src).toContain('blob:');
      expect(img.style.opacity).toBe('1');
    });
  });

  it('skips data: URI images', () => {
    globalThis.fetch = vi.fn();
    const img = createMockImg('data:image/png;base64,abc');
    const container = createContainer([img]);

    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container);
      useAdoImageAuth(ref, '<img src="data:image/png;base64,abc">');
      return ref;
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('skips blob: URI images', () => {
    globalThis.fetch = vi.fn();
    const img = createMockImg('blob:http://localhost/xyz');
    const container = createContainer([img]);

    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container);
      useAdoImageAuth(ref, '<img src="blob:http://localhost/xyz">');
      return ref;
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('shows broken state on fetch error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const img = createMockImg('https://dev.azure.com/img.png');
    const container = createContainer([img]);

    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container);
      useAdoImageAuth(ref, '<p>content</p>');
      return ref;
    });

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    await vi.waitFor(() => {
      expect(img.style.opacity).toBe('1');
    });
  });

  it('revokes blob URLs on cleanup', async () => {
    const mockBlob = new Blob(['data'], { type: 'image/png' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const img = createMockImg('https://dev.azure.com/img.png');
    const container = createContainer([img]);

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement | null>(container);
      useAdoImageAuth(ref, 'html content');
      return ref;
    });

    await vi.waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled();
    });

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/abc');
  });

  it('hides image while loading', async () => {
    let resolveFetch: (value: unknown) => void;
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const img = createMockImg('https://dev.azure.com/img.png');
    const container = createContainer([img]);

    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container);
      useAdoImageAuth(ref, 'html');
      return ref;
    });

    // Image should be hidden while loading
    await vi.waitFor(() => {
      expect(img.style.opacity).toBe('0');
    });

    // Resolve the fetch
    const mockBlob = new Blob(['data'], { type: 'image/png' });
    resolveFetch!({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    await vi.waitFor(() => {
      expect(img.style.opacity).toBe('1');
    });
  });

  it('handles multiple images in the container', async () => {
    const mockBlob = new Blob(['data'], { type: 'image/png' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const img1 = createMockImg('https://dev.azure.com/img1.png');
    const img2 = createMockImg('https://dev.azure.com/img2.png');
    const container = createContainer([img1, img2]);

    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container);
      useAdoImageAuth(ref, 'html');
      return ref;
    });

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('does not update src after unmount (cancelled)', async () => {
    let resolveFetch: (value: unknown) => void;
    globalThis.fetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const img = createMockImg('https://dev.azure.com/img.png');
    const originalSrc = img.src;
    const container = createContainer([img]);

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement | null>(container);
      useAdoImageAuth(ref, 'html');
      return ref;
    });

    unmount();

    // Resolve after unmount
    const mockBlob = new Blob(['data'], { type: 'image/png' });
    resolveFetch!({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    // Wait a tick for the promise chain
    await new Promise((r) => setTimeout(r, 0));

    // createObjectURL should not have been called since cancelled=true
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
