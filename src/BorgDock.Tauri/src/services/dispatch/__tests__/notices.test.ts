import { beforeEach, describe, expect, it, vi } from 'vitest';

const os = vi.hoisted(() => ({ sendOsNotification: vi.fn() }));
vi.mock('@/services/notification', () => os);

import { makeDispatchScene } from '@/components/dispatch/__fixtures__/dispatch-data';
import { useSettingsStore } from '@/stores/settings-store';
import { noticesFor } from '../notices';
import { notifyNew, resetNotifier } from '../notifier';
import type { Overview } from '../types';

const NOW = Date.parse('2026-10-12T12:00:00Z');

function setNotifications(on: boolean) {
  const { settings } = useSettingsStore.getState();
  const agents = { ...settings.agents, dispatchNotifications: on } as typeof settings.agents;
  useSettingsStore.setState({ settings: { ...settings, agents } });
}

/** The scene with one more item waiting: the agent in W2 now asks something. */
function withNewQuestion(overview: Overview): Overview {
  return {
    ...overview,
    items: overview.items.map((o) =>
      o.item.id === 60031
        ? {
            ...o,
            bay: 'waiting',
            waitingFor: 'Agent asks in W2',
            threads: o.threads.map((thread) => ({
              ...thread,
              status: 'question' as const,
              questionRequestId: 'req-9',
              questions: [
                {
                  id: 'q',
                  question: 'Assign all selected jobs, or only unassigned ones?',
                  options: [
                    { label: 'Only unassigned', value: 'Only unassigned (Recommended)' },
                    { label: 'All selected', value: 'All selected' },
                  ],
                  recommended: 0,
                  allowCustomAnswer: true,
                  multiSelect: false,
                },
              ],
            })),
          }
        : o,
    ),
  };
}

describe('noticesFor', () => {
  const notices = noticesFor(makeDispatchScene(NOW).overview);
  const byItem = (id: number) => notices.filter((n) => n.itemId === id);

  it('offers the recommended answer for a single question', () => {
    expect(byItem(60214)).toMatchObject([
      {
        key: 'question:t-60214:req-1',
        severity: 'warning',
        title: 'W3 asks about 60214',
        action: { id: 'answer-recommended', label: 'Restore by row id' },
      },
    ]);
  });

  it('offers to approve a plan, with its first line as the body', () => {
    expect(byItem(59877)).toMatchObject([
      {
        severity: 'warning',
        title: 'W1 has a plan for 59877',
        body: 'Plan, three steps.',
        action: { id: 'approve-plan', label: 'Approve plan' },
      },
    ]);
  });

  it('reports a finished turn, and the state move it implies, as two notices', () => {
    expect(byItem(60102).map((n) => [n.severity, n.action?.id ?? null])).toEqual([
      ['success', null],
      ['info', 'move'],
    ]);
  });

  it('reports a failed agent as an error', () => {
    expect(byItem(59640)).toMatchObject([{ severity: 'error', action: null }]);
  });

  it('suggests the move for an item that is out of sync', () => {
    expect(byItem(59403)).toMatchObject([
      { key: 'drift:59403:merged:3668', title: '59403: move to Ready For QA?' },
    ]);
  });

  it('stays quiet about work that runs, is queued, or is only stale', () => {
    for (const id of [60031, 60188, 60201, 59958]) expect(byItem(id)).toEqual([]);
  });
});

describe('notifyNew', () => {
  beforeEach(() => {
    resetNotifier();
    os.sendOsNotification.mockReset();
    os.sendOsNotification.mockResolvedValue(undefined);
    setNotifications(true);
  });

  it('sends nothing while the sources are still being read', () => {
    notifyNew(makeDispatchScene(NOW).overview, true);
    expect(os.sendOsNotification).not.toHaveBeenCalled();
  });

  it('sends only what is new after that, with the action and Open', () => {
    const { overview } = makeDispatchScene(NOW);
    notifyNew(overview, true);
    notifyNew(overview, false);
    expect(os.sendOsNotification).not.toHaveBeenCalled();

    notifyNew(withNewQuestion(overview), false);

    expect(os.sendOsNotification).toHaveBeenCalledTimes(1);
    expect(os.sendOsNotification).toHaveBeenCalledWith({
      id: 'dispatch:question:t-60031:req-9',
      severity: 'warning',
      title: 'W2 asks about 60031',
      body: 'Assign all selected jobs, or only unassigned ones?',
      actions: [
        { label: 'Only unassigned', action: 'dispatch-act', url: '60031:answer-recommended' },
        { label: 'Open', action: 'dispatch-show', url: '60031' },
      ],
    });
  });

  it('sends each notice once', () => {
    const { overview } = makeDispatchScene(NOW);
    notifyNew(overview, true);
    const changed = withNewQuestion(overview);
    notifyNew(changed, false);
    notifyNew(changed, false);
    expect(os.sendOsNotification).toHaveBeenCalledTimes(1);
  });

  it('records but does not send while notifications are off', () => {
    setNotifications(false);
    const { overview } = makeDispatchScene(NOW);
    notifyNew(overview, true);
    notifyNew(withNewQuestion(overview), false);
    expect(os.sendOsNotification).not.toHaveBeenCalled();
  });
});
