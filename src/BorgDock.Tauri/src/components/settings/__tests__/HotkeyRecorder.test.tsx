import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HotkeyRecorder } from '../HotkeyRecorder';

describe('HotkeyRecorder', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  afterEach(cleanup);

  it('renders current hotkey value', () => {
    render(<HotkeyRecorder value="Ctrl+Shift+G" onChange={onChange} />);
    expect(screen.getByText('Ctrl+Shift+G')).toBeDefined();
  });

  it('shows "Not set" when value is empty', () => {
    render(<HotkeyRecorder value="" onChange={onChange} />);
    expect(screen.getByText('Not set')).toBeDefined();
  });

  it('enters recording mode on click', () => {
    render(<HotkeyRecorder value="Ctrl+G" onChange={onChange} />);
    fireEvent.click(screen.getByText('Ctrl+G'));
    expect(screen.getByText('Press a key combo...')).toBeDefined();
  });

  it('shows Cancel button while recording', () => {
    render(<HotkeyRecorder value="Ctrl+G" onChange={onChange} />);
    fireEvent.click(screen.getByText('Ctrl+G'));
    expect(screen.getByText('Cancel')).toBeDefined();
  });

  it('cancels recording on Cancel click', () => {
    render(<HotkeyRecorder value="Ctrl+G" onChange={onChange} />);
    fireEvent.click(screen.getByText('Ctrl+G'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Ctrl+G')).toBeDefined();
    expect(screen.queryByText('Cancel')).toBeNull();
  });

  it('cancels recording on Escape key', () => {
    render(<HotkeyRecorder value="Ctrl+G" onChange={onChange} />);
    fireEvent.click(screen.getByText('Ctrl+G'));
    expect(screen.getByText('Press a key combo...')).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('Ctrl+G')).toBeDefined();
  });

  it('records a valid key combo (modifier + key)', () => {
    render(<HotkeyRecorder value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Not set'));

    // Press Ctrl+K
    fireEvent.keyDown(document, {
      key: 'k',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    expect(onChange).toHaveBeenCalledWith('Ctrl+K');
  });

  it('records multi-modifier combo', () => {
    render(<HotkeyRecorder value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Not set'));

    fireEvent.keyDown(document, {
      key: 'g',
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
      metaKey: false,
    });

    expect(onChange).toHaveBeenCalledWith('Ctrl+Shift+G');
  });

  it('shows modifier keys while pressing them (before final key)', () => {
    render(<HotkeyRecorder value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Not set'));

    // Press just Ctrl (modifier-only)
    fireEvent.keyDown(document, {
      key: 'Control',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    expect(screen.getByText('Ctrl')).toBeDefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('normalizes single character keys to uppercase', () => {
    render(<HotkeyRecorder value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Not set'));

    fireEvent.keyDown(document, {
      key: 'a',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    expect(onChange).toHaveBeenCalledWith('Ctrl+A');
  });

  it('keeps multi-character key names as-is', () => {
    render(<HotkeyRecorder value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Not set'));

    fireEvent.keyDown(document, {
      key: 'F5',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    expect(onChange).toHaveBeenCalledWith('Ctrl+F5');
  });

  it('records Alt modifier', () => {
    render(<HotkeyRecorder value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Not set'));

    fireEvent.keyDown(document, {
      key: 'p',
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
      metaKey: false,
    });

    expect(onChange).toHaveBeenCalledWith('Alt+P');
  });

  it('records Meta/Super modifier', () => {
    render(<HotkeyRecorder value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Not set'));

    fireEvent.keyDown(document, {
      key: 's',
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: true,
    });

    expect(onChange).toHaveBeenCalledWith('Super+S');
  });

  it('exits recording mode after successful combo', () => {
    render(<HotkeyRecorder value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Not set'));

    fireEvent.keyDown(document, {
      key: 'k',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    // Should no longer show Cancel
    expect(screen.queryByText('Cancel')).toBeNull();
  });

  it('toggles recording off when clicking button while recording', () => {
    render(<HotkeyRecorder value="Ctrl+G" onChange={onChange} />);
    const btn = screen.getByText('Ctrl+G');
    fireEvent.click(btn);
    expect(screen.getByText('Press a key combo...')).toBeDefined();

    // Click the main button again (the one showing "Press a key combo...")
    fireEvent.click(screen.getByText('Press a key combo...'));
    expect(screen.getByText('Ctrl+G')).toBeDefined();
  });
});
