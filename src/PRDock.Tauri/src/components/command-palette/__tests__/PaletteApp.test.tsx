import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PaletteApp } from '../PaletteApp';

const mockClose = vi.fn(() => Promise.resolve());
const mockSetFocus = vi.fn(() => Promise.resolve());
const mockOnMoved = vi.fn(() => Promise.resolve(() => {}));
const mockOuterPosition = vi.fn(() => Promise.resolve({ x: 100, y: 200 }));
const mockScaleFactor = vi.fn(() => Promise.resolve(1));
const mockSetPosition = vi.fn(() => Promise.resolve());
const mockStartDragging = vi.fn(() => Promise.resolve());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve({
    azureDevOps: {
      organization: 'org',
      project: 'proj',
      personalAccessToken: 'pat',
      recentWorkItemIds: [],
      workingOnWorkItemIds: [],
    },
    ui: { theme: 'system' },
  })),
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

});
