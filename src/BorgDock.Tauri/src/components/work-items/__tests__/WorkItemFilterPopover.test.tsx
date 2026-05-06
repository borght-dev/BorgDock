import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkItemFilterPopover } from '../WorkItemFilterPopover';

describe('WorkItemFilterPopover', () => {
  it('renders state, assignee, tracking selects', () => {
    render(
      <WorkItemFilterPopover
        states={['Active', 'Resolved']}
        assignees={['Alice', 'Bob']}
        selectedState="All"
        selectedAssignee="Anyone"
        trackingFilter="all"
        onStateChange={() => {}}
        onAssigneeChange={() => {}}
        onTrackingChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('State')).toBeInTheDocument();
    expect(screen.getByLabelText('Assignee')).toBeInTheDocument();
    expect(screen.getByLabelText('Tracking')).toBeInTheDocument();
  });
});
