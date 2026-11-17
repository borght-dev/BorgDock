import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makePr } from '@/components/focus/__tests__/helpers';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { ReviewSessionProgress } from '../ReviewSessionProgress';

afterEach(() => {
  cleanup();
  useQuickReviewStore.setState({ activity: {} });
});

describe('ReviewSessionProgress', () => {
  it('counts walk-throughs of my own PRs apart from reviews', () => {
    const own = makePr({ number: 1 });
    const theirs = makePr({ number: 2 });
    useQuickReviewStore.setState({
      activity: {
        a: { pr: own, decision: 'walked' },
        b: { pr: theirs, decision: 'approved' },
      },
    });
    render(<ReviewSessionProgress />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('1 approved');
    expect(status).toHaveTextContent('1 reviewed');
    expect(status).toHaveTextContent('1 walked through');
  });
});
