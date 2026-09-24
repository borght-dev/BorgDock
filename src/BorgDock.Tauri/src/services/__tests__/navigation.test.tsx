import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(() => Promise.resolve()),
  readFromTauriStore: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock('@/components/layout/SectionView', () => ({
  SectionView: () => (
    <div>
      <button type="button">Row 7</button>
    </div>
  ),
}));

import { ViewStack } from '@/components/layout/ViewStack';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { type MainView, useUiStore } from '@/stores/ui-store';
import { isOverlayOpen, popView, pushView, showSection } from '../navigation';

const PR: MainView = { kind: 'pr-detail', owner: 'octo', repo: 'app', number: 42 };
const WI: MainView = { kind: 'work-item-detail', id: 9 };
const doc = document as unknown as { startViewTransition?: unknown };

function listLayer() {
  return document.querySelector('.bd-viewstack__list') as HTMLElement;
}

describe('navigation', () => {
  beforeEach(() => {
    useUiStore.setState({ viewStack: [{ kind: 'list' }], activeSection: 'prs' });
    useQuickReviewStore.setState({ state: 'idle' });
  });

  afterEach(() => {
    delete doc.startViewTransition;
    document.documentElement.removeAttribute('data-view-transition');
  });

  describe('focus', () => {
    it('moves focus into the pushed view and back to the same element on pop', async () => {
      render(<ViewStack />);
      const row = screen.getByRole('button', { name: 'Row 7' });
      row.focus();

      await act(() => pushView(PR));
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: '#42' }).closest('.bd-viewstack__layer'),
      );

      await act(() => popView());
      expect(document.activeElement).toBe(row);
    });

    it('focuses the list when the element that had focus is gone', async () => {
      render(<ViewStack />);
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();

      await act(() => pushView(PR));
      outside.remove();
      await act(() => popView());

      expect(document.activeElement).toBe(listLayer());
    });

    it('pops one level at a time, focusing the detail view below', async () => {
      render(<ViewStack />);
      screen.getByRole('button', { name: 'Row 7' }).focus();
      await act(() => pushView(PR));
      await act(() => pushView(WI));
      await act(() => popView());
      // The first detail view was remounted; focus lands on its layer, not the inert list.
      expect(document.activeElement).toBe(
        screen.getByRole('heading', { name: '#42' }).closest('.bd-viewstack__layer'),
      );
      await act(() => popView());
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Row 7' }));
    });

    it('showSection from a detail view returns focus to where the first push started', async () => {
      render(<ViewStack />);
      const row = screen.getByRole('button', { name: 'Row 7' });
      row.focus();
      await act(() => pushView(PR));
      await act(() => pushView(WI));
      await act(() => showSection('workitems'));
      expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }]);
      expect(useUiStore.getState().activeSection).toBe('workitems');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Row 7' }));
    });
  });

  describe('transition direction', () => {
    function stubViewTransitions() {
      const finishers: (() => void)[] = [];
      doc.startViewTransition = vi.fn((cb: () => void) => {
        cb();
        const finished = new Promise<void>((resolve) => finishers.push(resolve));
        return { updateCallbackDone: Promise.resolve(), finished };
      });
      return finishers;
    }

    it('marks <html> with push, then pop, for the duration of each transition', async () => {
      const finishers = stubViewTransitions();
      const root = document.documentElement;

      await pushView(PR);
      expect(root).toHaveAttribute('data-view-transition', 'push');
      finishers[0]?.();
      await vi.waitFor(() => expect(root).not.toHaveAttribute('data-view-transition'));

      await popView();
      expect(root).toHaveAttribute('data-view-transition', 'pop');
      finishers[1]?.();
      await vi.waitFor(() => expect(root).not.toHaveAttribute('data-view-transition'));
    });

    it('a finishing transition leaves a newer one its attribute', async () => {
      const finishers = stubViewTransitions();
      const root = document.documentElement;

      await pushView(PR);
      await popView();
      finishers[0]?.();
      await Promise.resolve();
      await Promise.resolve();
      expect(root).toHaveAttribute('data-view-transition', 'pop');
      finishers[1]?.();
      await vi.waitFor(() => expect(root).not.toHaveAttribute('data-view-transition'));
    });

    it('clears the attribute at once when no transition runs', async () => {
      await pushView(PR);
      await Promise.resolve();
      expect(document.documentElement).not.toHaveAttribute('data-view-transition');
    });

    it('popView at depth 1 does nothing', async () => {
      await popView();
      expect(useUiStore.getState().viewStack).toEqual([{ kind: 'list' }]);
      expect(document.documentElement).not.toHaveAttribute('data-view-transition');
    });
  });

  describe('isOverlayOpen', () => {
    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('is false with nothing open', () => {
      expect(isOverlayOpen()).toBe(false);
    });

    it.each(['dialog', 'alertdialog', 'menu', 'listbox'])('sees role=%s', (role) => {
      const el = document.createElement('div');
      el.setAttribute('role', role);
      document.body.appendChild(el);
      expect(isOverlayOpen()).toBe(true);
    });

    it('sees Quick Review', () => {
      useQuickReviewStore.setState({ state: 'reviewing' });
      expect(isOverlayOpen()).toBe(true);
    });

    it('ignores overlays inside an inert layer', () => {
      const layer = document.createElement('div');
      layer.setAttribute('inert', '');
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      layer.appendChild(menu);
      document.body.appendChild(layer);
      expect(isOverlayOpen()).toBe(false);
    });
  });
});
