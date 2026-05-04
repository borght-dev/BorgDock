import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationSettings } from '@/types';
import { NotificationSection } from '../NotificationSection';

function makeNotifications(overrides?: Partial<NotificationSettings>): NotificationSettings {
  return {
    toastOnCheckStatusChange: true,
    toastOnNewPR: false,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    onlyMyPRs: false,
    playMergeSound: true,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
    channels: { tray: true, system: true, sound: true, emailDigest: false },
    ...overrides,
  };
}

describe('NotificationSection', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  afterEach(cleanup);

  // 1. Renders all 6 ToggleRows in "What to notify me about"
  it('renders all 6 toggle rows in What to notify me about', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    expect(screen.getByRole('switch', { name: 'Check status changes' })).toBeDefined();
    expect(screen.getByRole('switch', { name: 'New pull requests' })).toBeDefined();
    expect(screen.getByRole('switch', { name: 'Review updates' })).toBeDefined();
    expect(screen.getByRole('switch', { name: 'PR becomes mergeable' })).toBeDefined();
    expect(screen.getByRole('switch', { name: 'Play sound on merge' })).toBeDefined();
    expect(screen.getByRole('switch', { name: 'Only notify for my PRs' })).toBeDefined();
  });

  // 2. Clicking the first toggle (check status) calls onChange
  it('clicking check status toggle calls onChange with toggled value', () => {
    render(<NotificationSection notifications={makeNotifications({ toastOnCheckStatusChange: true })} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Check status changes' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ toastOnCheckStatusChange: false }),
    );
  });

  // 3. Renders the Select for "Remind every" with current value
  it('renders Review nudge interval select with current value', () => {
    render(<NotificationSection notifications={makeNotifications({ reviewNudgeIntervalMinutes: 60 })} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Review nudge interval' }) as HTMLSelectElement;
    expect(select.value).toBe('60');
  });

  it('changing the remind-every select calls onChange with new interval', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Review nudge interval' });
    fireEvent.change(select, { target: { value: '120' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ reviewNudgeIntervalMinutes: 120 }),
    );
  });

  // 4. Channel chips render and toggle on click
  it('renders all 4 channel chips', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    expect(screen.getByText('Tray balloon')).toBeDefined();
    expect(screen.getByText('System (toast)')).toBeDefined();
    expect(screen.getByText('Sound')).toBeDefined();
    expect(screen.getByText('Email digest')).toBeDefined();
  });

  it('channel chip reflects aria-pressed state', () => {
    render(<NotificationSection notifications={makeNotifications({ channels: { tray: true, system: false, sound: true, emailDigest: false } })} onChange={onChange} />);
    expect(screen.getByText('Tray balloon').closest('button')!.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('System (toast)').closest('button')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking a channel chip calls onChange with toggled channel', () => {
    render(<NotificationSection notifications={makeNotifications({ channels: { tray: true, system: false, sound: true, emailDigest: false } })} onChange={onChange} />);
    fireEvent.click(screen.getByText('System (toast)').closest('button')!);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: expect.objectContaining({ system: true }),
      }),
    );
  });

  // 5. Test notification button updates lastTestFiredAt
  it('Test notification button calls onChange with lastTestFiredAt set', () => {
    const before = Date.now();
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Test notification'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const called = onChange.mock.calls[0]![0] as NotificationSettings;
    expect(typeof called.lastTestFiredAt).toBe('number');
    expect(called.lastTestFiredAt!).toBeGreaterThanOrEqual(before);
  });

  it('shows elapsed time when lastTestFiredAt is set', () => {
    render(
      <NotificationSection
        notifications={makeNotifications({ lastTestFiredAt: Date.now() - 5000 })}
        onChange={onChange}
      />,
    );
    expect(screen.getByText(/last fired \d+s ago/)).toBeDefined();
  });

  // Review reminders section
  it('renders review reminders section header', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    expect(screen.getByText('Review reminders')).toBeDefined();
    expect(screen.getByRole('switch', { name: 'Nudge for pending reviews' })).toBeDefined();
  });

  it('toggles review nudge off', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Nudge for pending reviews' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ reviewNudgeEnabled: false }));
  });

  it('renders escalation toggle', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    expect(screen.getByRole('switch', { name: 'Escalate urgency over time' })).toBeDefined();
  });

  it('toggles escalation off', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Escalate urgency over time' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ reviewNudgeEscalation: false }),
    );
  });
});
