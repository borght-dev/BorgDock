import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { WorkItem } from '@/types';
import { LinkedWorkItemBadge } from '../LinkedWorkItemBadge';

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 42,
    rev: 1,
    url: 'https://dev.azure.com/org/project/_apis/wit/workItems/42',
    fields: {
      'System.Title': 'Fix login bug',
      'System.State': 'Active',
      'System.AssignedTo': { displayName: 'Alice' },
    },
    relations: [],
    htmlUrl: 'https://dev.azure.com/org/project/_workitems/edit/42',
    ...overrides,
  };
}

describe('LinkedWorkItemBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders work item ID', () => {
    render(<LinkedWorkItemBadge workItemId={42} />);
    expect(screen.getByText('AB#42')).toBeTruthy();
  });

  it('shows "Loading..." when no work item data provided', () => {
    render(<LinkedWorkItemBadge workItemId={42} />);
    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('shows title when work item is provided', () => {
    const wi = makeWorkItem();
    render(<LinkedWorkItemBadge workItemId={42} workItem={wi} />);
    expect(screen.getByText('Fix login bug')).toBeTruthy();
  });

  it('shows state when work item is provided', () => {
    const wi = makeWorkItem();
    render(<LinkedWorkItemBadge workItemId={42} workItem={wi} />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('shows assigned user when available', () => {
    const wi = makeWorkItem();
    render(<LinkedWorkItemBadge workItemId={42} workItem={wi} />);
    expect(screen.getByText('assigned to Alice')).toBeTruthy();
  });

  it('handles string assignedTo field', () => {
    const wi = makeWorkItem({
      fields: {
        'System.Title': 'Some task',
        'System.State': 'New',
        'System.AssignedTo': 'Bob',
      },
    });
    render(<LinkedWorkItemBadge workItemId={42} workItem={wi} />);
    expect(screen.getByText('assigned to Bob')).toBeTruthy();
  });

  it('shows "Untitled" when title is missing', () => {
    const wi = makeWorkItem({ fields: { 'System.State': 'Active' } });
    render(<LinkedWorkItemBadge workItemId={42} workItem={wi} />);
    expect(screen.getByText('Untitled')).toBeTruthy();
  });

  it('does not show assignee section when not assigned', () => {
    const wi = makeWorkItem({
      fields: { 'System.Title': 'Task', 'System.State': 'Active' },
    });
    render(<LinkedWorkItemBadge workItemId={42} workItem={wi} />);
    expect(screen.queryByText(/assigned to/)).toBeNull();
  });

  it('renders full branch inside a Card primitive with data-linked-work-item attr', () => {
    const wi = makeWorkItem();
    const { container } = render(<LinkedWorkItemBadge workItemId={42} workItem={wi} />);
    const card = container.querySelector('[data-linked-work-item="42"]');
    expect(card).toBeTruthy();
    expect(card?.classList.contains('bd-card')).toBe(true);
  });

  describe('compact mode', () => {
    it('renders compact badge with AB# prefix', () => {
      render(<LinkedWorkItemBadge workItemId={42} compact />);
      expect(screen.getByText('AB#42')).toBeTruthy();
    });

    it('renders as a span in compact mode', () => {
      const { container } = render(<LinkedWorkItemBadge workItemId={42} compact />);
      const span = container.querySelector('span');
      expect(span).toBeTruthy();
      expect(span?.textContent).toBe('AB#42');
    });

    it('has title with work item ID when no work item data', () => {
      const { container } = render(<LinkedWorkItemBadge workItemId={42} compact />);
      const span = container.querySelector('span');
      expect(span?.getAttribute('title')).toBe('Work Item #42');
    });

    it('has title with work item title and state when provided', () => {
      const wi = makeWorkItem();
      const { container } = render(<LinkedWorkItemBadge workItemId={42} workItem={wi} compact />);
      const span = container.querySelector('span');
      expect(span?.getAttribute('title')).toBe('Fix login bug (Active)');
    });

    it('shows "Untitled" in compact title when title is missing', () => {
      const wi = makeWorkItem({ fields: { 'System.State': 'Closed' } });
      const { container } = render(<LinkedWorkItemBadge workItemId={42} workItem={wi} compact />);
      const span = container.querySelector('span');
      expect(span?.getAttribute('title')).toBe('Untitled (Closed)');
    });

    it('shows "Unknown" state in compact title when state is missing', () => {
      const wi = makeWorkItem({ fields: { 'System.Title': 'My task' } });
      const { container } = render(<LinkedWorkItemBadge workItemId={42} workItem={wi} compact />);
      const span = container.querySelector('span');
      expect(span?.getAttribute('title')).toBe('My task (Unknown)');
    });

    it('does not render full layout elements in compact mode', () => {
      const wi = makeWorkItem();
      render(<LinkedWorkItemBadge workItemId={42} workItem={wi} compact />);
      expect(screen.queryByText('Fix login bug')).toBeNull();
      expect(screen.queryByText('assigned to Alice')).toBeNull();
    });

    it('renders compact branch as a Pill primitive with data-linked-work-item attr', () => {
      const { container } = render(<LinkedWorkItemBadge workItemId={42} compact />);
      const pill = container.querySelector('[data-linked-work-item="42"]');
      expect(pill).toBeTruthy();
      expect(pill?.classList.contains('bd-pill')).toBe(true);
    });
  });
});
