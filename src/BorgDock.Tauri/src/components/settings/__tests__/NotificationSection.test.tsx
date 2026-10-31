import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationSettings } from '@/types';
import { DEFAULT_ACTIVITY, NotificationSection } from '../NotificationSection';

vi.mock('@/generated/commands', () => ({
  commands: {
    activityPushTarget: vi.fn(() =>
      Promise.resolve({ status: 'ok', data: { url: null, hasToken: false } }),
    ),
    activityPushSave: vi.fn(() => Promise.resolve({ status: 'ok', data: null })),
    activityPushTest: vi.fn(() => Promise.resolve({ status: 'ok', data: null })),
    phoneLinkState: vi.fn(() =>
      Promise.resolve({ status: 'ok', data: { linked: false, server: null, serverName: null } }),
    ),
  },
}));

function makeNotifications(overrides?: Partial<NotificationSettings>): NotificationSettings {
  return {
    toastOnNewPR: false,
    onlyMyPRs: false,
    playMergeSound: true,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
    channels: { sound: true },
    activity: DEFAULT_ACTIVITY,
    ...overrides,
  };
}

describe('NotificationSection', () => {
  let onChange: ReturnType<typeof vi.fn<(n: NotificationSettings) => void>>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  afterEach(cleanup);

  it('lists every kind of update with its popup default', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    const question = screen.getByRole('checkbox', {
      name: 'Popup: An agent asks a question',
    }) as HTMLInputElement;
    expect(question.checked).toBe(true);
    const reports = screen.getByRole('checkbox', {
      name: "Popup: Vera's reports on your items",
    }) as HTMLInputElement;
    expect(reports.checked).toBe(false);
  });

  it('turning a popup off stores it for that category only', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Popup: An agent finished its turn' }));
    const next = onChange.mock.calls[0]![0];
    expect(next.activity?.categories).toEqual({ 'agent.turn': { popup: false } });
  });

  it('keeps the phone boxes off until push is on', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    const phone = screen.getByRole('checkbox', {
      name: 'Phone: An agent asks a question',
    }) as HTMLInputElement;
    expect(phone.disabled).toBe(true);
    cleanup();
    render(
      <NotificationSection
        notifications={makeNotifications({
          activity: { ...DEFAULT_ACTIVITY, push: { ...DEFAULT_ACTIVITY.push, enabled: true } },
        })}
        onChange={onChange}
      />,
    );
    const enabled = screen.getByRole('checkbox', {
      name: 'Phone: An agent asks a question',
    }) as HTMLInputElement;
    expect(enabled.disabled).toBe(false);
    expect(enabled.checked).toBe(true);
  });

  it('switches seen-in-T3 reads off', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole('switch', { name: "A visit in T3 marks a thread's updates read" }),
    );
    expect(onChange.mock.calls[0]![0].activity?.seenInT3).toBe(false);
  });

  it('switches sounds off', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Sounds' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ channels: { sound: false } }));
  });

  it('renders Review nudge interval select with current value', () => {
    render(
      <NotificationSection
        notifications={makeNotifications({ reviewNudgeIntervalMinutes: 60 })}
        onChange={onChange}
      />,
    );
    const select = screen.getByRole('combobox', {
      name: 'Review nudge interval',
    }) as HTMLSelectElement;
    expect(select.value).toBe('60');
  });

  it('changing the remind-every select calls onChange with new interval', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Review nudge interval' }), {
      target: { value: '120' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ reviewNudgeIntervalMinutes: 120 }),
    );
  });

  it('Test notification button calls onChange with lastTestFiredAt set', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test notification' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ lastTestFiredAt: expect.any(Number) }),
    );
  });

  it('toggles review nudge off', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Nudge for pending reviews' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ reviewNudgeEnabled: false }));
  });

  it('turns push on from the Phone card', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Push to my phone' }));
    expect(onChange.mock.calls[0]![0].activity?.push.enabled).toBe(true);
  });
});
