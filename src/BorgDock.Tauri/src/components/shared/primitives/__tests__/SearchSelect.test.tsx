import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchSelect, type SearchSelectSection } from '../SearchSelect';

const SECTIONS: SearchSelectSection[] = [
  { label: 'Recent', options: [{ value: 'o/gpt', label: 'GPT', badge: 'Outlook' }] },
  {
    label: 'Gomocha',
    showBadges: false,
    options: [
      { value: 'g/opus', label: 'Opus', badge: 'Gomocha' },
      { value: 'g/sonnet', label: 'Sonnet', badge: 'Gomocha' },
    ],
  },
];

function renderSelect(value = 'o/gpt') {
  const onChange = vi.fn();
  render(<SearchSelect ariaLabel="Model" value={value} sections={SECTIONS} onChange={onChange} />);
  return { onChange, trigger: screen.getByRole('button', { name: 'Model' }) };
}

describe('SearchSelect', () => {
  it('shows the pick and its badge on the trigger', () => {
    const { trigger } = renderSelect('g/opus');
    expect(trigger).toHaveTextContent('Opus');
    expect(trigger).toHaveTextContent('Gomocha');
  });

  it('lists the options per section, the badges only where the section shows them', () => {
    const { trigger } = renderSelect();
    fireEvent.click(trigger);
    const list = screen.getByRole('listbox', { name: 'Model' });
    expect(within(list).getByRole('group', { name: 'Recent' })).toHaveTextContent('GPTOutlook');
    expect(within(list).getByRole('group', { name: 'Gomocha' })).toHaveTextContent('OpusSonnet');
    expect(within(list).getByRole('option', { name: /GPT/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('filters while you type and picks the active option with Enter', () => {
    const { trigger, onChange } = renderSelect();
    fireEvent.click(trigger);
    const filter = screen.getByRole('combobox', { name: 'Filter model' });
    fireEvent.change(filter, { target: { value: 'son' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Sonnet']);
    fireEvent.keyDown(filter, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('g/sonnet');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('moves with the arrows and picks with a click', () => {
    const { trigger, onChange } = renderSelect();
    fireEvent.click(trigger);
    const filter = screen.getByRole('combobox', { name: 'Filter model' });
    fireEvent.keyDown(filter, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Opus' })).toHaveAttribute('data-active', 'true');
    fireEvent.click(screen.getByRole('option', { name: 'Sonnet' }));
    expect(onChange).toHaveBeenCalledWith('g/sonnet');
  });

  it('closes on Esc without letting the Esc reach the page behind it', () => {
    const behind = vi.fn();
    document.addEventListener('keydown', behind, true);
    const { trigger } = renderSelect();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter model' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(behind).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    document.removeEventListener('keydown', behind, true);
  });
});
