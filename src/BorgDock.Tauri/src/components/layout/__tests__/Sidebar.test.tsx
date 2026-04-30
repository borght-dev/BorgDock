import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrStore } from '@/stores/pr-store';
import { useUiStore } from '@/stores/ui-store';
import { makePr } from '@/test-utils/make-pr';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    toggleMaximize: vi.fn(),
    startDragging: vi.fn(() => Promise.resolve()),
  })),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ get: vi.fn(), set: vi.fn(), save: vi.fn() })),
}));

vi.mock('../Header', () => ({
  Header: () => <div data-testid="header">Header</div>,
}));

vi.mock('../FilterBar', () => ({
  FilterBar: () => <div data-testid="filter-bar">FilterBar</div>,
}));

vi.mock('../SearchBar', () => ({
  SearchBar: () => <div data-testid="search-bar">SearchBar</div>,
}));

vi.mock('../StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar">StatusBar</div>,
}));

vi.mock('@/components/pr-detail/PrDetailPanel', () => ({
  PrDetailPanel: ({ pr }: { pr: { pullRequest: { number: number } } }) => (
    <div data-testid="pr-detail-panel">Detail for PR #{pr.pullRequest.number}</div>
  ),
}));

vi.mock('@/components/onboarding', () => ({
  FeatureBadge: () => null,
}));

import { Sidebar } from '../Sidebar';

describe('Sidebar', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({
      activeSection: 'prs',
      selectedPrNumber: null,
    });
    usePrStore.setState({
      pullRequests: [makePr(1), makePr(2)],
      closedPullRequests: [],
      username: '',
    });
  });

  it('renders Header and StatusBar', () => {
    render(
      <Sidebar>
        <div>children</div>
      </Sidebar>,
    );
    expect(screen.getByTestId('header')).toBeTruthy();
    expect(screen.getByTestId('status-bar')).toBeTruthy();
  });

  it('shows children when no PR is selected', () => {
    render(
      <Sidebar>
        <div data-testid="child-content">My child</div>
      </Sidebar>,
    );
    expect(screen.getByTestId('child-content')).toBeTruthy();
  });

  it('shows FilterBar and SearchBar when on prs section with no selected PR', () => {
    render(
      <Sidebar>
        <div>children</div>
      </Sidebar>,
    );
    expect(screen.getByTestId('filter-bar')).toBeTruthy();
    expect(screen.getByTestId('search-bar')).toBeTruthy();
  });

  it('hides FilterBar and SearchBar when on a non-prs section', () => {
    useUiStore.setState({ activeSection: 'focus' });
    render(
      <Sidebar>
        <div>children</div>
      </Sidebar>,
    );
    expect(screen.queryByTestId('filter-bar')).toBeNull();
    expect(screen.queryByTestId('search-bar')).toBeNull();
  });

  it('shows PrDetailPanel when a PR is selected', () => {
    useUiStore.setState({ selectedPrNumber: 1 });
    render(
      <Sidebar>
        <div data-testid="child-content">My child</div>
      </Sidebar>,
    );
    expect(screen.getByTestId('pr-detail-panel')).toBeTruthy();
    expect(screen.getByText('Detail for PR #1')).toBeTruthy();
    expect(screen.queryByTestId('child-content')).toBeNull();
  });

  it('hides FilterBar and SearchBar when a PR is selected', () => {
    useUiStore.setState({ selectedPrNumber: 1 });
    render(
      <Sidebar>
        <div>children</div>
      </Sidebar>,
    );
    expect(screen.queryByTestId('filter-bar')).toBeNull();
    expect(screen.queryByTestId('search-bar')).toBeNull();
  });

  it('shows children when selectedPrNumber does not match any PR', () => {
    useUiStore.setState({ selectedPrNumber: 999 });
    render(
      <Sidebar>
        <div data-testid="child-content">My child</div>
      </Sidebar>,
    );
    expect(screen.getByTestId('child-content')).toBeTruthy();
    expect(screen.queryByTestId('pr-detail-panel')).toBeNull();
  });

  it('renders the sidebar shell container', () => {
    const { container } = render(
      <Sidebar>
        <div>children</div>
      </Sidebar>,
    );
    expect(container.querySelector('.sidebar-shell')).toBeTruthy();
  });
});
