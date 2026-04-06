import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeApiSettings } from '@/types';
import { ClaudeApiSection } from '../ClaudeApiSection';

function makeApi(overrides?: Partial<ClaudeApiSettings>): ClaudeApiSettings {
  return {
    model: 'claude-sonnet-4-6',
    maxTokens: 1024,
    ...overrides,
  };
}

describe('ClaudeApiSection', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  afterEach(cleanup);

  it('renders API Key input as password', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    const input = screen.getByPlaceholderText('sk-ant-...') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('');
  });

  it('renders API Key with existing value', () => {
    render(
      <ClaudeApiSection claudeApi={makeApi({ apiKey: 'sk-ant-test' })} onChange={onChange} />,
    );
    const input = screen.getByPlaceholderText('sk-ant-...') as HTMLInputElement;
    expect(input.value).toBe('sk-ant-test');
  });

  it('updates API Key', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), {
      target: { value: 'sk-ant-new' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-ant-new' }));
  });

  it('sets apiKey to undefined when cleared', () => {
    render(
      <ClaudeApiSection claudeApi={makeApi({ apiKey: 'sk-ant-test' })} onChange={onChange} />,
    );
    fireEvent.change(screen.getByPlaceholderText('sk-ant-...'), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }));
  });

  it('renders Model select with correct default', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    expect(screen.getByDisplayValue('Claude Sonnet 4.6')).toBeDefined();
  });

  it('renders all model options', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    expect(screen.getByText('Claude Sonnet 4.6')).toBeDefined();
    expect(screen.getByText('Claude Haiku 4.5')).toBeDefined();
    expect(screen.getByText('Claude Opus 4.6')).toBeDefined();
  });

  it('updates model selection', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('Claude Sonnet 4.6'), {
      target: { value: 'claude-opus-4-6' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-6' }),
    );
  });

  it('renders Max Tokens input with correct value', () => {
    render(<ClaudeApiSection claudeApi={makeApi({ maxTokens: 2048 })} onChange={onChange} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('2048');
  });

  it('updates max tokens', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2048' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 2048 }));
  });

  it('defaults to 1024 when max tokens is cleared', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 1024 }));
  });

  it('defaults to 1024 for non-numeric input', () => {
    render(<ClaudeApiSection claudeApi={makeApi()} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 1024 }));
  });

  it('preserves other fields when updating one', () => {
    const api = makeApi({ apiKey: 'sk-test', model: 'claude-opus-4-6', maxTokens: 2048 });
    render(<ClaudeApiSection claudeApi={api} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4096' } });
    expect(onChange).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      model: 'claude-opus-4-6',
      maxTokens: 4096,
    });
  });
});
