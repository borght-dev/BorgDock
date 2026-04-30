import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Lazy-imported plugin must be mockable; vi.mock hoists.
const tauriWriteText = vi.fn();
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: (...args: unknown[]) => tauriWriteText(...args),
}));

vi.mock('@/services/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

import { copyToClipboard } from '../clipboard';

describe('copyToClipboard', () => {
  beforeEach(() => {
    tauriWriteText.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when the Tauri plugin succeeds', async () => {
    tauriWriteText.mockResolvedValueOnce(undefined);
    expect(await copyToClipboard('hello')).toBe(true);
    expect(tauriWriteText).toHaveBeenCalledWith('hello');
  });

  it('falls back to navigator.clipboard when the Tauri plugin throws', async () => {
    tauriWriteText.mockRejectedValueOnce(new Error('not permitted'));
    const navWrite = vi.fn().mockResolvedValueOnce(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText: navWrite } },
    });

    expect(await copyToClipboard('hello')).toBe(true);
    expect(navWrite).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when both async paths reject', async () => {
    tauriWriteText.mockRejectedValueOnce(new Error('plugin'));
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText: vi.fn().mockRejectedValueOnce(new Error('nav')) } },
    });
    const exec = vi.fn().mockReturnValue(true);
    // jsdom doesn't ship execCommand — assign it directly (not via spyOn).
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;

    expect(await copyToClipboard('hello')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('returns false when every strategy fails', async () => {
    tauriWriteText.mockRejectedValueOnce(new Error('plugin'));
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText: vi.fn().mockRejectedValueOnce(new Error('nav')) } },
    });
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;

    expect(await copyToClipboard('hello')).toBe(false);
  });
});
