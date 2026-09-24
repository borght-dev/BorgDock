import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('@/components/focus', () => ({ FocusList: () => <div>focus body</div> }));
vi.mock('@/components/pr/PrList', () => ({ PrList: () => <div>prs body</div> }));
vi.mock('@/components/work-items/WorkItemsSection', () => ({
  WorkItemsSection: () => <div>workitems body</div>,
}));
vi.mock('@/components/worktree/WorktreesSection', () => ({
  WorktreesSection: () => <div>worktrees body</div>,
}));

import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import { SectionView } from '../SectionView';

function setLayoutV3(layoutV3: boolean) {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, ui: { ...s.settings.ui, layoutV3 } },
  }));
}

function pane(text: string) {
  return screen.getByText(text).closest('.bd-section');
}

/**
 * jsdom has no AnimationEvent, so React listens for the vendor-prefixed
 * name; fire both so the handler runs either way.
 */
function endAnimation(el: Element) {
  fireEvent.animationEnd(el);
  fireEvent(el, new Event('webkitAnimationEnd', { bubbles: true }));
}

describe('SectionView', () => {
  beforeEach(() => {
    useUiStore.setState({ activeSection: 'focus' });
    setLayoutV3(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.classList.remove('reduce-motion');
  });

  it.each([
    ['focus', 'focus body'],
    ['prs', 'prs body'],
    ['workitems', 'workitems body'],
    ['worktrees', 'worktrees body'],
  ] as const)('renders the %s section', (section, text) => {
    useUiStore.setState({ activeSection: section });
    render(<SectionView />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('does not animate on first render', () => {
    render(<SectionView />);
    expect(pane('focus body')).not.toHaveClass('bd-section--entering');
  });

  it('crossfades: the old section leaves while the new one enters, then the old one goes', () => {
    vi.useFakeTimers();
    render(<SectionView />);
    act(() => useUiStore.getState().setActiveSection('prs'));

    expect(pane('prs body')).toHaveClass('bd-section--entering');
    const leaving = pane('focus body');
    expect(leaving).toHaveClass('bd-section--leaving');
    expect(leaving).toHaveAttribute('inert');

    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByText('focus body')).not.toBeInTheDocument();
    expect(pane('prs body')).not.toHaveClass('bd-section--entering');
  });

  it('drops the old section as soon as its leave animation ends', () => {
    render(<SectionView />);
    act(() => useUiStore.getState().setActiveSection('prs'));
    const leaving = pane('focus body') as HTMLElement;
    endAnimation(leaving);
    expect(screen.queryByText('focus body')).not.toBeInTheDocument();
  });

  it('ignores animationend bubbling up from inside the old section', () => {
    render(<SectionView />);
    act(() => useUiStore.getState().setActiveSection('prs'));
    endAnimation(screen.getByText('focus body'));
    expect(screen.getByText('focus body')).toBeInTheDocument();
  });

  it('swaps instantly under reduced motion', () => {
    document.documentElement.classList.add('reduce-motion');
    render(<SectionView />);
    act(() => useUiStore.getState().setActiveSection('prs'));
    expect(screen.queryByText('focus body')).not.toBeInTheDocument();
    expect(pane('prs body')).not.toHaveClass('bd-section--entering');
  });

  describe('tab layout (layoutV3 off)', () => {
    beforeEach(() => setLayoutV3(false));

    it('switches sections instantly, with no overlapping mount', () => {
      render(<SectionView />);
      act(() => useUiStore.getState().setActiveSection('prs'));
      expect(screen.queryByText('focus body')).not.toBeInTheDocument();
      expect(document.querySelectorAll('.bd-section')).toHaveLength(1);
      expect(pane('prs body')).not.toHaveClass('bd-section--entering');
    });

    it('shows Focus for a saved Worktrees section, which has no tab', () => {
      useUiStore.setState({ activeSection: 'worktrees' });
      render(<SectionView />);
      expect(screen.getByText('focus body')).toBeInTheDocument();
      expect(screen.queryByText('worktrees body')).not.toBeInTheDocument();
    });
  });
});
