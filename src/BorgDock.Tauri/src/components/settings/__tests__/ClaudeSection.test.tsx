import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeCodeSettings } from '@/types';
import { ClaudeSection } from '../ClaudeSection';

function makeClaude(overrides?: Partial<ClaudeCodeSettings>): ClaudeCodeSettings {
  return {
    defaultPostFixAction: 'commitAndNotify',
    ...overrides,
  };
}

describe('ClaudeSection', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  afterEach(cleanup);

  // 1. Post-fix Select shows current value
  it('Post-fix Select shows current value', () => {
    render(<ClaudeSection claudeCode={makeClaude({ defaultPostFixAction: 'commitAndNotify' })} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Post-fix action' }) as HTMLSelectElement;
    expect(select.value).toBe('commitAndNotify');
  });

  it('Post-fix Select shows commitOnly value', () => {
    render(<ClaudeSection claudeCode={makeClaude({ defaultPostFixAction: 'commitOnly' })} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Post-fix action' }) as HTMLSelectElement;
    expect(select.value).toBe('commitOnly');
  });

  it('Post-fix Select calls onChange with new value', () => {
    render(<ClaudeSection claudeCode={makeClaude()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Post-fix action' }), {
      target: { value: 'notifyOnly' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPostFixAction: 'notifyOnly' }),
    );
  });

  it('Post-fix Select calls onChange with none', () => {
    render(<ClaudeSection claudeCode={makeClaude()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Post-fix action' }), {
      target: { value: 'none' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPostFixAction: 'none' }),
    );
  });

  // 2. Path TextInput round-trips onChange (sets undefined for empty)
  it('Path TextInput renders with empty value when claudeCodePath is undefined', () => {
    render(<ClaudeSection claudeCode={makeClaude()} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Claude Code path' }) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('claude (default)');
  });

  it('Path TextInput renders with existing path value', () => {
    render(<ClaudeSection claudeCode={makeClaude({ claudeCodePath: '/usr/local/bin/claude' })} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Claude Code path' }) as HTMLInputElement;
    expect(input.value).toBe('/usr/local/bin/claude');
  });

  it('Path TextInput calls onChange with new value', () => {
    render(<ClaudeSection claudeCode={makeClaude()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Claude Code path' }), {
      target: { value: '/custom/claude' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ claudeCodePath: '/custom/claude' }),
    );
  });

  it('Path TextInput sets claudeCodePath to undefined when cleared', () => {
    render(<ClaudeSection claudeCode={makeClaude({ claudeCodePath: '/custom/claude' })} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Claude Code path' }), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ claudeCodePath: undefined }),
    );
  });

  it('Path TextInput trims whitespace and sets undefined for blank', () => {
    render(<ClaudeSection claudeCode={makeClaude({ claudeCodePath: '/custom/claude' })} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Claude Code path' }), {
      target: { value: '   ' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ claudeCodePath: undefined }),
    );
  });
});
