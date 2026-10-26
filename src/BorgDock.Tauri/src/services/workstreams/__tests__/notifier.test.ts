import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assessment } from '../attention';
import { notifyWorkstreams, resetWorkstreamNotifier, workstreamNotices } from '../notifier';
import { workstream } from './fixtures';

const send = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/services/notification', () => ({ sendOsNotification: send }));

const document = workstream({ title: 'Checkout' });

function assessment(ids: string[]): Record<string, Assessment> {
  return {
    [document.id]: {
      attention: ids.map((id) => ({
        id,
        tone: 'ok' as const,
        reason: `because ${id}`,
        action: '',
        target: null,
      })),
    } as unknown as Assessment,
  };
}

beforeEach(() => {
  resetWorkstreamNotifier();
  send.mockClear();
});

describe('workstream notifications', () => {
  it('only names what changes what you do next', () => {
    const notices = workstreamNotices(
      [document],
      assessment(['unblocked:r1', 'stalled', 'needs-you:x', 'ready']),
    );
    expect(notices.map((n) => n.key)).toEqual([
      `${document.id}:unblocked:r1`,
      `${document.id}:ready`,
    ]);
    expect(notices[0]!.title).toBe('Unblocked: Checkout');
  });

  it('stays quiet about what was true before, and sends what is new once', () => {
    notifyWorkstreams(workstreamNotices([document], assessment(['ready'])), true, true);
    expect(send).not.toHaveBeenCalled();
    const later = workstreamNotices([document], assessment(['ready', 'unblocked:r1']));
    notifyWorkstreams(later, false, true);
    notifyWorkstreams(later, false, true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unblocked: Checkout',
        actions: [{ label: 'Open', action: 'workstream-show', url: document.id }],
      }),
    );
  });

  it('sends a notice again when its cause cleared and came back', () => {
    notifyWorkstreams(workstreamNotices([document], assessment(['conflict'])), false, true);
    notifyWorkstreams(workstreamNotices([document], assessment([])), false, true);
    notifyWorkstreams(workstreamNotices([document], assessment(['conflict'])), false, true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when turned off in settings', () => {
    notifyWorkstreams(workstreamNotices([document], assessment(['ready'])), false, false);
    expect(send).not.toHaveBeenCalled();
  });
});
