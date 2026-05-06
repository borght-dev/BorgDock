import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActionBar } from '../ActionBar';
import type { PrActions } from '../usePrActions';

function fakeActions(over: Partial<PrActions> = {}): PrActions {
  return {
    onMerge: vi.fn(),
    onBypassConfirm: vi.fn(),
    onBypassExecute: vi.fn(),
    onCloseConfirm: vi.fn(),
    onCloseExecute: vi.fn(),
    onToggleDraft: vi.fn(),
    onResolveConflicts: vi.fn(),
    onOpenInBrowser: vi.fn(),
    onCopyBranch: vi.fn(),
    onCheckoutToggle: vi.fn(),
    actionStatus: '',
    isReady: true,
    checkoutOpen: false,
    setCheckoutOpen: vi.fn(),
    confirmClose: false,
    setConfirmClose: vi.fn(),
    confirmBypass: false,
    setConfirmBypass: vi.fn(),
    repoPath: '',
    worktreeSubfolder: '.worktrees',
    favoritePaths: undefined,
    favoritesOnlyDefault: false,
    windowsTerminalProfile: undefined,
    ...over,
  };
}

describe('ActionBar', () => {
  it('renders Merge / Open / Copy / Checkout / Mark Draft when PR is open', () => {
    render(
      <ActionBar
        actions={fakeActions()}
        prState="open"
        isDraft={false}
        mergeable
      />,
    );
    expect(screen.getByRole('button', { name: /^merge$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open in browser/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy branch/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /checkout/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark draft/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bypass merge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close pr/i })).toBeInTheDocument();
  });

  it('shows "Mark Ready" when PR is currently a draft', () => {
    render(<ActionBar actions={fakeActions()} prState="open" isDraft mergeable />);
    expect(screen.getByRole('button', { name: /mark ready/i })).toBeInTheDocument();
  });

  it('shows Resolve Conflicts only when mergeable is false', () => {
    const { rerender } = render(
      <ActionBar actions={fakeActions()} prState="open" isDraft={false} mergeable />,
    );
    expect(screen.queryByRole('button', { name: /resolve conflicts/i })).toBeNull();
    rerender(
      <ActionBar actions={fakeActions()} prState="open" isDraft={false} mergeable={false} />,
    );
    expect(screen.getByRole('button', { name: /resolve conflicts/i })).toBeInTheDocument();
  });

  it('hides destructive + draft actions when PR is closed', () => {
    render(
      <ActionBar actions={fakeActions()} prState="closed" isDraft={false} mergeable />,
    );
    expect(screen.queryByRole('button', { name: /merge/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /bypass merge/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /close pr/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /mark draft/i })).toBeNull();
    expect(screen.getByRole('button', { name: /open in browser/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy branch/i })).toBeInTheDocument();
  });

  it('Merge button is disabled when isReady=false', () => {
    render(
      <ActionBar
        actions={fakeActions({ isReady: false })}
        prState="open"
        isDraft={false}
        mergeable
      />,
    );
    expect(screen.getByRole('button', { name: /^merge$/i })).toBeDisabled();
  });
});
