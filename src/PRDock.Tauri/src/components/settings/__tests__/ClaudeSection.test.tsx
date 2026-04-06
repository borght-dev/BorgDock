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

  it('renders Post-Fix Action select with default value', () => {
    render(<ClaudeSection claudeCode={makeClaude()} onChange={onChange} />);
    const select = screen.getByDisplayValue('Commit & Notify') as HTMLSelectElement;
    expect(select).toBeDefined();
  });

  it('renders all post-fix action options', () => {
    render(<ClaudeSection claudeCode={makeClaude()} onChange={onChange} />);
    expect(screen.getByText('Commit & Notify')).toBeDefined();
    expect(screen.getByText('Commit Only')).toBeDefined();
    expect(screen.getByText('Notify Only')).toBeDefined();
    expect(screen.getByText('None')).toBeDefined();
  });

  it('updates post-fix action', () => {
    render(<ClaudeSection claudeCode={makeClaude()} onChange={onChange} />);
    const select = screen.getByDisplayValue('Commit & Notify');
    fireEvent.change(select, { target: { value: 'commitOnly' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPostFixAction: 'commitOnly' }),
    );
  });

  it('updates to notifyOnly', () => {
    render(<ClaudeSection claudeCode={makeClaude()} onChange={onChange} />);
    const select = screen.getByDisplayValue('Commit & Notify');
    fireEvent.change(select, { target: { value: 'notifyOnly' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPostFixAction: 'notifyOnly' }),
    );
  });

  it('updates to none', () => {
    render(<ClaudeSection claudeCode={makeClaude()} onChange={onChange} />);
    const select = screen.getByDisplayValue('Commit & Notify');
    fireEvent.change(select, { target: { value: 'none' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPostFixAction: 'none' }),
    );
  });

  it('renders Claude Code Path input', () => {
    render(<ClaudeSection claudeCode={makeClaude()} onChange={onChange} />);
    const input = screen.getByPlaceholderText('claude (default)') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('renders Claude Code Path with existing value', () => {
    render(
      <ClaudeSection
        claudeCode={makeClaude({ claudeCodePath: '/usr/local/bin/claude' })}
        onChange={onChange}
      />,
    );
    const input = screen.getByPlaceholderText('claude (default)') as HTMLInputElement;
    expect(input.value).toBe('/usr/local/bin/claude');
  });

  it('updates Claude Code Path', () => {
    render(<ClaudeSection claudeCode={makeClaude()} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('claude (default)'), {
      target: { value: '/custom/path/claude' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ claudeCodePath: '/custom/path/claude' }),
    );
  });

  it('sets claudeCodePath to undefined when cleared', () => {
    render(
      <ClaudeSection
        claudeCode={makeClaude({ claudeCodePath: '/custom/claude' })}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('claude (default)'), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ claudeCodePath: undefined }),
    );
  });

  it('shows correct selected value for each option', () => {
    const actions = ['commitAndNotify', 'commitOnly', 'notifyOnly', 'none'] as const;
    const labels = ['Commit & Notify', 'Commit Only', 'Notify Only', 'None'];

    for (let i = 0; i < actions.length; i++) {
      cleanup();
      render(
        <ClaudeSection
          claudeCode={makeClaude({ defaultPostFixAction: actions[i] })}
          onChange={onChange}
        />,
      );
      expect(screen.getByDisplayValue(labels[i]!)).toBeDefined();
    }
  });
});
