import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const { mounts } = vi.hoisted(() => ({ mounts: { count: 0 } }));

vi.mock('../SectionView', () => ({ SectionView: () => <div data-testid="section-view" /> }));
vi.mock('@/components/pr-detail/PrDetailView', () => ({
  PrDetailView: ({ number }: { number: number }) => {
    useEffect(() => {
      mounts.count++;
    }, []);
    return <h1>#{number}</h1>;
  },
}));

import { type MainView, useUiStore } from '@/stores/ui-store';
import { ViewStack } from '../ViewStack';

const PR: MainView = { kind: 'pr-detail', owner: 'octo', repo: 'app', number: 42 };

describe('ViewStack fallback pop', () => {
  it('keeps the popped detail mounted for its exit animation instead of mounting a copy', async () => {
    useUiStore.setState({ viewStack: [{ kind: 'list' }] });
    const { container } = render(<ViewStack />);
    await act(async () => {});
    await act(() => useUiStore.getState().pushView(PR));
    expect(mounts.count).toBe(1);

    await act(() => useUiStore.getState().popView());

    const leaving = container.querySelector('.bd-viewstack__detail--leaving');
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveTextContent('#42');
    // Still the instance that was on top: no second mount, so no refetch.
    expect(mounts.count).toBe(1);
  });
});

beforeAll(async () => {
  await import('@/components/pr-detail/PrDetailView');
  await import('@/components/work-items/WorkItemDetailView');
}, 30_000);
