import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRenderedFiles } from '@/hooks/useRenderedFile';
import type { ReviewCommentDraft } from '@/services/quick-review';
import { RENDERED_STOP, RenderedMarkdown } from '../RenderedMarkdown';

const client = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => client }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));

const FILE = { owner: 'acme', repo: 'shop', path: 'docs/discount-codes.md', ref: 'a1b2c3d4' };

const SOURCE = [
  '# Discount codes', // 1
  '', // 2
  'The API answers with the new total, or with a `reason`.', // 3
  '', // 4
  '## Refusal reasons', // 5
  '', // 6
  '| Reason | Shown |', // 7
  '| --- | --- |', // 8
  '| `expired` | This code ended. |', // 9
  '', // 10
  '- one', // 11
  '- two', // 12
  '', // 13
  'Unchanged closing words.', // 14
].join('\n');

const PATCH = [
  '@@ -1,8 +1,14 @@',
  ' # Discount codes',
  ' ',
  '-The API answers with the new total.',
  '+The API answers with the new total, or with a `reason`.',
  ' ',
  '-## Known limitations',
  '-',
  '-Only one code per order.',
  '-',
  '+## Refusal reasons',
  '+',
  '+| Reason | Shown |',
  '+| --- | --- |',
  '+| `expired` | This code ended. |',
  '+',
  ' - one',
  '+- two',
  ' ',
  ' Unchanged closing words.',
].join('\n');

function draft(line: number, side: 'LEFT' | 'RIGHT' = 'RIGHT'): ReviewCommentDraft {
  return {
    id: `draft-${side}-${line}`,
    path: FILE.path,
    line,
    side,
    body: `About line ${line}`,
    saved: true,
    outdated: false,
  };
}

function show(overrides: Partial<Parameters<typeof RenderedMarkdown>[0]> = {}) {
  const props = {
    file: FILE,
    diff: { patch: PATCH },
    newFile: false,
    drafts: [] as ReviewCommentDraft[],
    renderDraft: (comment: ReviewCommentDraft) => (
      <aside key={comment.id} data-testid="draft">
        {comment.body}
      </aside>
    ),
    onAddComment: vi.fn(),
    onStops: vi.fn(),
    onUnavailable: vi.fn(),
    text: { status: 'ready', value: SOURCE } as const,
    ...overrides,
  };
  const view = render(<RenderedMarkdown {...props} />);
  return { ...view, props };
}

beforeEach(() => {
  client.get.mockReset();
  resetRenderedFiles();
});
afterEach(cleanup);

