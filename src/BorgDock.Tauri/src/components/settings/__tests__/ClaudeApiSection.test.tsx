import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeApiSettings } from '@/types';
import { ClaudeApiSection } from '../ClaudeApiSection';

function makeApi(overrides?: Partial<ClaudeApiSettings>): ClaudeApiSettings {
  return {
    model: 'claude-sonnet-4-6',
    maxTokens: 1024,
    prSummaryEnabled: true,
    diffExplanationsEnabled: true,
    reviewNudgePhrasingEnabled: false,
    commitMessageSuggestionsEnabled: false,
    ...overrides,
  };
}

describe('ClaudeApiSection', () => {
  let onChange: ReturnType<typeof vi.fn<(c: ClaudeApiSettings) => void>>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  afterEach(cleanup);

  // 1. API key field is type=password
  it('API key field is type=password', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    const input = screen.getByLabelText('Anthropic API key') as HTMLInputElement;
    expect(input.type).toBe('password');
  });

  it('API key field is empty when apiKey is undefined', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    const input = screen.getByLabelText('Anthropic API key') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('API key field shows existing value', () => {
    render(<ClaudeApiSection claudeApi={makeApi({ apiKey: 'sk-ant-test' })} onChange={onChange} />);
    const input = screen.getByLabelText('Anthropic API key') as HTMLInputElement;
    expect(input.value).toBe('sk-ant-test');
  });

  it('API key calls onChange with new value', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Anthropic API key'), {
      target: { value: 'sk-ant-new' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-ant-new' }));
  });

  it('API key calls onChange with undefined when cleared', () => {
    render(<ClaudeApiSection claudeApi={makeApi({ apiKey: 'sk-ant-test' })} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Anthropic API key'), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }));
  });

  // 2. Model Select renders
  it('Model Select renders with current value', () => {
    render(<ClaudeApiSection claudeApi={makeApi({ model: 'claude-sonnet-4-6' })} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Anthropic model' }) as HTMLSelectElement;
    expect(select.value).toBe('claude-sonnet-4-6');
  });

  it('Model Select renders all options', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Anthropic model' });
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toContain('Claude Sonnet 4.6');
    expect(options).toContain('Claude Haiku 4.5');
    expect(options).toContain('Claude Opus 4.6');
  });

  it('Model Select calls onChange with selected model', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Anthropic model' }), {
      target: { value: 'claude-opus-4-6' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-4-6' }));
  });

  // 3. Max-tokens TextInput round-trips Number conversion
  it('Max tokens input renders with current value', () => {
    render(<ClaudeApiSection claudeApi={makeApi({ maxTokens: 2048 })} onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: 'Max tokens' }) as HTMLInputElement;
    expect(input.value).toBe('2048');
  });

  it('Max tokens input calls onChange with Number conversion', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Max tokens' }), {
      target: { value: '4096' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 4096 }));
  });

  it('Max tokens defaults to 1024 for empty input', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Max tokens' }), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 1024 }));
  });

  it('preserves other fields when updating max tokens', () => {
    const api = makeApi({ apiKey: 'sk-test', model: 'claude-opus-4-6', maxTokens: 2048 });
    render(<ClaudeApiSection claudeApi={api} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Max tokens' }), {
      target: { value: '4096' },
    });
    expect(onChange).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      model: 'claude-opus-4-6',
      maxTokens: 4096,
      prSummaryEnabled: true,
      diffExplanationsEnabled: true,
      reviewNudgePhrasingEnabled: false,
      commitMessageSuggestionsEnabled: false,
    });
  });
});
