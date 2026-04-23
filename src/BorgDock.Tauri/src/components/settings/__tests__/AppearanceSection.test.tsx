import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiSettings } from '@/types';
import { AppearanceSection } from '../AppearanceSection';

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
    badgeEnabled: true,
    badgeStyle: 'GlassCapsule',
    indicatorStyle: 'SegmentRing',
    ...overrides,
  };
}

describe('AppearanceSection', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  afterEach(cleanup);

  // Theme
  it('renders theme buttons', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    expect(screen.getByText('System')).toBeDefined();
    expect(screen.getByText('Light')).toBeDefined();
    expect(screen.getByText('Dark')).toBeDefined();
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

  // Sidebar Edge
  it('renders sidebar edge buttons', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    expect(screen.getByText('Left')).toBeDefined();
    expect(screen.getByText('Right')).toBeDefined();
  });

  it('switches sidebar edge to left', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Left'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sidebarEdge: 'left' }));
  });

  // Sidebar Mode
  it('renders sidebar mode buttons', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    expect(screen.getByText('Pinned')).toBeDefined();
    expect(screen.getByText('Floating')).toBeDefined();
  });

  it('switches sidebar mode to floating', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    fireEvent.click(screen.getByText('Floating'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sidebarMode: 'floating' }));
  });

  // Sidebar Width
  it('renders sidebar width slider', () => {
    render(<AppearanceSection ui={makeUi({ sidebarWidthPx: 800 })} onChange={onChange} />);
    expect(screen.getByText('Sidebar Width: 800px')).toBeDefined();
  });

  it('updates sidebar width', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '600' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sidebarWidthPx: 600 }));
  });

  // Badge Style
  it('renders badge style select', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    expect(screen.getByDisplayValue('GlassCapsule')).toBeDefined();
  });

  it('renders all badge style options', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    const styles = ['GlassCapsule', 'MinimalNotch', 'FloatingIsland', 'LiquidMorph', 'SpectralBar'];
    for (const style of styles) {
      expect(screen.getByText(style)).toBeDefined();
    }
  });

  it('updates badge style', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('GlassCapsule'), {
      target: { value: 'MinimalNotch' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ badgeStyle: 'MinimalNotch' }));
  });

  // Indicator Style
  it('renders indicator style select', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    expect(screen.getByDisplayValue('SegmentRing')).toBeDefined();
  });

  it('updates indicator style', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('SegmentRing'), {
      target: { value: 'SignalDots' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ indicatorStyle: 'SignalDots' }),
    );
  });

  // Run at Startup toggle
  it('renders run at startup toggle (off)', () => {
    render(<AppearanceSection ui={makeUi({ runAtStartup: false })} onChange={onChange} />);
    expect(screen.getByText('Run at startup')).toBeDefined();
  });

  it('toggles run at startup on', () => {
    render(<AppearanceSection ui={makeUi({ runAtStartup: false })} onChange={onChange} />);
    // The toggle button is right after the label
    const label = screen.getByText('Run at startup');
    const toggle = label.closest('div')!.querySelector('button')!;
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ runAtStartup: true }));
  });

  it('toggles run at startup off', () => {
    render(<AppearanceSection ui={makeUi({ runAtStartup: true })} onChange={onChange} />);
    const label = screen.getByText('Run at startup');
    const toggle = label.closest('div')!.querySelector('button')!;
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ runAtStartup: false }));
  });

  // Global Hotkey
  it('renders global hotkey section', () => {
    render(<AppearanceSection ui={makeUi()} onChange={onChange} />);
    expect(screen.getByText('Global Hotkey')).toBeDefined();
    // The HotkeyRecorder shows the current value
    expect(screen.getByText('Ctrl+Win+Shift+G')).toBeDefined();
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
