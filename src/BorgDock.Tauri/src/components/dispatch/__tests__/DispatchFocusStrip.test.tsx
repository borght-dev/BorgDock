import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({ showDispatchItem: vi.fn() }));
const navigation = vi.hoisted(() => ({ showSection: vi.fn() }));

vi.mock('@/services/dispatch/actions', () => actions);
vi.mock('@/services/navigation', () => navigation);

import { useDispatchStore } from '@/stores/dispatch-store';
import { makeDispatchScene } from '../__fixtures__/dispatch-data';
import { DispatchFocusStrip } from '../DispatchFocusStrip';

describe('DispatchFocusStrip', () => {
  beforeEach(() => {
    actions.showDispatchItem.mockReset();
    navigation.showSection.mockReset();
  });

  it('renders nothing while no agent waits', () => {
    useDispatchStore.setState({ overview: null });
    const { container } = render(<DispatchFocusStrip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the first agents that wait and counts the rest', () => {
    useDispatchStore.setState({ overview: makeDispatchScene().overview });
    render(<DispatchFocusStrip />);

    expect(screen.getByText('4 agents need you')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Order list loses its scroll position/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('and 1 more')).toBeInTheDocument();
  });

  it('opens the picked item in Dispatch', () => {
    useDispatchStore.setState({ overview: makeDispatchScene().overview });
    render(<DispatchFocusStrip />);

    fireEvent.click(screen.getByRole('button', { name: /CSV export drops the last column/ }));
    expect(actions.showDispatchItem).toHaveBeenCalledWith(60102);

    fireEvent.click(screen.getByRole('button', { name: 'Open Dispatch' }));
    expect(navigation.showSection).toHaveBeenCalledWith('dispatch');
  });
});
