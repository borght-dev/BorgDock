import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FloatingBadge } from '../FloatingBadge';
import type { BadgePrItem } from '../FloatingBadge';

// Mock Tauri core API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const makePrItem = (overrides: Partial<BadgePrItem> = {}): BadgePrItem => ({
  title: 'Fix bug in auth',
  number: 42,
  timeAgo: '2h ago',
  statusColor: 'green',
  isInProgress: false,
  repoOwner: 'owner',
  repoName: 'repo',
  ...overrides,
});

const defaultProps = {
  totalPrCount: 3,
  failingCount: 0,
  pendingCount: 0,
  statusColor: 'green' as const,
  statusText: 'all clear',
  onExpandSidebar: vi.fn(),
  myPrs: [] as BadgePrItem[],
  teamPrs: [] as BadgePrItem[],
  onOpenPr: vi.fn(),
};

describe('FloatingBadge', () => {
  it('renders PR count', () => {
    render(<FloatingBadge {...defaultProps} />);
    expect(screen.getByText('3')).toBeDefined();
  });

  it('renders status text', () => {
    render(<FloatingBadge {...defaultProps} statusText="1 failing" />);
    expect(screen.getByText('1 failing')).toBeDefined();
  });

  it('renders PRs label', () => {
    render(<FloatingBadge {...defaultProps} />);
    expect(screen.getByText('PRs')).toBeDefined();
  });

  it('calls onExpandSidebar when left section is clicked', () => {
    const onExpandSidebar = vi.fn();
    render(<FloatingBadge {...defaultProps} onExpandSidebar={onExpandSidebar} />);
    const buttons = document.querySelectorAll('button');
    // First button is the left section
    fireEvent.click(buttons[0]!);
    expect(onExpandSidebar).toHaveBeenCalledTimes(1);
  });

  it('starts collapsed (no expanded panel)', () => {
    render(<FloatingBadge {...defaultProps} />);
    expect(screen.queryByText('MY PRS')).toBeNull();
    expect(screen.queryByText('TEAM')).toBeNull();
  });

  it('expands when chevron is clicked', () => {
    render(
      <FloatingBadge
        {...defaultProps}
        myPrs={[makePrItem({ title: 'My PR' })]}
        teamPrs={[makePrItem({ title: 'Team PR' })]}
      />,
    );

    // Click the chevron (last button)
    const buttons = document.querySelectorAll('button');
    const chevron = buttons[buttons.length - 1]!;
    fireEvent.click(chevron);

    expect(screen.getByText('MY PRS')).toBeDefined();
    expect(screen.getByText('TEAM')).toBeDefined();
  });

  it('shows PR items in expanded panel', () => {
    render(
      <FloatingBadge
        {...defaultProps}
        myPrs={[makePrItem({ title: 'Fix auth bug', number: 42, timeAgo: '2h ago' })]}
        teamPrs={[]}
      />,
    );

    // Expand
    const buttons = document.querySelectorAll('button');
    fireEvent.click(buttons[buttons.length - 1]!);

    expect(screen.getByText('Fix auth bug')).toBeDefined();
    expect(screen.getByText('#42 2h ago')).toBeDefined();
  });

  it('shows "None" for empty PR columns', () => {
    render(<FloatingBadge {...defaultProps} myPrs={[]} teamPrs={[]} />);

    // Expand
    const buttons = document.querySelectorAll('button');
    fireEvent.click(buttons[buttons.length - 1]!);

    const noneElements = screen.getAllByText('None');
    expect(noneElements).toHaveLength(2); // MY PRS and TEAM both show None
  });

  it('calls onOpenPr when a PR item is clicked', () => {
    const onOpenPr = vi.fn();
    const prItem = makePrItem({ title: 'Click me' });
    render(
      <FloatingBadge
        {...defaultProps}
        myPrs={[prItem]}
        teamPrs={[]}
        onOpenPr={onOpenPr}
      />,
    );

    // Expand
    const buttons = document.querySelectorAll('button');
    fireEvent.click(buttons[buttons.length - 1]!);

    // Click the PR item
    fireEvent.click(screen.getByText('Click me'));
    expect(onOpenPr).toHaveBeenCalledWith(prItem);
  });

  it('shows checks text badge when present', () => {
    render(
      <FloatingBadge
        {...defaultProps}
        myPrs={[makePrItem({ checksText: '2/3' })]}
        teamPrs={[]}
      />,
    );

    // Expand
    const buttons = document.querySelectorAll('button');
    fireEvent.click(buttons[buttons.length - 1]!);

    expect(screen.getByText('2/3')).toBeDefined();
  });

  it('shows footer summary with total count', () => {
    render(<FloatingBadge {...defaultProps} totalPrCount={5} />);

    // Expand
    const buttons = document.querySelectorAll('button');
    fireEvent.click(buttons[buttons.length - 1]!);

    expect(screen.getByText('5 total')).toBeDefined();
  });

  it('shows failing count in footer when > 0', () => {
    render(<FloatingBadge {...defaultProps} failingCount={2} />);

    // Expand
    const buttons = document.querySelectorAll('button');
    fireEvent.click(buttons[buttons.length - 1]!);

    expect(screen.getByText('2 failing')).toBeDefined();
  });

  it('shows pending count in footer when > 0', () => {
    render(<FloatingBadge {...defaultProps} pendingCount={1} />);

    // Expand
    const buttons = document.querySelectorAll('button');
    fireEvent.click(buttons[buttons.length - 1]!);

    expect(screen.getByText('1 pending')).toBeDefined();
  });

  it('uses animated dot for failing (red) status', () => {
    const { container } = render(
      <FloatingBadge {...defaultProps} statusColor="red" />,
    );
    const dot = container.querySelector('[style*="animation"]');
    expect(dot).toBeDefined();
  });

  it('collapses when chevron is clicked again', () => {
    render(
      <FloatingBadge
        {...defaultProps}
        myPrs={[makePrItem()]}
        teamPrs={[]}
      />,
    );

    const buttons = document.querySelectorAll('button');
    const chevron = buttons[buttons.length - 1]!;

    // Expand
    fireEvent.click(chevron);
    expect(screen.getByText('MY PRS')).toBeDefined();

    // Collapse
    fireEvent.click(chevron);
    expect(screen.queryByText('MY PRS')).toBeNull();
  });
});
