import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DynamicFieldItem, WorkItemAttachment, WorkItemComment } from '@/types';
import { type WorkItemDetailData, WorkItemDetailPanel } from '../WorkItemDetailPanel';

vi.mock('@/hooks/useAdoImageAuth', () => ({ useAdoImageAuth: vi.fn() }));

function makeProps(overrides: Partial<WorkItemDetailData> = {}) {
  const item: WorkItemDetailData = {
    id: 100,
    title: 'Implement feature X',
    state: 'Active',
    workItemType: 'User Story',
    assignedTo: 'Carol',
    priority: 2,
    tags: 'sprint-1; frontend',
    htmlUrl: 'https://dev.azure.com/org/proj/_workitems/edit/100',
    isNewItem: false,
    iteration: 'R5.2',
    ...overrides,
  };
  return {
    item,
    isLoading: false,
    isSaving: false,
    availableStates: ['New', 'Active', 'Resolved'],
    richTextFields: [] as DynamicFieldItem[],
    standardFields: [] as DynamicFieldItem[],
    customFields: [] as DynamicFieldItem[],
    attachments: [] as WorkItemAttachment[],
    comments: [] as WorkItemComment[],
    isLoadingComments: false,
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    onOpenInBrowser: vi.fn(),
    onDownloadAttachment: vi.fn(),
    onAddComment: vi.fn(),
  };
}

describe('WorkItemDetailPanel (v2)', () => {
  it('renders title, type, and tabs', () => {
    render(<WorkItemDetailPanel {...makeProps()} />);
    expect(screen.getByText('Implement feature X')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
  });

  it('shows the right rail Properties section', () => {
    render(<WorkItemDetailPanel {...makeProps()} />);
    expect(screen.getByText('Properties')).toBeInTheDocument();
  });

  it('shows Attachments tab when there are attachments', () => {
    const props = makeProps();
    props.attachments.push({
      id: 'a1',
      fileName: 'screenshot.png',
      size: 12345,
      url: 'x',
    });
    render(<WorkItemDetailPanel {...props} />);
    expect(screen.getByText('Attachments')).toBeInTheDocument();
  });
});
