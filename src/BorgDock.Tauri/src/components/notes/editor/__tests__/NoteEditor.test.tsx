import { undoDepth } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { InlineToken } from '@/services/notes/parse';
import { type ChipRenderer, type NoteCompletionSources, NoteEditor } from '../NoteEditor';

const completions: NoteCompletionSources = {
  notes: () => [],
  tags: () => [],
  workItems: () => [],
  threads: () => [],
  templates: () => [],
};

beforeAll(() => {
  // jsdom has no layout; CodeMirror measures text through ranges.
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const rects = Object.assign([], { item: () => null });
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  Range.prototype.getClientRects = () => rects as unknown as DOMRectList;
});

const chipFor: ChipRenderer = (token: InlineToken) => {
  if (token.kind !== 'ado') return null;
  const chip = document.createElement('span');
  chip.className = 'test-chip';
  chip.textContent = `item ${token.id}`;
  return chip;
};

function setup(overrides: Partial<Parameters<typeof NoteEditor>[0]> = {}) {
  const props = {
    path: 'Plan.md',
    text: 'First line',
    onChange: vi.fn(),
    renderChip: chipFor,
    onOpenLink: vi.fn(),
    onOpenUrl: vi.fn(),
    completions,
    ...overrides,
  };
  const utils = render(<NoteEditor {...props} />);
  const view = EditorView.findFromDOM(utils.container.querySelector('.cm-editor') as HTMLElement)!;
  return { ...utils, props, view };
}

describe('NoteEditor', () => {
  it('renders the note and reports edits', () => {
    const { container, props, view } = setup({ className: 'extra', ariaLabel: 'Plan note' });
    expect(container.firstElementChild).toHaveClass('bd-note-editor', 'extra');
    expect(container.querySelector('.cm-content')).toHaveTextContent('First line');
    expect(container.querySelector('.cm-content')).toHaveAttribute('aria-label', 'Plan note');
    act(() => view.dispatch({ changes: { from: 10, insert: '!' } }));
    expect(props.onChange).toHaveBeenCalledWith('First line!');
  });

  it('follows an external change without echoing it, keeping the cursor', () => {
    const { props, rerender, view } = setup({ text: 'alpha beta' });
    act(() => view.dispatch({ selection: { anchor: 8 } }));
    rerender(<NoteEditor {...props} text="alpha new beta" />);
    expect(view.state.doc.toString()).toBe('alpha new beta');
    expect(view.state.selection.main.head).toBe(12);
    expect(props.onChange).not.toHaveBeenCalled();
    rerender(<NoteEditor {...props} text="al" />);
    expect(view.state.selection.main.head).toBeLessThanOrEqual(2);
  });

  it('replaces the doc and forgets undo history when the note changes', () => {
    const { props, rerender, view } = setup();
    act(() => view.dispatch({ changes: { from: 0, insert: 'x' } }));
    expect(undoDepth(view.state)).toBe(1);
    rerender(<NoteEditor {...props} path="Other.md" text="Other note" />);
    const next = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
    expect(next.state.doc.toString()).toBe('Other note');
    expect(undoDepth(next.state)).toBe(0);
  });

  it('renders chips, links and checkboxes in place', async () => {
    const { container } = setup({ text: 'See [[Roadmap|the plan]] and AB#12\n- [ ] ship it' });
    expect(container.querySelector('.test-chip')).toHaveTextContent('item 12');
    expect(container.querySelector('.bd-note-wikilink')).toHaveTextContent('the plan');
    // The second line joins the viewport on CodeMirror's first measure, a frame later under load.
    await waitFor(() =>
      expect(container.querySelector('.bd-note-task-box')).toHaveAttribute('aria-checked', 'false'),
    );
    expect(container.querySelector('.cm-content')).not.toHaveTextContent('[[');
  });

  it('leaves a reference as styled text when there is no chip for it', () => {
    const { container } = setup({ text: 'See planner#4' });
    expect(container.querySelector('.bd-note-ref')).toHaveTextContent('planner#4');
  });

  it('opens a wikilink and a thread link on click', () => {
    const { container, props } = setup({
      text: '[[Roadmap]] and [Fix](t3code://threads/env/th)',
      renderChip: () => null,
    });
    fireEvent.mouseDown(container.querySelector('.bd-note-wikilink')!, { button: 0 });
    expect(props.onOpenLink).toHaveBeenCalledWith('Roadmap');
    fireEvent.mouseDown(container.querySelector('[data-note-url]')!, { button: 0 });
    expect(props.onOpenUrl).toHaveBeenCalledWith('t3code://threads/env/th');
  });

  it('ticks a task when its checkbox is clicked', () => {
    const { container, props } = setup({ text: 'Todo\n- [ ] ship it' });
    fireEvent.mouseDown(container.querySelector('.bd-note-task-box')!, { button: 0 });
    expect(props.onChange).toHaveBeenCalledWith('Todo\n- [x] ship it');
  });

  it('renders chips again when the chip renderer changes', () => {
    const { container, props, rerender } = setup({ text: 'AB#3' });
    const relabel: ChipRenderer = (token) => {
      const chip = chipFor(token);
      if (chip) chip.textContent = 'fresh';
      return chip;
    };
    rerender(<NoteEditor {...props} renderChip={relabel} />);
    expect(container.querySelector('.test-chip')).toHaveTextContent('fresh');
  });

  it('turns read-only on and off', () => {
    const { container, props, rerender } = setup({ readOnly: true });
    const content = container.querySelector('.cm-content')!;
    expect(content).toHaveAttribute('contenteditable', 'false');
    rerender(<NoteEditor {...props} readOnly={false} />);
    expect(content).toHaveAttribute('contenteditable', 'true');
  });
});

