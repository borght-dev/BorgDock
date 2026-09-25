import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiSettings } from '@/types';
import { AppearanceSection } from '../AppearanceSection';

vi.mock('@tauri-apps/plugin-autostart', () => ({
  enable: vi.fn().mockResolvedValue(undefined),
  disable: vi.fn().mockResolvedValue(undefined),
  isEnabled: vi.fn().mockResolvedValue(false),
}));

function makeUi(overrides?: Partial<UiSettings>): UiSettings {
  return {
    theme: 'system',
    globalHotkey: 'Ctrl+Win+Shift+G',
    flyoutHotkey: 'Ctrl+Win+Shift+F',
    editorCommand: 'code',
    runAtStartup: false,
    quickReviewHotkey: '',
    startMinimizedToTray: false,
    restoreLastSelection: true,
    ...overrides,
  };
}

describe('AppearanceSection', () => {
  let onChange: ReturnType<typeof vi.fn<(u: UiSettings) => void>>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  afterEach(cleanup);

  // 1. Theme Seg2 renders with current value highlighted
  it('renders theme Seg2 with System highlighted', () => {
    render(<AppearanceSection ui={makeUi({ theme: 'system' })} onChange={onChange} />);
    const systemBtn = screen.getByText('System').closest('button')!;
    expect(systemBtn.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Light').closest('button')!.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Dark').closest('button')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('edits the stale threshold, saving whole days from 1 to 90 only', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    const input = screen.getByLabelText('Stale after days') as HTMLInputElement;
    expect(input.value).toBe('7');
    expect(input.min).toBe('1');
    expect(input.max).toBe('90');
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.change(input, { target: { value: '120' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '10' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ staleAfterDays: 10 }));
  });

  it('clamps the stale threshold into range on blur', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    const input = screen.getByLabelText('Stale after days') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '120' } });
    fireEvent.blur(input);
    expect(input.value).toBe('90');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ staleAfterDays: 90 }));
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(input.value).toBe('1');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ staleAfterDays: 1 }));
  });

  it('puts the stale threshold back when the field is left empty', () => {
    render(<AppearanceSection ui={makeUi({ staleAfterDays: 12 })} onChange={onChange} />);
    const input = screen.getByLabelText('Stale after days') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(input.value).toBe('12');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches theme to dark', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Dark'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('switches theme to light', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Light'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light' }));
  });

  it('switches theme to system', () => {
    render(<AppearanceSection ui={makeUi({ theme: 'dark' })} onChange={onChange} />);
    fireEvent.click(screen.getByText('System'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: 'system' }));
  });

  // 2. HotkeyRecorder renders — at least one is in the DOM
  it('renders at least one HotkeyRecorder for globalHotkey', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    // HotkeyRecorder renders the hotkey value as button text
    expect(screen.getByText('Ctrl+Win+Shift+G')).toBeDefined();
  });

  it('renders flyout hotkey recorder', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    expect(screen.getByText('Ctrl+Win+Shift+F')).toBeDefined();
  });

  // 5. Run-at-startup toggle clicking enable when off → calls onChange + autostart.enable
  it('toggles run at startup on and calls autostart.enable', async () => {
    const { enable } = await import('@tauri-apps/plugin-autostart');
    render(<AppearanceSection ui={makeUi({ runAtStartup: false })} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Run at startup' });
    fireEvent.click(toggle);
    // autostart.enable is called async; wait a tick
    await vi.waitFor(() => expect(enable).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ runAtStartup: true }));
  });

  it('toggles run at startup off and calls autostart.disable', async () => {
    const { disable } = await import('@tauri-apps/plugin-autostart');
    render(<AppearanceSection ui={makeUi({ runAtStartup: true })} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Run at startup' });
    fireEvent.click(toggle);
    await vi.waitFor(() => expect(disable).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ runAtStartup: false }));
  });

  // 6. WT profile TextInput round-trips through onChange
  it('updates Windows Terminal profile via TextInput', () => {
    render(
      <AppearanceSection
        ui={makeUi({ windowsTerminalProfile: 'PowerShell 7' })}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Windows Terminal profile' });
    fireEvent.change(input, { target: { value: 'Ubuntu' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ windowsTerminalProfile: 'Ubuntu' }),
    );
  });

  it('clears Windows Terminal profile to undefined when empty', () => {
    render(
      <AppearanceSection
        ui={makeUi({ windowsTerminalProfile: 'PowerShell 7' })}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Windows Terminal profile' });
    fireEvent.change(input, { target: { value: '   ' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ windowsTerminalProfile: undefined }),
    );
  });

  // New toggles
  it('renders start minimized toggle', () => {
    render(<AppearanceSection ui={makeUi({ startMinimizedToTray: false })} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Start minimized to tray' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('renders restore last selection toggle (on)', () => {
    render(<AppearanceSection ui={makeUi({ restoreLastSelection: true })} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Restore last selection' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('reduce motion toggle defaults to off and turns on', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Reduce motion' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ reduceMotion: true }));
  });

  it('reduce motion toggle turns off when on', () => {
    render(<AppearanceSection ui={makeUi({ reduceMotion: true })} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Reduce motion' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ reduceMotion: false }));
  });

  it('new layout (preview) toggle writes layoutV3', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'New layout (preview)' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ layoutV3: true }));
  });

  it('preserves other fields when updating one', () => {
    const ui = makeUi({ theme: 'dark' });
    render(<AppearanceSection ui={ui} onChange={onChange} />);
    fireEvent.click(screen.getByText('Light'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'light',
      }),
    );
  });
});
