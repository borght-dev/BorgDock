import { undoDepth } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { InlineToken } from '@/services/notes/parse';
import { type ChipRenderer, type NoteCompletionSources, NoteEditor } from '../NoteEditor';

const completions: NoteCompletionSources = {
  notes: () => [],
  tags: () => [],
  workItems: () => [],
  threads: () => [],
  workstreams: () => [],
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

  it('renders chips, links and checkboxes in place', () => {
    const { container } = setup({ text: 'See [[Roadmap|the plan]] and AB#12\n- [ ] ship it' });
    expect(container.querySelector('.test-chip')).toHaveTextContent('item 12');
    expect(container.querySelector('.bd-note-wikilink')).toHaveTextContent('the plan');
    expect(container.querySelector('.bd-note-task-box')).toHaveAttribute('aria-checked', 'false');
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
