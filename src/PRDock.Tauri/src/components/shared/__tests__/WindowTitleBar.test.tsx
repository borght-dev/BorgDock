import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mockMinimize = vi.fn(() => Promise.resolve());
const mockMaximize = vi.fn(() => Promise.resolve());
const mockUnmaximize = vi.fn(() => Promise.resolve());
const mockClose = vi.fn(() => Promise.resolve());
const mockIsMaximized = vi.fn(() => Promise.resolve(false));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    minimize: mockMinimize,
    maximize: mockMaximize,
    unmaximize: mockUnmaximize,
    close: mockClose,
    isMaximized: mockIsMaximized,
    toggleMaximize: vi.fn(),
    startDragging: vi.fn(() => Promise.resolve()),
  })),
}));

import { WindowTitleBar } from '../WindowTitleBar';

describe('WindowTitleBar', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMaximized.mockResolvedValue(false);
  });

  it('renders the title', () => {
    render(<WindowTitleBar title="My Window" />);
    expect(screen.getByText('My Window')).toBeTruthy();
  });

  it('renders minimize, maximize, and close buttons', () => {
    render(<WindowTitleBar title="Test" />);
    expect(screen.getByLabelText('Minimize')).toBeTruthy();
    expect(screen.getByLabelText('Maximize')).toBeTruthy();
    expect(screen.getByLabelText('Close')).toBeTruthy();
  });

  it('calls minimize on minimize button click', () => {
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByLabelText('Minimize'));
    expect(mockMinimize).toHaveBeenCalledTimes(1);
  });

  it('calls maximize on maximize button click when not maximized', async () => {
    mockIsMaximized.mockResolvedValue(false);
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByLabelText('Maximize'));
    await vi.waitFor(() => {
      expect(mockMaximize).toHaveBeenCalledTimes(1);
    });
    expect(mockUnmaximize).not.toHaveBeenCalled();
  });

  it('calls unmaximize on maximize button click when already maximized', async () => {
    mockIsMaximized.mockResolvedValue(true);
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByLabelText('Maximize'));
    await vi.waitFor(() => {
      expect(mockUnmaximize).toHaveBeenCalledTimes(1);
    });
    expect(mockMaximize).not.toHaveBeenCalled();
  });

  it('calls close on close button click', () => {
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('toggles maximize on double-click of title bar', async () => {
    mockIsMaximized.mockResolvedValue(false);
    render(<WindowTitleBar title="Test" />);
    const titleBar = document.querySelector('.window-titlebar') as HTMLElement;
    fireEvent.doubleClick(titleBar);
    await vi.waitFor(() => {
      expect(mockMaximize).toHaveBeenCalledTimes(1);
    });
  });

  it('has data-tauri-drag-region attribute on title bar', () => {
    render(<WindowTitleBar title="Test" />);
    const titleBar = document.querySelector('.window-titlebar');
    expect(titleBar?.getAttribute('data-tauri-drag-region')).toBe('true');
  });

  it('has data-tauri-drag-region attribute on title text', () => {
    render(<WindowTitleBar title="Test" />);
    const titleText = document.querySelector('.window-titlebar-title');
    expect(titleText?.getAttribute('data-tauri-drag-region')).toBe('true');
  });

  it('renders close button with the --close modifier class', () => {
    render(<WindowTitleBar title="Test" />);
    const closeBtn = screen.getByLabelText('Close');
    expect(closeBtn.className).toContain('window-titlebar-btn--close');
  });

  it('renders different titles based on props', () => {
    const { rerender } = render(<WindowTitleBar title="First" />);
    expect(screen.getByText('First')).toBeTruthy();
    rerender(<WindowTitleBar title="Second" />);
    expect(screen.getByText('Second')).toBeTruthy();
  });
});
