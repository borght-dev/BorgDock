import { beforeEach, describe, expect, it, vi } from 'vitest';

const t3 = vi.hoisted(() => ({
  t3Respond: vi.fn(),
  t3SendMessage: vi.fn(),
  t3Settle: vi.fn(),
  t3ShowThread: vi.fn(),
}));
const sync = vi.hoisted(() => ({
  syncAll: vi.fn(),
  dispatchAdoClient: vi.fn(),
}));
const items = vi.hoisted(() => ({ moveItemState: vi.fn() }));
const toasts = vi.hoisted(() => ({ showToast: vi.fn(), toastError: vi.fn() }));
const toggles = vi.hoisted(() => ({ toggleTrackedWorkItem: vi.fn() }));

vi.mock('@/services/t3/api', () => ({ LOCAL_T3_HOST_ID: 'local', ...t3 }));
vi.mock('../sync', () => sync);
vi.mock('../hosts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hosts')>()),
  configuredHosts: () => [
    { id: 'local', label: 'This machine' },
    { id: 'mac', label: 'Mac', baseUrl: 'http://mac:3773' },
  ],
}));
vi.mock('../items', () => items);
vi.mock('@/stores/toast-store', () => toasts);
vi.mock('@/components/work-items/work-item-toggles', () => toggles);
vi.mock('@/services/navigation', () => ({ showPr: vi.fn() }));

import { useDispatchStore } from '@/stores/dispatch-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { dispatchActions, GO_AHEAD_MESSAGE } from '../actions';
import { makeItem, makeThread } from './fixtures';

/** Lets the action's promise chain run to its end. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('dispatchActions', () => {
  beforeEach(() => {
    for (const group of [t3, sync, items, toasts, toggles]) {
      for (const spy of Object.values(group)) spy.mockReset();
    }
    useDispatchStore.setState({ busy: false, hiddenSuggestions: new Set() });
    useWorkItemsStore.setState({ trackedWorkItemIds: new Set() });
  });

  it('answers on the thread host with the id T3 knows, then reads everything again', async () => {
    t3.t3Respond.mockResolvedValue(undefined);
    const thread = makeThread({
      id: 'mac:t1',
      hostId: 'mac',
      slot: 'M4',
      status: 'question',
      questionRequestId: 'req',
    });

    dispatchActions.answer(thread, { q: 'Row id' });
    await settled();

    expect(t3.t3Respond).toHaveBeenCalledWith(
      { id: 'mac', baseUrl: 'http://mac:3773' },
      't1',
      'req',
      { q: 'Row id' },
    );
    expect(toasts.showToast).toHaveBeenCalledWith({
      tone: 'success',
      message: 'Sent. The agent in M4 is working again.',
    });
    expect(sync.syncAll).toHaveBeenCalledWith(true);
    expect(useDispatchStore.getState().busy).toBe(false);
  });

  it('does not send an answer when the question is gone', () => {
    dispatchActions.answer(makeThread({ id: 't', questionRequestId: null }), { q: 'x' });
    expect(t3.t3Respond).not.toHaveBeenCalled();
  });

  it('approves a plan with a go-ahead, leaving plan mode when the thread is in it', async () => {
    t3.t3SendMessage.mockResolvedValue(undefined);

    dispatchActions.approvePlan(makeThread({ id: 't', status: 'plan', interactionMode: 'plan' }));
    await settled();

    expect(t3.t3SendMessage).toHaveBeenCalledWith(
      { id: 'local', baseUrl: undefined },
      't',
      GO_AHEAD_MESSAGE,
      true,
    );
  });

  it('reports a failed command and frees the buttons', async () => {
    t3.t3Settle.mockRejectedValue(new Error('Request is not pending.'));

    dispatchActions.settle(makeThread({ id: 't' }));
    await settled();

    expect(toasts.toastError).toHaveBeenCalledWith('Thread not settled', expect.any(Error));
    expect(useDispatchStore.getState().busy).toBe(false);
  });

  it('runs one action at a time', async () => {
    let finish: () => void = () => {};
    t3.t3Settle.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

    dispatchActions.settle(makeThread({ id: 'a' }));
    dispatchActions.settle(makeThread({ id: 'b' }));
    finish();
    await settled();

    expect(t3.t3Settle).toHaveBeenCalledTimes(1);
  });

  it('has an agent make a move instead of changing ADO itself', () => {
    dispatchActions.move(makeItem({ id: 59403, state: 'Code Review' }), 'Ready For QA');

    expect(useDispatchStore.getState().runSheet).toEqual({
      kind: 'sync',
      scope: { kind: 'item', itemId: 59403, to: 'Ready For QA' },
    });
    expect(items.moveItemState).not.toHaveBeenCalled();
  });

  it('hides a suggestion by its id', () => {
    dispatchActions.hideSuggestion({
      item: makeItem({ id: 1 }),
      bay: 'drift',
      waitingFor: null,
      suggestion: {
        id: '1:merged:4908:Ready For QA',
        to: 'Ready For QA',
        reason: 'PR 4908 is merged.',
      },
      pullRequest: null,
      pullRequests: [],
      threads: [],
      queued: false,
      verdict: { label: 'Out of sync', tone: 'warn' },
      evidence: [],
      latest: null,
    });
    expect(useDispatchStore.getState().hiddenSuggestions.has('1:merged:4908:Ready For QA')).toBe(
      true,
    );
  });

  it('stars an item to queue it and leaves a starred one alone', () => {
    const item = makeItem({ id: 60188 });
    dispatchActions.queue(item);
    expect(toggles.toggleTrackedWorkItem).toHaveBeenCalledWith(60188);

    toggles.toggleTrackedWorkItem.mockReset();
    useWorkItemsStore.setState({ trackedWorkItemIds: new Set([60188]) });
    dispatchActions.queue(item);
    expect(toggles.toggleTrackedWorkItem).not.toHaveBeenCalled();
  });
});
