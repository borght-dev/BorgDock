import { beforeEach, describe, expect, it } from 'vitest';
import { type UpdateStatus, useUpdateStore } from '../update-store';

const ready: UpdateStatus = {
  phase: 'ready',
  currentVersion: '4.16.0',
  version: '4.17.0',
  progress: 100,
  lastCheckedAt: '2026-11-24T09:00:10Z',
  lastError: null,
};

describe('update-store', () => {
  beforeEach(() => {
    useUpdateStore.getState().reset();
  });

  it('starts idle, never checked, with no version known', () => {
    expect(useUpdateStore.getState()).toMatchObject({
      phase: 'idle',
      currentVersion: '',
      version: null,
      progress: 0,
      lastCheckedAt: null,
      lastError: null,
      restarting: false,
    });
  });

  it('takes the whole status Rust reports', () => {
    useUpdateStore.getState().setStatus(ready);
    expect(useUpdateStore.getState()).toMatchObject(ready);
  });

  it('a later status replaces every field of the earlier one', () => {
    useUpdateStore.getState().setStatus({ ...ready, lastError: 'Download failed: reset' });
    useUpdateStore.getState().setStatus({
      ...ready,
      phase: 'idle',
      version: null,
      progress: 0,
      lastError: null,
    });
    expect(useUpdateStore.getState()).toMatchObject({
      phase: 'idle',
      version: null,
      progress: 0,
      lastError: null,
    });
  });

  it('keeps the restarting flag apart from the status', () => {
    useUpdateStore.getState().setRestarting(true);
    useUpdateStore.getState().setStatus(ready);
    expect(useUpdateStore.getState().restarting).toBe(true);
    useUpdateStore.getState().setRestarting(false);
    expect(useUpdateStore.getState().phase).toBe('ready');
  });

  it('reset returns to the initial state', () => {
    useUpdateStore.getState().setStatus(ready);
    useUpdateStore.getState().setRestarting(true);
    useUpdateStore.getState().reset();
    expect(useUpdateStore.getState()).toMatchObject({
      phase: 'idle',
      currentVersion: '',
      version: null,
      restarting: false,
    });
  });
});
