import { beforeEach, describe, expect, it, vi } from 'vitest';

// We need to reset modules before each test because singleton.ts uses module-level state
describe('GitHub singleton', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getClient returns null before initialization', async () => {
    const { getClient } = await import('../singleton');
    expect(getClient()).toBeNull();
  });

  it('initClient creates and returns a GitHubClient', async () => {
    const { initClient, getClient } = await import('../singleton');
    const tokenGetter = vi.fn().mockResolvedValue('test-token');

    const client = initClient(tokenGetter);

    expect(client).toBeDefined();
    expect(getClient()).toBe(client);
  });

  it('initClient replaces the existing client', async () => {
    const { initClient, getClient } = await import('../singleton');
    const tokenGetter1 = vi.fn().mockResolvedValue('token-1');
    const tokenGetter2 = vi.fn().mockResolvedValue('token-2');

    const client1 = initClient(tokenGetter1);
    const client2 = initClient(tokenGetter2);

    expect(client2).not.toBe(client1);
    expect(getClient()).toBe(client2);
  });

  it('resetClient sets client back to null', async () => {
    const { initClient, getClient, resetClient } = await import('../singleton');
    const tokenGetter = vi.fn().mockResolvedValue('test-token');

    initClient(tokenGetter);
    expect(getClient()).not.toBeNull();

    resetClient();
    expect(getClient()).toBeNull();
  });

  it('resetClient is safe to call when already null', async () => {
    const { getClient, resetClient } = await import('../singleton');

    expect(getClient()).toBeNull();
    resetClient();
    expect(getClient()).toBeNull();
  });
});
