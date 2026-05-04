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
    sidebarEdge: 'right',
    sidebarMode: 'pinned',
    sidebarWidthPx: 800,
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
  let onChange: ReturnType<typeof vi.fn>;

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

  // 2. Sidebar edge Seg2 renders both options
  it('renders sidebar edge Seg2 with both options', () => {
    render(<AppearanceSection ui={makeUi({ sidebarEdge: 'right' })} onChange={onChange} />);
    expect(screen.getByText('Left').closest('button')!.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Right').closest('button')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('switches sidebar edge to left', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Left'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sidebarEdge: 'left' }));
  });

  // Sidebar Mode
  it('renders sidebar mode Seg2 with both options', () => {
    render(<AppearanceSection ui={makeUi({ sidebarMode: 'pinned' })} onChange={onChange} />);
    expect(screen.getByText('Pinned').closest('button')!.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Floating').closest('button')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('switches sidebar mode to floating', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Floating'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sidebarMode: 'floating' }));
  });

  // 3. Sidebar width slider has aria-valuenow matching sidebarWidthPx
  it('renders sidebar width slider with correct aria-valuenow', () => {
    render(<AppearanceSection ui={makeUi({ sidebarWidthPx: 800 })} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe('800');
  });

  it('updates sidebar width via keyboard', () => {
    render(<AppearanceSection ui={makeUi({ sidebarWidthPx: 800 })} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sidebarWidthPx: 810 }));
  });

  // 4. HotkeyRecorder renders — at least one is in the DOM
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
    render(<AppearanceSection ui={makeUi({ windowsTerminalProfile: 'PowerShell 7' })} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Windows Terminal profile' });
    fireEvent.change(input, { target: { value: 'Ubuntu' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ windowsTerminalProfile: 'Ubuntu' }));
  });

  it('clears Windows Terminal profile to undefined when empty', () => {
    render(<AppearanceSection ui={makeUi({ windowsTerminalProfile: 'PowerShell 7' })} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Windows Terminal profile' });
    fireEvent.change(input, { target: { value: '   ' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ windowsTerminalProfile: undefined }));
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

  it('preserves other fields when updating one', () => {
    const ui = makeUi({ theme: 'dark', sidebarEdge: 'left' });
    render(<AppearanceSection ui={ui} onChange={onChange} />);
    fireEvent.click(screen.getByText('Floating'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'dark',
        sidebarEdge: 'left',
        sidebarMode: 'floating',
      }),
    );
  });
});
