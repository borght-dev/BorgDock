import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { usePrStore } from '@/stores/pr-store';

// Mock Tauri plugin-store (used by pr-store indirectly)
vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(() => Promise.resolve({ get: vi.fn(), set: vi.fn(), save: vi.fn() })),
}));

import { SearchBar } from '../SearchBar';

describe('SearchBar', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    usePrStore.setState({ searchQuery: '' });
  });

  it('renders search input with placeholder', () => {
    render(<SearchBar />);
    expect(screen.getByPlaceholderText('Filter pull requests...')).toBeTruthy();
  });

  it('updates input value on change', () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Filter pull requests...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test query' } });
    expect(input.value).toBe('test query');
  });

  it('debounces search query update to store (300ms)', () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Filter pull requests...');
    fireEvent.change(input, { target: { value: 'hello' } });

    // Before debounce fires, store should still be empty
    expect(usePrStore.getState().searchQuery).toBe('');

    // Advance past debounce
    act(() => { vi.advanceTimersByTime(300); });
    expect(usePrStore.getState().searchQuery).toBe('hello');
  });

  it('resets debounce timer on rapid typing', () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Filter pull requests...');

    fireEvent.change(input, { target: { value: 'h' } });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.change(input, { target: { value: 'he' } });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.change(input, { target: { value: 'hel' } });
    act(() => { vi.advanceTimersByTime(300); });

    // Only the final value should be set
    expect(usePrStore.getState().searchQuery).toBe('hel');
  });

  it('does not show clear button when input is empty', () => {
    render(<SearchBar />);
    expect(screen.queryByLabelText('Clear search')).toBeNull();
  });

  it('shows clear button when input has text', () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Filter pull requests...');
    fireEvent.change(input, { target: { value: 'something' } });
    expect(screen.getByLabelText('Clear search')).toBeTruthy();
  });

  it('clears input and store when clear button is clicked', () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Filter pull requests...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test' } });
    act(() => { vi.advanceTimersByTime(300); });
    expect(usePrStore.getState().searchQuery).toBe('test');

    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(input.value).toBe('');
    expect(usePrStore.getState().searchQuery).toBe('');
  });

  it('applies focus styling on focus and removes on blur', () => {
    render(<SearchBar />);
    const input = screen.getByPlaceholderText('Filter pull requests...');
    const wrapper = input.parentElement as HTMLElement;

    fireEvent.focus(input);
    // When focused, box-shadow should contain the accent color mix
    expect(wrapper.style.boxShadow).toContain('color-mix');

    fireEvent.blur(input);
    expect(wrapper.style.boxShadow).not.toContain('color-mix');
  });

  it('cleans up timer on unmount', () => {
    const { unmount } = render(<SearchBar />);
    const input = screen.getByPlaceholderText('Filter pull requests...');
    fireEvent.change(input, { target: { value: 'pending' } });
    unmount();
    // Should not throw or update store after unmount
    act(() => { vi.advanceTimersByTime(300); });
    expect(usePrStore.getState().searchQuery).toBe('');
  });
});
