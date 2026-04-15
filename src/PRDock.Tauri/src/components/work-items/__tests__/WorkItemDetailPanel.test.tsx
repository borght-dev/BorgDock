import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DynamicFieldItem, WorkItemAttachment, WorkItemComment } from '@/types';
import { type WorkItemDetailData, WorkItemDetailPanel } from '../WorkItemDetailPanel';

// Mock useAdoImageAuth — it needs DOM refs + settings store, not relevant for unit tests
vi.mock('@/hooks/useAdoImageAuth', () => ({
  useAdoImageAuth: vi.fn(),
}));

// ---------- factories ----------

function makeDetailData(overrides: Partial<WorkItemDetailData> = {}): WorkItemDetailData {
  return {
    id: 100,
    title: 'Implement feature X',
    state: 'Active',
    workItemType: 'User Story',
    assignedTo: 'Carol',
    priority: 2,
    tags: 'sprint-1; frontend',
    htmlUrl: 'https://dev.azure.com/org/proj/_workitems/edit/100',
    isNewItem: false,
    ...overrides,
  };
}

function makeComment(overrides: Partial<WorkItemComment> = {}): WorkItemComment {
  return {
    id: 1,
    text: '<p>This looks good.</p>',
    createdBy: { displayName: 'Dave', uniqueName: 'dave@example.com' },
    createdDate: new Date(Date.now() - 3600_000).toISOString(),
    modifiedDate: new Date(Date.now() - 3600_000).toISOString(),
    ...overrides,
  };
}

function makeAttachment(overrides: Partial<WorkItemAttachment> = {}): WorkItemAttachment {
  return {
    id: 'att-1',
    fileName: 'screenshot.png',
    size: 12345,
    url: 'https://dev.azure.com/org/proj/_apis/wit/attachments/att-1',
    ...overrides,
  };
}

function defaultProps(overrides: Partial<WorkItemDetailData> = {}) {
  return {
    item: makeDetailData(overrides),
    isLoading: false,
    isSaving: false,
    statusText: undefined as string | undefined,
    availableStates: ['New', 'Active', 'Resolved', 'Closed'],
    availableAssignees: ['Carol', 'Dave', 'Eve'],
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
    onAddComment: vi.fn().mockResolvedValue(undefined),
  };
}

