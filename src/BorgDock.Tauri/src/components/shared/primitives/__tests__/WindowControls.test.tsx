import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockWin = vi.hoisted(() => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => mockWin,
}));

import { WindowControls } from '../WindowControls';

describe('WindowControls', () => {
  it('renders three buttons and wires them to window APIs', () => {
    render(<WindowControls />);
    const min = screen.getByLabelText('Minimize');
    const max = screen.getByLabelText('Maximize');
    const close = screen.getByLabelText('Close');
    fireEvent.click(min);
    fireEvent.click(max);
    fireEvent.click(close);
    expect(mockWin.minimize).toHaveBeenCalled();
    expect(mockWin.toggleMaximize).toHaveBeenCalled();
    expect(mockWin.close).toHaveBeenCalled();
  });
});
