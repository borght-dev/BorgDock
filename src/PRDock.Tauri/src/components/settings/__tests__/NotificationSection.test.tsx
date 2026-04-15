import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationSettings } from '@/types';
import { NotificationSection } from '../NotificationSection';

vi.mock('@/stores/notification-store', () => ({
  useNotificationStore: vi.fn((selector: any) => {
    const state = { show: vi.fn() };
    return selector ? selector(state) : state;
  }),
}));

function makeNotifications(overrides?: Partial<NotificationSettings>): NotificationSettings {
  return {
    toastOnCheckStatusChange: true,
    toastOnNewPR: false,
    toastOnReviewUpdate: true,
    toastOnMergeable: true,
    onlyMyPRs: false,
    reviewNudgeEnabled: true,
    reviewNudgeIntervalMinutes: 60,
    reviewNudgeEscalation: true,
    deduplicationWindowSeconds: 60,
    ...overrides,
  };
}

describe('NotificationSection', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  afterEach(cleanup);

  it('renders all toggle labels', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    expect(screen.getByText('Check status changes')).toBeDefined();
    expect(screen.getByText('New pull requests')).toBeDefined();
    expect(screen.getByText('Review updates')).toBeDefined();
    expect(screen.getByText('PR becomes mergeable')).toBeDefined();
    expect(screen.getByText('Only notify for my PRs')).toBeDefined();
  });

  it('toggles check status changes off', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    const row = screen.getByText('Check status changes').closest('div')!;
    fireEvent.click(row.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ toastOnCheckStatusChange: false }),
    );
  });

  it('toggles new pull requests on', () => {
    render(
      <NotificationSection
        notifications={makeNotifications({ toastOnNewPR: false })}
        onChange={onChange}
      />,
    );
    const row = screen.getByText('New pull requests').closest('div')!;
    fireEvent.click(row.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ toastOnNewPR: true }));
  });

  it('toggles review updates off', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    const row = screen.getByText('Review updates').closest('div')!;
    fireEvent.click(row.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ toastOnReviewUpdate: false }));
  });

  it('toggles PR becomes mergeable off', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    const row = screen.getByText('PR becomes mergeable').closest('div')!;
    fireEvent.click(row.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ toastOnMergeable: false }));
  });

  it('toggles only my PRs on', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    const row = screen.getByText('Only notify for my PRs').closest('div')!;
    fireEvent.click(row.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ onlyMyPRs: true }));
  });

  // Review Reminders
  it('renders review nudge section', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    expect(screen.getByText('Review Reminders')).toBeDefined();
    expect(screen.getByText('Nudge for pending reviews')).toBeDefined();
  });

  it('toggles review nudge off', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    const row = screen.getByText('Nudge for pending reviews').closest('div')!;
    fireEvent.click(row.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ reviewNudgeEnabled: false }));
  });

  it('shows nudge interval when enabled', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    expect(screen.getByText('Remind every')).toBeDefined();
    expect(screen.getByText('Escalate urgency over time')).toBeDefined();
  });

  it('hides nudge interval when disabled', () => {
    render(
      <NotificationSection
        notifications={makeNotifications({ reviewNudgeEnabled: false })}
        onChange={onChange}
      />,
    );
    expect(screen.queryByText('Remind every')).toBeNull();
    expect(screen.queryByText('Escalate urgency over time')).toBeNull();
  });

  it('updates nudge interval', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    const select = screen.getByDisplayValue('1 hour');
    fireEvent.change(select, { target: { value: '120' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ reviewNudgeIntervalMinutes: 120 }),
    );
  });

  it('toggles escalation off', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    const row = screen.getByText('Escalate urgency over time').closest('div')!;
    fireEvent.click(row.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ reviewNudgeEscalation: false }),
    );
  });

  // Test notification buttons
  it('renders test notification buttons', () => {
    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    expect(screen.getByText('Test notification')).toBeDefined();
    // 5 severity buttons: E, S, W, I, M
    expect(screen.getByTitle('Send error notification')).toBeDefined();
    expect(screen.getByTitle('Send success notification')).toBeDefined();
    expect(screen.getByTitle('Send warning notification')).toBeDefined();
    expect(screen.getByTitle('Send info notification')).toBeDefined();
    expect(screen.getByTitle('Send merged notification')).toBeDefined();
  });

  it('fires test notification on click', async () => {
    const { useNotificationStore } = await import('@/stores/notification-store');
    const showMock = vi.fn();
    vi.mocked(useNotificationStore).mockImplementation((selector: any) => {
      const state = { show: showMock };
      return selector ? selector(state) : state;
    });

    render(<NotificationSection notifications={makeNotifications()} onChange={onChange} />);
    fireEvent.click(screen.getByTitle('Send error notification'));
    expect(showMock).toHaveBeenCalledTimes(1);
    expect(showMock).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });
});
