import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { badgeStyleMap, GlassCapsule, MinimalNotch, FloatingIsland, LiquidMorph, SpectralBar } from '../BadgeStyles';
import type { BadgeStyleProps } from '../BadgeStyles';

// Mock getCurrentWindow for dragging
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    startDragging: vi.fn(),
  })),
}));

const makeProps = (overrides: Partial<BadgeStyleProps> = {}): BadgeStyleProps => ({
  totalPrCount: 5,
  failingCount: 1,
  pendingCount: 1,
  statusColor: 'green',
  statusText: 'all clear',
  onClick: vi.fn(),
  onToggleExpand: vi.fn(),
  isExpanded: false,
  ...overrides,
});

describe('BadgeStyles', () => {

  describe('badgeStyleMap', () => {
    it('contains all 5 badge style variants', () => {
      expect(Object.keys(badgeStyleMap)).toEqual([
        'GlassCapsule',
        'MinimalNotch',
        'FloatingIsland',
        'LiquidMorph',
        'SpectralBar',
      ]);
    });
  });

  describe('GlassCapsule', () => {
    it('renders PR count and status text', () => {
      render(<GlassCapsule {...makeProps()} />);
      expect(screen.getByText('5')).toBeDefined();
      expect(screen.getByText('all clear')).toBeDefined();
    });

    it('calls onClick when sidebar button is clicked', () => {
      const onClick = vi.fn();
      render(<GlassCapsule {...makeProps({ onClick })} />);
      const buttons = screen.getAllByTestId('badge-open-sidebar');
      fireEvent.click(buttons[0]!);
      expect(onClick).toHaveBeenCalled();
    });

    it('renders expand chevron when onToggleExpand is provided', () => {
      render(<GlassCapsule {...makeProps()} />);
      expect(screen.getByTestId('badge-expand-chevron')).toBeDefined();
    });

    it('calls onToggleExpand when chevron is clicked', () => {
      const onToggle = vi.fn();
      render(<GlassCapsule {...makeProps({ onToggleExpand: onToggle })} />);
      fireEvent.click(screen.getByTestId('badge-expand-chevron'));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('renders drag handle', () => {
      render(<GlassCapsule {...makeProps()} />);
      expect(screen.getByTestId('badge-drag-handle')).toBeDefined();
    });

    it('shows X icon when failing (red status)', () => {
      const { container } = render(<GlassCapsule {...makeProps({ statusColor: 'red' })} />);
      const paths = container.querySelectorAll('path');
      const xPath = Array.from(paths).find((p) =>
        p.getAttribute('d')?.includes('M4 4L12 12'),
      );
      expect(xPath).toBeDefined();
    });

    it('shows check icon when green status', () => {
      const { container } = render(<GlassCapsule {...makeProps({ statusColor: 'green' })} />);
      const paths = container.querySelectorAll('path');
      const checkPath = Array.from(paths).find((p) =>
        p.getAttribute('d')?.includes('M3 8L6.5 11.5'),
      );
      expect(checkPath).toBeDefined();
    });

    it('renders PRs label', () => {
      render(<GlassCapsule {...makeProps()} />);
      expect(screen.getByText('PRs')).toBeDefined();
    });
  });

  describe('MinimalNotch', () => {
    it('renders PR count and status text', () => {
      render(<MinimalNotch {...makeProps()} />);
      expect(screen.getByText('5')).toBeDefined();
      expect(screen.getByText('all clear')).toBeDefined();
    });

    it('calls onClick when sidebar button is clicked', () => {
      const onClick = vi.fn();
      render(<MinimalNotch {...makeProps({ onClick })} />);
      fireEvent.click(screen.getByTestId('badge-open-sidebar'));
      expect(onClick).toHaveBeenCalled();
    });

    it('renders check pips based on counts', () => {
      const { container } = render(
        <MinimalNotch {...makeProps({ totalPrCount: 3, failingCount: 1, pendingCount: 1 })} />,
      );
      // 3 total: 1 passing, 1 pending, 1 failing = 3 pips
      const pips = container.querySelectorAll('[style*="height: 12"]');
      expect(pips.length).toBe(3);
    });
  });

  describe('FloatingIsland', () => {
    it('renders PR count and open PRs label', () => {
      render(<FloatingIsland {...makeProps()} />);
      expect(screen.getByText('5')).toBeDefined();
      expect(screen.getByText('open PRs')).toBeDefined();
    });

    it('renders avatar circles', () => {
      render(<FloatingIsland {...makeProps()} />);
      expect(screen.getByText('SC')).toBeDefined();
      expect(screen.getByText('KB')).toBeDefined();
      expect(screen.getByText('TB')).toBeDefined();
    });

    it('renders mini bar chart', () => {
      const { container } = render(
        <FloatingIsland {...makeProps({ totalPrCount: 3, failingCount: 1, pendingCount: 0 })} />,
      );
      const barDivs = Array.from(container.querySelectorAll('div')).filter(
        (d) => d.className.includes('w-[3px]') && d.className.includes('rounded-sm'),
      );
      expect(barDivs.length).toBe(3);
    });
  });

  describe('LiquidMorph', () => {
    it('renders PR count inside blob', () => {
      render(<LiquidMorph {...makeProps()} />);
      expect(screen.getByText('5')).toBeDefined();
    });

    it('renders "Open PRs" text', () => {
      render(<LiquidMorph {...makeProps()} />);
      expect(screen.getByText('Open PRs')).toBeDefined();
    });

    it('shows FIX tag when failing', () => {
      render(<LiquidMorph {...makeProps({ statusColor: 'red' })} />);
      expect(screen.getByText('FIX')).toBeDefined();
    });

    it('shows OK tag when not failing', () => {
      render(<LiquidMorph {...makeProps({ statusColor: 'green' })} />);
      expect(screen.getByText('OK')).toBeDefined();
    });
  });

  describe('SpectralBar', () => {
    it('renders PR count with label', () => {
      render(<SpectralBar {...makeProps()} />);
      expect(screen.getByText('5 PRs')).toBeDefined();
    });

    it('renders check pips', () => {
      const { container } = render(
        <SpectralBar {...makeProps({ totalPrCount: 4, failingCount: 1, pendingCount: 1 })} />,
      );
      const allDivs = container.querySelectorAll('div');
      const pips = Array.from(allDivs).filter(
        (d) => d.className.includes('w-[6px]') && d.className.includes('h-[6px]'),
      );
      expect(pips.length).toBe(4);
    });

    it('renders progress bar', () => {
      const { container } = render(
        <SpectralBar {...makeProps({ totalPrCount: 4, failingCount: 1, pendingCount: 1 })} />,
      );
      const progressBar = container.querySelector('[style*="width: 50%"]');
      expect(progressBar).toBeDefined();
    });
  });

  describe('ExpandChevron', () => {
    it('does not render when onToggleExpand is not provided', () => {
      render(<GlassCapsule {...makeProps({ onToggleExpand: undefined })} />);
      expect(screen.queryByTestId('badge-expand-chevron')).toBeNull();
    });

    it('has rotate-180 class when expanded', () => {
      render(<GlassCapsule {...makeProps({ isExpanded: true })} />);
      const chevron = screen.getByTestId('badge-expand-chevron');
      const rotatedChild = chevron.querySelector('[class*="rotate-180"]');
      expect(rotatedChild).toBeDefined();
    });
  });
});
