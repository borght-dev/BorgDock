import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Tabs } from '../Tabs';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'checks', label: 'Checks', count: 3 },
  { id: 'files', label: 'Files', count: 12 },
];

describe('Tabs', () => {
  it('renders a tablist with one button per tab', () => {
    render(<Tabs value="overview" onChange={() => {}} tabs={TABS} />);
    const list = screen.getByRole('tablist');
    expect(list).toHaveClass('bd-tabs');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('highlights the active tab with bd-tab--active', () => {
    render(<Tabs value="checks" onChange={() => {}} tabs={TABS} />);
    const checks = screen.getByRole('tab', { name: /checks/i });
    expect(checks).toHaveClass('bd-tab--active');
    expect(checks).toHaveAttribute('aria-selected', 'true');
  });

  it('marks non-selected tabs as inactive', () => {
    render(<Tabs value="checks" onChange={() => {}} tabs={TABS} />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    expect(overview).toHaveClass('bd-tab--inactive');
    expect(overview).toHaveAttribute('aria-selected', 'false');
  });

  it('renders the count badge when provided', () => {
    render(<Tabs value="overview" onChange={() => {}} tabs={TABS} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('omits the count badge when count is undefined', () => {
    render(<Tabs value="overview" onChange={() => {}} tabs={TABS} />);
    const overview = screen.getByRole('tab', { name: /overview/i });
    expect(overview.querySelector('.bd-tab__count')).toBeNull();
  });

  it('fires onChange with the tab id on click', () => {
    const onChange = vi.fn();
    render(<Tabs value="overview" onChange={onChange} tabs={TABS} />);
    fireEvent.click(screen.getByRole('tab', { name: /files/i }));
    expect(onChange).toHaveBeenCalledWith('files');
  });

  it('applies the dense modifier when dense=true', () => {
    render(<Tabs value="overview" onChange={() => {}} tabs={TABS} dense />);
    expect(screen.getByRole('tablist')).toHaveClass('bd-tabs--dense');
  });
});
