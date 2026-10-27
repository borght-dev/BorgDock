import { describe, expect, it } from 'vitest';
import { makeGroup } from '@/services/ci-failures/__fixtures__/store';
import { useCiGuardStore } from '../ci-guard-store';

const question = {
  conflict: { kind: 'shared' as const, group: makeGroup() },
  target: { owner: 'acme', repo: 'app', prNumber: 1, checkNames: [] },
  action: 'Open in T3',
};

describe('ci guard store', () => {
  it('lets a launch through in a window without the dialog, and asks where there is one', async () => {
    await expect(useCiGuardStore.getState().ask(question)).resolves.toBe('proceed');

    const detach = useCiGuardStore.getState().attachDialog();
    const answer = useCiGuardStore.getState().ask(question);
    expect(useCiGuardStore.getState().question).toBe(question);
    useCiGuardStore.getState().answer('cancel');
    await expect(answer).resolves.toBe('cancel');
    detach();
    expect(useCiGuardStore.getState().dialogs).toBe(0);
  });
});
