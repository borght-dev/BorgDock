import { describe, expect, it } from 'vitest';
import { withAccountRequest } from '../request-budget';

describe('account request budget', () => {
  it('shares four slots across callers, releases failures and isolates accounts', async () => {
    const finish: (() => void)[] = [];
    let active = 0;
    let peak = 0;
    const request = () =>
      withAccountRequest('Account', async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => finish.push(resolve));
        active--;
      });
    const jobs = Array.from({ length: 8 }, request);
    expect(active).toBe(4);
    let otherStarted = false;
    await withAccountRequest('different', async () => {
      otherStarted = true;
    });
    expect(otherStarted).toBe(true);
    for (let i = 0; i < 8; i++) {
      finish[i]!();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }
    await Promise.all(jobs);
    expect(peak).toBe(4);
    await expect(
      withAccountRequest('account', async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    await expect(withAccountRequest('ACCOUNT', async () => 'recovered')).resolves.toBe('recovered');
  });
});
