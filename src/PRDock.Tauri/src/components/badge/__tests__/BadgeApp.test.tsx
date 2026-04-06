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

  it('displays failing status text when there are failures', async () => {
    mockListen.mockImplementation(
      async (_event: string, callback: (event: { payload: unknown }) => void) => {
        callback({
          payload: {
            totalPrCount: 3,
            failingCount: 2,
            pendingCount: 0,
            notificationCount: 0,
            myPrs: [],
            teamPrs: [],
          },
        });
        return () => {};
      },
    );

    render(<BadgeApp />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('status-text').textContent).toBe('2 failing');
    });
  });

  it('displays combined failing and pending status', async () => {
    mockListen.mockImplementation(
      async (_event: string, callback: (event: { payload: unknown }) => void) => {
        callback({
          payload: {
            totalPrCount: 5,
            failingCount: 1,
            pendingCount: 2,
            notificationCount: 0,
            myPrs: [],
            teamPrs: [],
          },
        });
        return () => {};
      },
    );

    render(<BadgeApp />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('status-text').textContent).toBe('1 failing, 2 in progress');
    });
  });

  it('displays pending-only status', async () => {
    mockListen.mockImplementation(
      async (_event: string, callback: (event: { payload: unknown }) => void) => {
        callback({
          payload: {
            totalPrCount: 3,
            failingCount: 0,
            pendingCount: 3,
            notificationCount: 0,
            myPrs: [],
            teamPrs: [],
          },
        });
        return () => {};
      },
    );

    render(<BadgeApp />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('status-text').textContent).toBe('3 in progress');
    });
  });

  it('expands to show PR panel when expand chevron is clicked', async () => {
    mockListen.mockImplementation(
      async (_event: string, callback: (event: { payload: unknown }) => void) => {
        callback({
          payload: {
            totalPrCount: 2,
            failingCount: 0,
            pendingCount: 0,
            notificationCount: 0,
            myPrs: [
              {
                number: 1,
                title: 'My PR',
                repoOwner: 'owner',
                repoName: 'repo',
                statusColor: 'green',
                timeAgo: '1h',
              },
            ],
            teamPrs: [],
          },
        });
        return () => {};
      },
    );

    render(<BadgeApp />);
    await vi.waitFor(() => {
      expect(screen.getByTestId('badge-expand-chevron')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('badge-expand-chevron'));

    await vi.waitFor(() => {
      expect(screen.getByText('MY PRS')).toBeDefined();
      expect(screen.getByText('TEAM')).toBeDefined();
      expect(screen.getByText('My PR')).toBeDefined();
    });
  });

  it('collapses expanded panel when chevron is clicked again', async () => {
    render(<BadgeApp />);

    const expandBtn = screen.getByTestId('badge-expand-chevron');

    // Expand
    fireEvent.click(expandBtn);
    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('resize_badge', expect.objectContaining({ width: 680 }));
    });

    // Collapse
    fireEvent.click(expandBtn);
    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('resize_badge', expect.objectContaining({ width: 340, height: 48 }));
    });
  });

  it('shows "None" in PR columns when there are no PRs', async () => {
    render(<BadgeApp />);
    const expandBtn = screen.getByTestId('badge-expand-chevron');
    fireEvent.click(expandBtn);

    await vi.waitFor(() => {
      const nones = screen.getAllByText('None');
      expect(nones.length).toBe(2);
    });
  });

  it('opens PR when clicking on a PR item in expanded view', async () => {
    mockListen.mockImplementation(
      async (_event: string, callback: (event: { payload: unknown }) => void) => {
        callback({
          payload: {
            totalPrCount: 1,
            failingCount: 0,
            pendingCount: 0,
            notificationCount: 0,
            myPrs: [
              {
                number: 42,
                title: 'Click Me',
                repoOwner: 'owner',
                repoName: 'repo',
                statusColor: 'green',
                timeAgo: '2h',
              },
            ],
            teamPrs: [],
          },
        });
        return () => {};
      },
    );

    render(<BadgeApp />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('badge-expand-chevron')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('badge-expand-chevron'));

    await vi.waitFor(() => {
      expect(screen.getByText('Click Me')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Click Me'));

    await vi.waitFor(() => {
      expect(mockEmitTo).toHaveBeenCalledWith('main', 'open-pr-detail', {
        number: 42,
        repoOwner: 'owner',
        repoName: 'repo',
      });
    });
  });

  it('applies theme from badge-update event', async () => {
    mockListen.mockImplementation(
      async (_event: string, callback: (event: { payload: unknown }) => void) => {
        callback({
          payload: {
            totalPrCount: 0,
            failingCount: 0,
            pendingCount: 0,
            notificationCount: 0,
            myPrs: [],
            teamPrs: [],
            theme: 'dark',
          },
        });
        return () => {};
      },
    );

    render(<BadgeApp />);

    await vi.waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('shows failing and pending counts in expanded footer', async () => {
    mockListen.mockImplementation(
      async (_event: string, callback: (event: { payload: unknown }) => void) => {
        callback({
          payload: {
            totalPrCount: 5,
            failingCount: 2,
            pendingCount: 1,
            notificationCount: 0,
            myPrs: [],
            teamPrs: [],
          },
        });
        return () => {};
      },
    );

    render(<BadgeApp />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('badge-expand-chevron')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('badge-expand-chevron'));

    await vi.waitFor(() => {
      expect(screen.getByText('5 total')).toBeDefined();
      expect(screen.getByText('2 failing')).toBeDefined();
      expect(screen.getByText('1 pending')).toBeDefined();
    });
  });

  it('shows checks text badge on PR items', async () => {
    mockListen.mockImplementation(
      async (_event: string, callback: (event: { payload: unknown }) => void) => {
        callback({
          payload: {
            totalPrCount: 1,
            failingCount: 0,
            pendingCount: 0,
            notificationCount: 0,
            myPrs: [
              {
                number: 1,
                title: 'With Checks',
                repoOwner: 'o',
                repoName: 'r',
                statusColor: 'green',
                timeAgo: '1h',
                checksText: '3/3',
              },
            ],
            teamPrs: [],
          },
        });
        return () => {};
      },
    );

    render(<BadgeApp />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('badge-expand-chevron')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('badge-expand-chevron'));

    await vi.waitFor(() => {
      expect(screen.getByText('3/3')).toBeDefined();
    });
  });

  it('handles expand direction "up" from invoke', async () => {
    mockInvoke.mockResolvedValue('up');

    render(<BadgeApp />);

    const expandBtn = screen.getByTestId('badge-expand-chevron');
    fireEvent.click(expandBtn);

    await vi.waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('resize_badge', expect.objectContaining({ anchor: 'auto' }));
    });
  });
});
