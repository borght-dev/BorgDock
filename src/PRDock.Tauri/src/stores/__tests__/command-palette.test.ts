import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from '../ui-store';

describe('command palette UI state', () => {
  beforeEach(() => {
    useUiStore.setState({
      isCommandPaletteOpen: false,
    });
  });

  it('defaults to closed', () => {
    expect(useUiStore.getState().isCommandPaletteOpen).toBe(false);
  });

  it('can be opened', () => {
    useUiStore.getState().setCommandPaletteOpen(true);
    expect(useUiStore.getState().isCommandPaletteOpen).toBe(true);
  });

  it('can be closed', () => {
    useUiStore.getState().setCommandPaletteOpen(true);
    useUiStore.getState().setCommandPaletteOpen(false);
    expect(useUiStore.getState().isCommandPaletteOpen).toBe(false);
  });
});
