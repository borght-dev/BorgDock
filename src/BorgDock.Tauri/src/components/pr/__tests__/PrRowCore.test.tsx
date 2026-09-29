import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ListPrSpec, listPr } from '../__fixtures__/pr-list-data';
import { PrRowCore } from '../PrRowCore';
import { type RowChipKind, toPrCardData } from '../pr-card-data';

afterEach(cleanup);

const NOW = Date.parse('2026-09-25T12:00:00Z');

function renderRow(
  spec: Partial<ListPrSpec> = {},
  props: Partial<Parameters<typeof PrRowCore>[0]> = {},
  isMine = false,
) {
  const prw = listPr({ number: 42, title: 'Add cool feature', repo: 'acme/app', ...spec }, NOW);
  const utils = render(<PrRowCore pr={toPrCardData(prw, isMine)} now={NOW} {...props} />);
  const row = utils.container.querySelector<HTMLElement>('.bd-wb-row')!;
  return { ...utils, row, prw };
}

describe('PrRowCore', () => {
  it('renders avatar, title, meta line, checks, one chip and the number', () => {
    const { row } = renderRow({ author: 'mira', updatedHoursAgo: 2, checks: { total: 6 } });
    expect(row.querySelector('.bd-avatar')).toHaveTextContent('MI');
    expect(screen.getByText('Add cool feature')).toHaveClass('bd-wb-row__title');
    expect(row.querySelector('.bd-wb-row__meta')).toHaveTextContent('mira in app, updated 2 h ago');
    expect(row.querySelector('.bd-checkbar')).toHaveTextContent('6 passing');
    expect(row.querySelectorAll('.bd-wb-chip')).toHaveLength(1);
    expect(row.querySelector('.bd-wb-row__num')).toHaveTextContent('#42');
  });

  it('draws no labels, ring, per-check glyphs or hover bar', () => {
    const { row } = renderRow({ labels: ['needs-design', 'ux'], checks: { total: 80, fail: 2 } });
    expect(row).not.toHaveTextContent('needs-design');
    expect(row.querySelector('.bd-ring')).toBeNull();
    expect(row.querySelector('.bd-pr-item__actions')).toBeNull();
    expect(row.querySelector('.bd-pill')).toBeNull();
  });

  it('carries the keyboard-nav and FLIP hooks', () => {
    const { row } = renderRow();
    expect(row).toHaveAttribute('data-pr-card');
    expect(row).toHaveAttribute('data-pr-row');
    expect(row).toHaveAttribute('data-pr-number', '42');
    expect(row).toHaveAttribute('data-pr-owner', 'acme');
    expect(row).toHaveAttribute('data-pr-repo', 'app');
    expect(row).toHaveAttribute('data-key', 'acme/app#42');
  });

  it('leaves data-key off rows a virtualizer recycles', () => {
    const { row } = renderRow({}, { animateKey: false });
    expect(row).not.toHaveAttribute('data-key');
    expect(row).toHaveAttribute('data-pr-card');
  });

  describe('the chip', () => {
    it.each<[string, Partial<ListPrSpec>, RowChipKind, string]>([
      ['approved', { reviewStatus: 'approved' }, 'approved', 'Approved'],
      ['changes requested', { reviewStatus: 'changesRequested' }, 'changes', 'Changes requested'],
      ['review requested', { requestedReviewers: ['koen'] }, 'requested', 'Review requested'],
      ['pending review', { reviewStatus: 'pending' }, 'requested', 'Review requested'],
      ['commented', { reviewStatus: 'commented' }, 'commented', 'Commented'],
      ['draft', { isDraft: true, reviewStatus: 'commented' }, 'draft', 'Draft'],
      ['no review', {}, 'none', 'No review yet'],
      ['conflicts', { mergeable: false, reviewStatus: 'approved' }, 'conflicts', 'Conflicts'],
      ['merged', { mergedHoursAgo: 1, mergeable: false }, 'merged', 'Merged'],
      ['closed', { closedHoursAgo: 1 }, 'closed', 'Closed'],
    ])('shows %s', (_, spec, kind, label) => {
      const { row } = renderRow(spec);
      const chip = row.querySelector('.bd-wb-chip')!;
      expect(chip).toHaveAttribute('data-chip', kind);
      expect(chip).toHaveClass(`bd-wb-chip--${kind}`);
      expect(chip).toHaveTextContent(label);
    });
  });

  describe('checks', () => {
    it('shows failing checks in red', () => {
      const { row } = renderRow({ checks: { total: 80, fail: 2 } });
      const bar = row.querySelector('.bd-checkbar')!;
      expect(bar).toHaveClass('bd-checkbar--fail');
      expect(bar).toHaveTextContent('2 failing');
      expect(bar).toHaveAttribute('title', '2 failing');
    });

    it('shows running checks in amber', () => {
      const { row } = renderRow({ checks: { total: 12, run: 5 } });
      const bar = row.querySelector('.bd-checkbar')!;
      expect(bar).toHaveClass('bd-checkbar--run');
      expect(bar).toHaveTextContent('7 of 12, running');
    });

    it('shows passing checks', () => {
      const { row } = renderRow({ checks: { total: 80 } });
      const bar = row.querySelector('.bd-checkbar')!;
      expect(bar).toHaveClass('bd-checkbar--ok');
      expect(bar).toHaveTextContent('80 passing');
    });

    it('shows "No checks" when card data has no counts', () => {
      const { prw } = renderRow();
      cleanup();
      const data = { ...toPrCardData(prw, false), checks: undefined };
      const { container } = render(<PrRowCore pr={data} now={NOW} />);
      expect(container.querySelector('.bd-checkbar')).toHaveTextContent('No checks');
    });
  });

  it('keeps the own-PR avatar styling', () => {
    const mine = renderRow({}, {}, true);
    expect(mine.row.querySelector('.bd-avatar')).toHaveClass('bd-avatar--own');
    expect(mine.row).toHaveAttribute('data-mine', 'true');
    cleanup();
    const theirs = renderRow({ author: 'mira' });
    expect(theirs.row.querySelector('.bd-avatar')).toHaveClass('bd-avatar--them');
  });

  it('marks an open PR with no update in seven days as stale', () => {
    const { row } = renderRow({ updatedHoursAgo: 8 * 24 });
    expect(row.querySelector('.bd-wb-row__meta')).toHaveTextContent(
      'koen in app, updated 8 d ago, stale',
    );
  });

  it('does not call a fresh or a closed PR stale', () => {
    const fresh = renderRow({ updatedHoursAgo: 6 * 24 });
    expect(fresh.row.querySelector('.bd-wb-row__meta')).not.toHaveTextContent('stale');
    cleanup();
    const merged = renderRow({ updatedHoursAgo: 30 * 24, mergedHoursAgo: 30 * 24 });
    expect(merged.row.querySelector('.bd-wb-row__meta')).not.toHaveTextContent('stale');
  });

  it('is 42 px comfortable with the meta line, 32 px compact without it', () => {
    const comfortable = renderRow();
    expect(comfortable.row).toHaveClass('bd-wb-row--comfortable');
    expect(comfortable.row).toHaveAttribute('data-density', 'comfortable');
    expect(comfortable.row.querySelector('.bd-wb-row__meta')).not.toBeNull();
    cleanup();
    const compact = renderRow({}, { density: 'compact' });
    expect(compact.row).toHaveClass('bd-wb-row--compact');
    expect(compact.row).toHaveAttribute('data-density', 'compact');
    expect(compact.row.querySelector('.bd-wb-row__meta')).toBeNull();
    expect(compact.row.querySelector('.bd-checkbar')).not.toBeNull();
  });

  it('marks the selected row', () => {
    const { row } = renderRow({}, { selected: true });
    expect(row).toHaveAttribute('data-selected', 'true');
    expect(row).toHaveAttribute('aria-current', 'true');
  });

  it('is a keyboard-operable button when clickable; Enter is a click with detail 0', () => {
    const onClick = vi.fn();
    const { row } = renderRow({}, { onClick });
    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]![0].detail ?? 0).toBe(0);
  });

  it('is plain content without a click handler', () => {
    const { row } = renderRow();
    expect(row).not.toHaveAttribute('role');
    expect(row).not.toHaveAttribute('tabindex');
  });

  it('dates a merged or closed PR by its merge or close, not its last update', () => {
    const merged = renderRow({ updatedHoursAgo: 1, mergedHoursAgo: 4 });
    expect(merged.row.querySelector('.bd-wb-row__meta')).toHaveTextContent(
      'koen in app, merged 4 h ago',
    );
    cleanup();
    const closed = renderRow({ updatedHoursAgo: 1, closedHoursAgo: 30 });
    expect(closed.row.querySelector('.bd-wb-row__meta')).toHaveTextContent(
      'koen in app, closed yesterday',
    );
  });

  it('carries its owner/repo#number key even without data-key', () => {
    const { row } = renderRow({}, { animateKey: false });
    expect(row).toHaveAttribute('data-pr-key', 'acme/app#42');
  });

  it('is labelled with its title and number when clickable', () => {
    const { row } = renderRow({}, { onClick: vi.fn() });
    expect(row).toHaveAccessibleName('Add cool feature, #42');
  });
});