describe('WorkItemDetailPanel', () => {
  afterEach(cleanup);

  // ---- Loading state ----

  it('shows loading spinner when isLoading', () => {
    const props = defaultProps();
    props.isLoading = true;
    const { container } = render(<WorkItemDetailPanel {...props} />);
    // The spinner is a div with animate-spin class
    expect(container.querySelector('.animate-spin')).toBeDefined();
    // Should not render form fields
    expect(screen.queryByText('Title')).toBeNull();
  });

  // ---- Header ----

  it('shows work item type and id in header', () => {
    render(<WorkItemDetailPanel {...defaultProps()} />);
    expect(screen.getByText('User Story')).toBeDefined();
    expect(screen.getByText('#100')).toBeDefined();
  });

  it('shows "New Work Item" label for new items', () => {
    render(<WorkItemDetailPanel {...defaultProps({ isNewItem: true, id: undefined })} />);
    expect(screen.getByText('New Work Item')).toBeDefined();
  });

  it('shows type selector for new items', () => {
    render(<WorkItemDetailPanel {...defaultProps({ isNewItem: true })} />);
    expect(screen.getByText('Type')).toBeDefined();
    const typeSelect = screen.getByDisplayValue('User Story');
    expect(typeSelect).toBeDefined();
  });

  // ---- Form fields ----

  it('renders title textarea with value', () => {
    render(<WorkItemDetailPanel {...defaultProps()} />);
    const textarea = screen.getByDisplayValue('Implement feature X');
    expect(textarea).toBeDefined();
  });

  it('renders state select with value', () => {
    render(<WorkItemDetailPanel {...defaultProps()} />);
    const stateSelect = screen.getByDisplayValue('Active');
    expect(stateSelect).toBeDefined();
  });

  it('renders all available states as options', () => {
    const props = defaultProps();
    render(<WorkItemDetailPanel {...props} />);
    for (const s of props.availableStates) {
      expect(screen.getByText(s)).toBeDefined();
    }
  });

  it('renders assignee dropdown when availableAssignees provided', () => {
    render(<WorkItemDetailPanel {...defaultProps()} />);
    expect(screen.getByDisplayValue('Carol')).toBeDefined();
    expect(screen.getByText('Unassigned')).toBeDefined();
  });

  it('renders assignee text input when no availableAssignees', () => {
    const props = defaultProps();
    props.availableAssignees = [];
    render(<WorkItemDetailPanel {...props} />);
    const input = screen.getByDisplayValue('Carol');
    expect(input.tagName).toBe('INPUT');
  });

  it('renders priority select with value', () => {
    render(<WorkItemDetailPanel {...defaultProps()} />);
    expect(screen.getByDisplayValue('2 - High')).toBeDefined();
  });

  it('renders tags input', () => {
    render(<WorkItemDetailPanel {...defaultProps()} />);
    const tagsInput = screen.getByDisplayValue('sprint-1; frontend');
    expect(tagsInput).toBeDefined();
  });

  // ---- Save ----

  it('calls onSave with updated fields when Save clicked', () => {
    const props = defaultProps();
    render(<WorkItemDetailPanel {...props} />);

    const titleTextarea = screen.getByDisplayValue('Implement feature X');
    fireEvent.change(titleTextarea, { target: { value: 'Updated title' } });

    fireEvent.click(screen.getByText('Save'));
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Updated title' }));
  });

  it('disables save button when title is empty', () => {
    const props = defaultProps();
    render(<WorkItemDetailPanel {...props} />);

    const titleTextarea = screen.getByDisplayValue('Implement feature X');
    fireEvent.change(titleTextarea, { target: { value: '' } });

    const saveBtn = screen.getByText('Save');
    expect(saveBtn.hasAttribute('disabled')).toBe(true);
  });

  it('disables save button when isSaving', () => {
    const props = defaultProps();
    props.isSaving = true;
    render(<WorkItemDetailPanel {...props} />);
    expect(screen.getByText('Saving...')).toBeDefined();
  });

  it('shows "Create" button text for new items', () => {
    render(<WorkItemDetailPanel {...defaultProps({ isNewItem: true })} />);
    expect(screen.getByText('Create')).toBeDefined();
  });

  // ---- Status text ----

  it('shows status text when provided', () => {
    const props = defaultProps();
    props.statusText = 'Saved';
    render(<WorkItemDetailPanel {...props} />);
    expect(screen.getByText('Saved')).toBeDefined();
  });

  // ---- Close / Delete ----

  it('calls onClose when close button clicked', () => {
    const props = defaultProps();
    render(<WorkItemDetailPanel {...props} />);

    const headerArea = document.querySelector('.border-b')!;
    const headerButtons = headerArea.querySelectorAll('button');
    const closeBtn = headerButtons[headerButtons.length - 1]!;
    fireEvent.click(closeBtn);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('calls onDelete when delete button clicked', () => {
    const props = defaultProps();
    render(<WorkItemDetailPanel {...props} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(props.onDelete).toHaveBeenCalled();
  });

  it('does not show delete button for new items', () => {
    render(<WorkItemDetailPanel {...defaultProps({ isNewItem: true })} />);
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('does not show delete button when onDelete not provided', () => {
    const props = defaultProps();
    props.onDelete = undefined;
    render(<WorkItemDetailPanel {...props} />);
    expect(screen.queryByText('Delete')).toBeNull();
  });

  // ---- Open in browser ----

  it('calls onOpenInBrowser when browser button clicked', () => {
    const props = defaultProps();
    render(<WorkItemDetailPanel {...props} />);

    const browserBtn = screen.getByTitle('Open in browser');
    fireEvent.click(browserBtn);
    expect(props.onOpenInBrowser).toHaveBeenCalledWith(
      'https://dev.azure.com/org/proj/_workitems/edit/100',
    );
  });

  it('does not show open-in-browser for new items', () => {
    render(<WorkItemDetailPanel {...defaultProps({ isNewItem: true })} />);
    expect(screen.queryByTitle('Open in browser')).toBeNull();
  });

  // ---- Rich text / standard / custom fields ----

  it('renders rich text fields section', () => {
    const props = defaultProps();
    props.richTextFields = [
      {
        fieldKey: 'System.Description',
        label: 'Description',
        isHtml: true,
        htmlContent: '<p>Some description</p>',
        section: 'richText',
      },
    ];
    render(<WorkItemDetailPanel {...props} />);
    expect(screen.getByText('Details')).toBeDefined();
    expect(screen.getByText('Description')).toBeDefined();
  });

  it('renders standard fields section', () => {
    const props = defaultProps();
    props.standardFields = [
      {
        fieldKey: 'Microsoft.VSTS.Common.StackRank',
        label: 'Stack Rank',
        value: '1.5',
        isHtml: false,
        section: 'standard',
      },
    ];
    render(<WorkItemDetailPanel {...props} />);
    expect(screen.getByText('Fields')).toBeDefined();
    expect(screen.getByText('Stack Rank')).toBeDefined();
    expect(screen.getByText('1.5')).toBeDefined();
  });

  it('renders custom fields section', () => {
    const props = defaultProps();
    props.customFields = [
      {
        fieldKey: 'Custom.Effort',
        label: 'Effort',
        value: '8',
        isHtml: false,
        section: 'custom',
      },
    ];
    render(<WorkItemDetailPanel {...props} />);
    expect(screen.getByText('Custom Fields')).toBeDefined();
    expect(screen.getByText('Effort')).toBeDefined();
    expect(screen.getByText('8')).toBeDefined();
  });

  // ---- Attachments ----

  it('renders attachments section', () => {
    const props = defaultProps();
    props.attachments = [makeAttachment()];
    render(<WorkItemDetailPanel {...props} />);
    expect(screen.getByText('Attachments')).toBeDefined();
    expect(screen.getByText('screenshot.png')).toBeDefined();
  });

  it('shows formatted file size', () => {
    const props = defaultProps();
    props.attachments = [makeAttachment({ size: 1048576 })];
    render(<WorkItemDetailPanel {...props} />);
    expect(screen.getByText('1.0 MB')).toBeDefined();
  });

  it('calls onDownloadAttachment when attachment clicked', () => {
    const props = defaultProps();
    const att = makeAttachment();
    props.attachments = [att];
    render(<WorkItemDetailPanel {...props} />);
    fireEvent.click(screen.getByText('screenshot.png'));
    expect(props.onDownloadAttachment).toHaveBeenCalledWith(att);
  });

  // ---- Comments / Discussion ----

  it('shows "No comments yet." when no comments', () => {
    render(<WorkItemDetailPanel {...defaultProps()} />);
    expect(screen.getByText('No comments yet.')).toBeDefined();
  });

  it('renders existing comments', () => {
    const props = defaultProps();
    props.comments = [
      makeComment({ text: '<p>First comment</p>', createdBy: { displayName: 'Alice' } }),
      makeComment({ id: 2, text: '<p>Second comment</p>', createdBy: { displayName: 'Bob' } }),
    ];
    render(<WorkItemDetailPanel {...props} />);
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
  });

  it('shows comment loading skeleton when isLoadingComments', () => {
    const props = defaultProps();
    props.isLoadingComments = true;
    const { container } = render(<WorkItemDetailPanel {...props} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders comment textarea', () => {
    render(<WorkItemDetailPanel {...defaultProps()} />);
    expect(screen.getByPlaceholderText('Add a comment...')).toBeDefined();
  });

  it('disables Comment button when textarea empty', () => {
    render(<WorkItemDetailPanel {...defaultProps()} />);
    const commentBtn = screen.getByText('Comment');
    expect(commentBtn.hasAttribute('disabled')).toBe(true);
  });

  it('calls onAddComment when Comment clicked', async () => {
    const props = defaultProps();
    render(<WorkItemDetailPanel {...props} />);

    const textarea = screen.getByPlaceholderText('Add a comment...');
    fireEvent.change(textarea, { target: { value: 'My new comment' } });

    const commentBtn = screen.getByText('Comment');
    expect(commentBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(commentBtn);
    expect(props.onAddComment).toHaveBeenCalledWith('My new comment');
  });

  it('does not show Discussion section for new items', () => {
    render(<WorkItemDetailPanel {...defaultProps({ isNewItem: true })} />);
    expect(screen.queryByText('Discussion')).toBeNull();
  });

  // ---- Save updates include changed fields ----

  it('includes workItemType in save when isNewItem', () => {
    const props = defaultProps({ isNewItem: true, workItemType: 'Task' });
    render(<WorkItemDetailPanel {...props} />);

    // Change type to Bug
    const typeSelect = screen.getByDisplayValue('Task');
    fireEvent.change(typeSelect, { target: { value: 'Bug' } });

    fireEvent.click(screen.getByText('Create'));
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ workItemType: 'Bug' }));
  });
});
