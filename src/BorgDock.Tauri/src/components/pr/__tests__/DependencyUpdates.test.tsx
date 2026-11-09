import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { holdMock } = vi.hoisted(() => ({ holdMock: vi.fn() }));

vi.mock('@/services/dependency-approve', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/dependency-approve')>()),
  holdDependencyApprovals: holdMock,
}));

import { useDependencyUpdatesStore } from '@/stores/dependency-updates-store';
import { usePrStore } from '@/stores/pr-store';
import { FIXTURE_ME, listPr } from '../__fixtures__/pr-list-data';
import { DependencySheetHost, DependencyStrip } from '../DependencyUpdates';

const bot = (number: number, title: string) =>
  listPr({ number, title, repo: 'acme/web', author: 'dependabot' });

const LODASH = bot(1, 'Bump lodash from 4.17.20 to 4.17.21');
const VITEST = bot(2, 'Bump vitest from 3.1.1 to 3.2.0');
const ROUTER = bot(3, 'Bump react-router from 6.30.0 to 7.6.1');
const AXUM = listPr({
  number: 4,
  title: 'Update dependency axum to v0.8.4',
  repo: 'acme/api',
  author: 'renovate',
  mergeable: false,
});
const HUMAN = listPr({
  number: 5,
  title: 'Planner: drag a visit',
  repo: 'acme/web',
  author: 'mira',
});

function seed(prs = [LODASH, VITEST, ROUTER, AXUM, HUMAN]) {
  usePrStore.setState({ pullRequests: prs, username: FIXTURE_ME });
}

function box(name: RegExp): HTMLInputElement {
  return screen.getByRole('checkbox', { name }) as HTMLInputElement;
}

beforeEach(() => {
  holdMock.mockReset();
  useDependencyUpdatesStore.setState({ sheetOpen: false, pending: new Set() });
  localStorage.removeItem('borgdock-dependency-merge');
});
afterEach(cleanup);

describe('DependencyStrip', () => {
  it('stays away while no dependency PR can be approved', () => {
    seed([HUMAN, AXUM]);
    const { container } = render(<DependencyStrip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('counts the updates and opens the sheet', () => {
    seed();
    render(<DependencyStrip />);
    expect(screen.getByText('4 dependency updates')).toBeInTheDocument();
    expect(screen.getByText('2 ready to approve · 1 major · 1 with conflicts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve 2…' }));
    expect(useDependencyUpdatesStore.getState().sheetOpen).toBe(true);
  });

  it('leaves out updates whose approval waits for Undo', () => {
    seed();
    useDependencyUpdatesStore.setState({ pending: new Set(['acme/web#1', 'acme/web#2']) });
    render(<DependencyStrip />);
    expect(screen.getByText('2 dependency updates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve…' })).toBeInTheDocument();
  });
});

describe('DependencyApproveSheet', () => {
  function open() {
    seed();
    useDependencyUpdatesStore.setState({ sheetOpen: true });
    render(<DependencySheetHost />);
  }

  it('picks the safe updates and lists the rest with the reason', () => {
    open();
    expect(box(/^lodash/)).toBeChecked();
    expect(box(/^vitest/)).toBeChecked();
    expect(box(/^react-router/)).not.toBeChecked();
    expect(screen.getByText('Major update: read its release notes first')).toBeInTheDocument();
    expect(box(/^axum/)).toBeDisabled();
    expect(screen.getByText('Has conflicts: the bot rebases it')).toBeInTheDocument();
    expect(screen.queryByText(/Planner/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve 2' })).toBeEnabled();
  });

  it('picks all, none, or by hand', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'All 3' }));
    expect(box(/^react-router/)).toBeChecked();
    expect(screen.getByRole('button', { name: 'Approve 3' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(screen.getByRole('button', { name: 'Approve 0' })).toBeDisabled();
    fireEvent.click(box(/^vitest/));
    expect(screen.getByRole('button', { name: 'Approve 1' })).toBeEnabled();
  });

  it('hands the picked PRs to the Undo toast, remembers Merge, and closes', () => {
    open();
    fireEvent.click(screen.getByRole('switch', { name: 'Merge when checks pass' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve 2' }));
    expect(holdMock).toHaveBeenCalledWith([LODASH, VITEST], false);
    expect(localStorage.getItem('borgdock-dependency-merge')).toBe('false');
    expect(useDependencyUpdatesStore.getState().sheetOpen).toBe(false);
  });

  it('closes on Escape without approving', () => {
    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(useDependencyUpdatesStore.getState().sheetOpen).toBe(false);
    expect(holdMock).not.toHaveBeenCalled();
  });
});