describe('rendered Markdown blocks', () => {
  it('renders GFM tables and reference images without changing the document', async () => {
    const text =
      '| Name | Value |\n| --- | ---: |\n| **Total** | 3 |\n\n![Diagram][diagram]\n\n[diagram]: https://example.com/diagram.png\n';
    const { container, props, view, unmount } = setup({ text, readOnly: true });
    await waitFor(() => expect(container.querySelector('table strong')).toHaveTextContent('Total'));
    await waitFor(() =>
      expect(container.querySelector('.bd-note-image-preview img')).toHaveAttribute(
        'src',
        'https://example.com/diagram.png',
      ),
    );
    expect(container.querySelector('.bd-note-image-preview img')).toHaveAttribute('alt', 'Diagram');
    expect(view.state.doc.toString()).toBe(text);
    expect(props.onChange).not.toHaveBeenCalled();
    await act(async () => unmount());
  });

  it('keeps table and image examples inside code as source', () => {
    const { container } = setup({
      text: '```md\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![Example](https://example.com/image.png)\n```',
    });
    expect(container.querySelector('table, img')).toBeNull();
  });

  it('does not turn unsafe image URLs into loaded images', async () => {
    const { container, unmount } = setup({
      text: '![Blocked](javascript:alert%281%29)',
      readOnly: true,
    });
    await waitFor(() =>
      expect(container.querySelector('.bd-note-image-error')).toHaveTextContent('Blocked'),
    );
    expect(container.querySelector('.bd-note-image-preview img')).toBeNull();
    await act(async () => unmount());
  });
});

it('renders a table inside a blockquote with its alignment and inline markup', async () => {
  const text = '> | Feature | State |\n> | --- | ---: |\n> | **Tables** | Ready |\n';
  const { container, view, unmount } = setup({ text, readOnly: true });
  await waitFor(() => expect(container.querySelector('table strong')).toHaveTextContent('Tables'));
  expect(container.querySelectorAll('tr')).toHaveLength(2);
  expect(view.state.doc.toString()).toBe(text);
  await act(async () => unmount());
});