describe('RenderedMarkdown', () => {
  it('draws the file as a document', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Discount codes' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Unchanged closing words.')).toBeInTheDocument();
  });

  it('marks new blocks added and rewritten ones changed, and nothing else', () => {
    const { container, props } = show();
    const marks = [...container.querySelectorAll('.bd-rendered-change')].map(
      (block) =>
        `${block.getAttribute('data-rendered-change')}: ${block.textContent?.replace(/\s+/g, ' ').trim()}`,
    );
    expect(marks).toEqual([
      'changed: The API answers with the new total, or with a reason.',
      'added: Refusal reasons',
      'added: ReasonShownexpiredThis code ended.',
      'changed: one two',
    ]);
    expect(screen.getByText('Unchanged closing words.').closest('.bd-rendered-change')).toBeNull();
    // Four touched blocks and the marker for the section another one replaced.
    expect(container.querySelectorAll(RENDERED_STOP)).toHaveLength(5);
    expect(props.onStops).toHaveBeenCalledWith(5);
  });

  it('marks the new item of an edited list', () => {
    show();
    expect(screen.getByText('two').closest('li')).toHaveAttribute('data-rendered-row', 'added');
    expect(screen.getByText('one').closest('li')).not.toHaveAttribute('data-rendered-row');
  });

  it('leaves a marker where text was removed and unfolds the old lines', () => {
    const { container } = show();
    const marker = screen.getByRole('button', { name: /3 lines removed here: Known limitations/ });
    // It stands where the section stood: before the block that took its place.
    const stops = [...container.querySelectorAll(RENDERED_STOP)];
    expect(stops.indexOf(marker.parentElement!)).toBe(1);
    expect(marker).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Only one code per order\./)).toBeNull();
    fireEvent.click(marker);
    expect(marker).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Only one code per order\./)).toBeInTheDocument();
  });

  it('starts a comment on the last new line of a block', () => {
    const { props } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Comment on lines 7 to 9' }));
    expect(props.onAddComment).toHaveBeenCalledWith(9);
    fireEvent.click(screen.getByRole('button', { name: 'Comment on line 3' }));
    expect(props.onAddComment).toHaveBeenLastCalledWith(3);
  });

  it('offers no comment where the diff takes none', () => {
    show({ onAddComment: undefined });
    expect(screen.queryByRole('button', { name: /^Comment on/ })).toBeNull();
  });

  it('shows a draft under the block it is on, and the others under the page', () => {
    const { container } = show({ drafts: [draft(9), draft(14), draft(3, 'LEFT')] });
    const table = screen.getByRole('table').closest('.bd-rendered-change')!;
    expect(table.nextElementSibling).toHaveTextContent('About line 9');
    const others = within(
      screen.getByRole('region', { name: 'Drafts on lines the page does not show' }),
    );
    expect(others.getAllByTestId('draft').map((node) => node.textContent)).toEqual([
      'About line 14',
      'About line 3',
    ]);
    expect(container.querySelectorAll('[data-testid="draft"]')).toHaveLength(3);
  });

  it('takes comments on a new file without marking all of it', () => {
    const lines = SOURCE.split('\n');
    const patch = [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join('\n');
    const { container, props } = show({ newFile: true, diff: { patch } });
    expect(container.querySelector('.bd-rendered-markdown')).toHaveAttribute('data-new-file');
    expect(props.onStops).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole('button', { name: 'Comment on line 1' }));
    expect(props.onAddComment).toHaveBeenCalledWith(1);
  });

  it('does not let a page write its own marks', () => {
    const source =
      '<div data-rendered-change="added" data-rendered-lines="1-1" data-rendered-comment="1">Mine</div>';
    const { props } = show({
      text: { status: 'ready', value: source },
      diff: { patch: '' },
    });
    // The block looks marked, but line 1 is not in the diff: it takes no comment.
    expect(screen.getByText('Mine')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Comment on/ })).toBeNull();
    expect(props.onAddComment).not.toHaveBeenCalled();
  });

  it('draws front matter as a block of YAML, not as a heading', () => {
    show({
      text: { status: 'ready', value: '---\nname: release\n---\n\n# Release' },
      diff: { patch: '' },
    });
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByText(/name: release/).closest('pre')).not.toBeNull();
  });

  it('reads the file at the commit on screen', async () => {
    client.get.mockResolvedValue({
      type: 'file',
      size: 12,
      encoding: 'base64',
      content: btoa('# From GitHub'),
    });
    show({ text: undefined, diff: { patch: '' } });
    expect(screen.getByRole('status')).toHaveTextContent('Reading the file…');
    expect(await screen.findByRole('heading', { name: 'From GitHub' })).toBeInTheDocument();
    expect(client.get.mock.calls[0]![0]).toBe(
      'repos/acme/shop/contents/docs/discount-codes.md?ref=a1b2c3d4',
    );
  });

  it('says why a file cannot be drawn', async () => {
    client.get.mockResolvedValue({ type: 'file', size: 5_000_000, encoding: 'none', content: '' });
    const { props } = show({ text: undefined });
    await waitFor(() =>
      expect(props.onUnavailable).toHaveBeenCalledWith(
        'This file is over 1 MB or is not text, so it is shown as a diff.',
      ),
    );
  });
});
