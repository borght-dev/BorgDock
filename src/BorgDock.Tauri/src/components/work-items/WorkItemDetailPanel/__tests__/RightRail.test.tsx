// src/components/work-items/WorkItemDetailPanel/__tests__/RightRail.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RightRail } from '../RightRail';

describe('RightRail', () => {
  it('shows Properties section with state, priority, type', () => {
    render(
      <RightRail
        state="Active"
        priority={2}
        severity={undefined}
        workItemType="Bug"
        assignedTo="KV"
        reporter="Jane Doe"
        iteration="R5.2.7"
        area="Horizon Portal"
        backlogPriority={undefined}
        foundIn={undefined}
        tags={['Horizon', 'Quotes']}
        linkedPRs={[]}
      />,
    );
    expect(screen.getByText('Properties')).toBeInTheDocument();
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('P2')).toBeInTheDocument();
  });

  it('renders linked PRs', () => {
    render(
      <RightRail
        state="Active"
        priority={2}
        severity={undefined}
        workItemType="Bug"
        assignedTo="KV"
        reporter="Jane Doe"
        iteration=""
        area=""
        backlogPriority={undefined}
        foundIn={undefined}
        tags={[]}
        linkedPRs={[{ id: 713, comment: 'Quote follow-ups' }]}
      />,
    );
    expect(screen.getByText('#713')).toBeInTheDocument();
    expect(screen.getByText('Quote follow-ups')).toBeInTheDocument();
  });

  it('skips empty rows (e.g. severity)', () => {
    render(
      <RightRail
        state="Active"
        priority={2}
        severity={undefined}
        workItemType="Bug"
        assignedTo="KV"
        reporter=""
        iteration=""
        area=""
        backlogPriority={undefined}
        foundIn={undefined}
        tags={[]}
        linkedPRs={[]}
      />,
    );
    expect(screen.queryByText('Severity')).toBeNull();
  });
});
