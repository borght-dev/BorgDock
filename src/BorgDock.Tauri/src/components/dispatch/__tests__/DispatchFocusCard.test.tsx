import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({ showDispatchItem: vi.fn() }));
const navigation = vi.hoisted(() => ({ showSection: vi.fn() }));

vi.mock('@/services/dispatch/actions', () => actions);
vi.mock('@/services/navigation', () => navigation);

import { useDispatchStore } from '@/stores/dispatch-store';
import { makeDispatchScene } from '../__fixtures__/dispatch-data';
import { DispatchFocusCard } from '../DispatchFocusCard';

describe('DispatchFocusCard', () => {
  beforeEach(() => {
    actions.showDispatchItem.mockReset();
    navigation.showSection.mockReset();
  });

  it('renders nothing until Dispatch has items', () => {
    useDispatchStore.setState({ overview: null });
    const { container } = render(<DispatchFocusCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sums up the work and names the first items that wait on you', () => {
    useDispatchStore.setState({ overview: makeDispatchScene().overview });
    render(<DispatchFocusCard />);

    expect(
      screen.getByText(/^\d+ need you · \d+ can move · \d+ agents working$/),
    ).toBeInTheDocument();
    expect(screen.getByTitle('Needs Human')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Order list loses its scroll position/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^and \d+ more$/)).toBeInTheDocument();
  });

  it('shows what was said last about an item that waits', () => {
    useDispatchStore.setState({ overview: makeDispatchScene().overview });
    render(<DispatchFocusCard />);
    expect(
      screen.getByText(/^Vera · plan: I need your decision on two classes/),
    ).toBeInTheDocument();
  });

  it('opens the picked item in Dispatch', () => {
    useDispatchStore.setState({ overview: makeDispatchScene().overview });
    render(<DispatchFocusCard />);

    fireEvent.click(screen.getByRole('button', { name: /Order list loses its scroll position/ }));
    expect(actions.showDispatchItem).toHaveBeenCalledWith(60214);

    fireEvent.click(screen.getByRole('button', { name: 'Open Dispatch' }));
    expect(navigation.showSection).toHaveBeenCalledWith('dispatch');
  });
});
