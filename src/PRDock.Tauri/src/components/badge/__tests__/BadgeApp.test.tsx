import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BadgeApp } from '../BadgeApp';

// Mock Tauri event APIs
const mockListen = vi.fn().mockResolvedValue(() => {});
const mockEmit = vi.fn().mockResolvedValue(undefined);
const mockEmitTo = vi.fn().mockResolvedValue(undefined);
const mockInvoke = vi.fn().mockResolvedValue('down');

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => mockListen(...args),
  emit: (...args: unknown[]) => mockEmit(...args),
  emitTo: (...args: unknown[]) => mockEmitTo(...args),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock BadgeStyles to simplify badge rendering
vi.mock('../BadgeStyles', () => ({
  badgeStyleMap: {
    GlassCapsule: ({
      totalPrCount,
      statusText,
      onClick,
      onToggleExpand,
    }: {
      totalPrCount: number;
      statusText: string;
      onClick: () => void;
      onToggleExpand?: () => void;
    }) => (
      <div data-testid="badge-style">
        <span data-testid="pr-count">{totalPrCount}</span>
        <span data-testid="status-text">{statusText}</span>
        <button data-testid="badge-open-sidebar" onClick={onClick}>
          Open
        </button>
        {onToggleExpand && (
          <button data-testid="badge-expand-chevron" onClick={onToggleExpand}>
            Expand
          </button>
        )}
      </div>
    ),
  },
}));

describe('BadgeApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with default data showing 0 PRs', () => {
    render(<BadgeApp />);
    expect(screen.getByTestId('pr-count').textContent).toBe('0');
    expect(screen.getByTestId('status-text').textContent).toBe('all clear');
  });

  it('sets up badge-update listener on mount', async () => {
    render(<BadgeApp />);
    // Wait for async setup
    await vi.waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('badge-update', expect.any(Function));
    });
  });

  it('emits badge-request-data after setting up listener', async () => {
    render(<BadgeApp />);
    await vi.waitFor(() => {
      expect(mockEmit).toHaveBeenCalledWith('badge-request-data', {});
    });
  });

  it('calls toggle_sidebar and hide_badge when opening sidebar', async () => {
    render(<BadgeApp />);
    const openBtn = screen.getByTestId('badge-open-sidebar');
    fireEvent.click(openBtn);

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('resize_badge', { width: 340, height: 48 });
      expect(mockInvoke).toHaveBeenCalledWith('toggle_sidebar');
      expect(mockInvoke).toHaveBeenCalledWith('hide_badge');
    });
  });

  it('shows notification count badge when notifications > 0', async () => {
    mockListen.mockImplementation(
      async (_event: string, callback: (event: { payload: unknown }) => void) => {
        callback({
          payload: {
            totalPrCount: 5,
            failingCount: 1,
            pendingCount: 0,
            notificationCount: 3,
            myPrs: [],
            teamPrs: [],
          },
        });
        return () => {};
      },
    );

    render(<BadgeApp />);
    await vi.waitFor(() => {
      expect(screen.getByText('3')).toBeDefined();
    });
  });

  it('does not show notification badge when count is 0', () => {
    render(<BadgeApp />);
    // Default notificationCount is 0; no badge should appear
    const badges = document.querySelectorAll('[class*="animate-"]');
    expect(badges.length).toBe(0);
  });

  it('displays "all clear" status when no failures or pending', () => {
    render(<BadgeApp />);
    expect(screen.getByTestId('status-text').textContent).toBe('all clear');
  });
});
