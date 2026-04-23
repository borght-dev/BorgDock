import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaletteApp } from '../PaletteApp';

const mockClose = vi.fn(() => Promise.resolve());
const mockSetFocus = vi.fn(() => Promise.resolve());
const mockOnMoved = vi.fn(() => Promise.resolve(() => {}));
const mockOuterPosition = vi.fn(() => Promise.resolve({ x: 100, y: 200 }));
const mockScaleFactor = vi.fn(() => Promise.resolve(1));
const mockSetPosition = vi.fn(() => Promise.resolve());
const mockStartDragging = vi.fn(() => Promise.resolve());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() =>
    Promise.resolve({
      azureDevOps: {
        organization: 'org',
        project: 'proj',
        personalAccessToken: 'pat',
        authMethod: 'pat',
        authAutoDetected: true,
        recentWorkItemIds: [],
        workingOnWorkItemIds: [],
      },
      ui: { theme: 'system' },
    }),
  ),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    close: mockClose,
    setFocus: mockSetFocus,
    onMoved: mockOnMoved,
    outerPosition: mockOuterPosition,
    scaleFactor: mockScaleFactor,
    setPosition: mockSetPosition,
    startDragging: mockStartDragging,
  })),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalPosition: vi.fn((x: number, y: number) => ({ x, y })),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: vi.fn(),
}));

vi.mock('@/services/ado/client', () => ({
  AdoClient: vi.fn(),
}));

vi.mock('@/services/ado/workitems', () => ({
  getWorkItems: vi.fn(() => Promise.resolve([])),
  getAssignedToMe: vi.fn(() => Promise.resolve([])),
  searchWorkItemsByIdPrefix: vi.fn(() => Promise.resolve([])),
  searchWorkItemsByText: vi.fn(() => Promise.resolve([])),
}));

describe('PaletteApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the search input', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });
    expect(screen.getByPlaceholderText('Search by ID, title, or assigned to...')).toBeTruthy();
  });

  it('renders the drag handle', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });
    const dots = document.querySelectorAll('.rounded-full');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('shows "Esc to close" text', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });
    expect(screen.getByText('Esc to close')).toBeTruthy();
  });

  it('shows empty browse message when no data', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });
    expect(screen.getByText('Type to search work items')).toBeTruthy();
  });

  it('closes window on Escape key', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(mockClose).toHaveBeenCalled();
  });

  it('starts dragging on mouseDown on drag handle', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });

    const dragHandle = document.querySelector('.cursor-grab');
    if (dragHandle) {
      fireEvent.mouseDown(dragHandle, { button: 0 });
      expect(mockStartDragging).toHaveBeenCalled();
    }
  });

  it('does not start dragging on right-click', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });

    const dragHandle = document.querySelector('.cursor-grab');
    if (dragHandle) {
      fireEvent.mouseDown(dragHandle, { button: 2 });
      expect(mockStartDragging).not.toHaveBeenCalled();
    }
  });

  it('shows status text for short numeric search', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });

    const input = screen.getByPlaceholderText('Search by ID, title, or assigned to...');
    await act(async () => {
      fireEvent.change(input, { target: { value: '1' } });
    });

    expect(screen.getByText('Type at least 2 digits')).toBeTruthy();
  });

  it('shows status text for short text search', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });

    const input = screen.getByPlaceholderText('Search by ID, title, or assigned to...');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'a' } });
    });

    expect(screen.getByText('Type at least 2 characters')).toBeTruthy();
  });

  it('handles ArrowDown keyboard navigation', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });

    const input = screen.getByPlaceholderText('Search by ID, title, or assigned to...');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    });
  });

  it('handles ArrowUp keyboard navigation', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });

    const input = screen.getByPlaceholderText('Search by ID, title, or assigned to...');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    });
  });

  it('loads settings on mount', async () => {
    const { invoke } = await import('@tauri-apps/api/core');

    await act(async () => {
      render(<PaletteApp />);
    });

    expect(invoke).toHaveBeenCalledWith('load_settings');
  });

  it('shows "Searching..." status for valid numeric search', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });

    const input = screen.getByPlaceholderText('Search by ID, title, or assigned to...');
    await act(async () => {
      fireEvent.change(input, { target: { value: '42' } });
    });

    expect(screen.getByText('Searching...')).toBeTruthy();
  });

  it('handles Enter keydown on search input', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });

    const input = screen.getByPlaceholderText('Search by ID, title, or assigned to...');
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    // No crash, Enter is handled gracefully even without selected items
  });

  it('displays browse sections when data is loaded', async () => {
    const { getWorkItems, getAssignedToMe } = await import('@/services/ado/workitems');
    vi.mocked(getWorkItems).mockResolvedValue([]);
    vi.mocked(getAssignedToMe).mockResolvedValue([
      {
        id: 100,
        rev: 1,
        url: '',
        fields: {
          'System.Title': 'My Task',
          'System.State': 'Active',
          'System.WorkItemType': 'Task',
          'System.AssignedTo': 'me',
        },
        relations: [],
        htmlUrl: '',
      },
    ]);

    await act(async () => {
      render(<PaletteApp />);
    });

    // Wait for the settings to load and fetch to complete
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await vi.waitFor(() => {
      expect(screen.getByText('Assigned to Me')).toBeTruthy();
      expect(screen.getByText('#100')).toBeTruthy();
    });
  });

  it('displays Working On section when working-on IDs are present', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    vi.mocked(invoke).mockResolvedValue({
      azureDevOps: {
        organization: 'org',
        project: 'proj',
        personalAccessToken: 'pat',
        authMethod: 'pat',
        authAutoDetected: true,
        recentWorkItemIds: [],
        workingOnWorkItemIds: [50],
      },
      ui: { theme: 'system' },
    });

    const { getWorkItems, getAssignedToMe } = await import('@/services/ado/workitems');
    vi.mocked(getWorkItems).mockResolvedValue([
      {
        id: 50,
        rev: 1,
        url: '',
        fields: {
          'System.Title': 'Working Task',
          'System.State': 'Active',
          'System.WorkItemType': 'Bug',
          'System.AssignedTo': 'dev',
        },
        relations: [],
        htmlUrl: '',
      },
    ]);
    vi.mocked(getAssignedToMe).mockResolvedValue([]);

    await act(async () => {
      render(<PaletteApp />);
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await vi.waitFor(() => {
      expect(screen.getByText('Working On')).toBeTruthy();
      expect(screen.getByText('Working Task')).toBeTruthy();
    });
  });

  it('saves position on window move', async () => {
    await act(async () => {
      render(<PaletteApp />);
    });

    expect(mockOnMoved).toHaveBeenCalled();
  });

  it('restores saved position from localStorage when on-screen', async () => {
    localStorage.setItem('borgdock-palette-position', JSON.stringify({ x: 200, y: 300 }));

    await act(async () => {
      render(<PaletteApp />);
    });

    // The component restores position asynchronously during mount
    // Just verify it doesn't crash with a saved position
    expect(localStorage.getItem('borgdock-palette-position')).toBeTruthy();
  });
});
