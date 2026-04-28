import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const minimizeMock = vi.fn();
const maximizeMock = vi.fn();
const unmaximizeMock = vi.fn();
const closeMock = vi.fn();
const isMaximizedMock = vi.fn();

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: minimizeMock,
    maximize: maximizeMock,
    unmaximize: unmaximizeMock,
    close: closeMock,
    isMaximized: isMaximizedMock,
  }),
}));

import { WindowTitleBar } from '../WindowTitleBar';

describe('WindowTitleBar', () => {
  beforeEach(() => {
    minimizeMock.mockReset().mockResolvedValue(undefined);
    maximizeMock.mockReset().mockResolvedValue(undefined);
    unmaximizeMock.mockReset().mockResolvedValue(undefined);
    closeMock.mockReset().mockResolvedValue(undefined);
    isMaximizedMock.mockReset().mockResolvedValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the title', () => {
    render(<WindowTitleBar title="My Window" />);
    expect(screen.getByText('My Window')).toBeInTheDocument();
  });

  it('marks the bar as a Tauri drag region', () => {
    const { container } = render(<WindowTitleBar title="Test" />);
    const bar = container.querySelector('[data-tauri-drag-region]');
    expect(bar).not.toBeNull();
  });

  it('calls window.minimize when the Minimize button is clicked', () => {
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    expect(minimizeMock).toHaveBeenCalledOnce();
  });

  it('calls window.maximize when Maximize is clicked on a non-maximized window', async () => {
    isMaximizedMock.mockResolvedValueOnce(false);
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    // Allow the async isMaximized check to resolve
    await new Promise((r) => setTimeout(r, 0));
    expect(maximizeMock).toHaveBeenCalledOnce();
    expect(unmaximizeMock).not.toHaveBeenCalled();
  });

  it('calls window.unmaximize when Maximize is clicked on a maximized window', async () => {
    isMaximizedMock.mockResolvedValueOnce(true);
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(unmaximizeMock).toHaveBeenCalledOnce();
    expect(maximizeMock).not.toHaveBeenCalled();
  });

  it('calls window.close when the Close button is clicked', () => {
    render(<WindowTitleBar title="Test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it('re-renders correctly when the title changes', () => {
    const { rerender } = render(<WindowTitleBar title="First" />);
    expect(screen.getByText('First')).toBeInTheDocument();
    rerender(<WindowTitleBar title="Second" />);
    expect(screen.getByText('Second')).toBeInTheDocument();
  });
});
