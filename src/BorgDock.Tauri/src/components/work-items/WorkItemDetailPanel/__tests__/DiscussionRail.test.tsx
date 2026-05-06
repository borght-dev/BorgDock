// src/components/work-items/WorkItemDetailPanel/__tests__/DiscussionRail.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkItemComment } from '@/types';
import { DiscussionRail } from '../DiscussionRail';

const comments: WorkItemComment[] = [
  {
    id: 1,
    text: 'Reproduced on staging',
    createdBy: { displayName: 'Tjeerd van Beek' },
    createdDate: new Date(Date.now() - 7200_000).toISOString(),
    modifiedDate: new Date(Date.now() - 7200_000).toISOString(),
  },
];

describe('DiscussionRail', () => {
  it('renders comments and count', () => {
    render(
      <DiscussionRail
        comments={comments}
        isLoading={false}
        onAddComment={async () => {}}
      />,
    );
    expect(screen.getByText('Discussion')).toBeInTheDocument();
    expect(screen.getByText(/Reproduced/)).toBeInTheDocument();
  });

  it('submits comment on Enter', async () => {
    const onAdd = vi.fn(async () => {});
    render(<DiscussionRail comments={[]} isLoading={false} onAddComment={onAdd} />);
    const input = screen.getByPlaceholderText(/Reply/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'lgtm' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('lgtm');
  });
});
