import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  showWorkstream: vi.fn(async () => {}),
  showSection: vi.fn(async () => {}),
  isMainWindow: () => true,
}));
vi.mock('@/services/navigation', () => navigation);
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(async () => {}),
  readFromTauriStore: vi.fn(async () => undefined),
}));

import { addMembers, setNextAction, setPinned, setStatus } from '@/services/workstreams/edits';
import { newDocument } from '@/services/workstreams/schema';
import type { WorkstreamDocument } from '@/services/workstreams/types';
import { useUiStore } from '@/stores/ui-store';
import { useWorkstreamSourcesStore } from '@/stores/workstream-sources-store';
import { type Entry, resetWorkstreamsStore, useWorkstreamsStore } from '@/stores/workstreams-store';
import { useWorkstreamsUiStore } from '@/stores/workstreams-ui-store';
import { handleWorkstreamsKey } from '../keyboard';
import { filterWorkstreams, orderWorkstreams, WorkstreamsSection } from '../WorkstreamsSection';

const CONTEXT = { now: '2026-10-26T09:00:00Z', device: 'Laptop' };
const DEVICE = { deviceId: 'd', deviceLabel: 'Laptop' };

function doc(
  title: string,
  change: (d: WorkstreamDocument) => WorkstreamDocument = (d) => d,
): WorkstreamDocument {
  return change(newDocument(title, '2026-10-20T09:00:00Z', DEVICE));
}

function ok<T>(result: { document: T } | { error: string }): T {
  if ('error' in result) throw new Error(result.error);
  return result.document;
}

function entry(document: WorkstreamDocument): Entry {
  return {
    document,
    base: document,
    readOnly: false,
    dirty: false,
    saving: false,
    saveError: null,
    conflict: null,
  };
}

function seed(documents: WorkstreamDocument[]) {
  useWorkstreamsStore.setState({
    loaded: true,
    entries: Object.fromEntries(documents.map((d) => [d.id, entry(d)])),
  });
}

beforeEach(() => {
  resetWorkstreamsStore();
  useWorkstreamSourcesStore.setState({ assessments: {}, suggestions: {} });
  useWorkstreamsUiStore.setState({
    selectedId: null,
    editingNextAction: null,
    creating: null,
    picking: null,
    adding: null,
  });
  navigation.showWorkstream.mockClear();
});

describe('WorkstreamsSection', () => {
  it('explains workstreams before there is one, and starts one', () => {
    seed([]);
    render(<WorkstreamsSection />);
    expect(
      screen.getByRole('heading', { name: 'Group the work behind one goal' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /New workstream/ })[0]!);
    expect(useWorkstreamsUiStore.getState().creating).toEqual({ refs: [] });
  });

  it('shows the active workstreams as cards with their next action and opens one', () => {
    const board = doc('Planning board', (d) =>
      ok(setNextAction(d, 'Decide on bulk assign', null, 'you', CONTEXT)),
    );
    seed([board, doc('Paused one', (d) => ok(setStatus(d, 'paused', CONTEXT)))]);
    render(<WorkstreamsSection />);
    const card = screen.getByRole('article', { name: 'Planning board' });
    expect(within(card).getByText('Decide on bulk assign')).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Paused one' })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Planning board' }));
    expect(navigation.showWorkstream).toHaveBeenCalledWith(board.id);
  });

  it('edits the next action in place, Enter saves', () => {
    const board = doc('Planning board');
    seed([board]);
    render(<WorkstreamsSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Set a next action' }));
    const input = screen.getByRole('textbox', { name: 'Next action' });
    fireEvent.change(input, { target: { value: 'Ask QA' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useWorkstreamsStore.getState().entries[board.id]!.document.nextAction?.text).toBe(
      'Ask QA',
    );
  });
});

describe('ordering and filtering', () => {
  it('puts pinned first, then the most recently changed', () => {
    const older = { ...doc('Older'), updatedAt: '2026-10-01T00:00:00Z' };
    const newer = { ...doc('Newer'), updatedAt: '2026-10-25T00:00:00Z' };
    const pinned = { ...ok(setPinned(doc('Pinned'), true)), updatedAt: '2026-09-01T00:00:00Z' };
    const ordered = orderWorkstreams([older, newer, pinned].map(entry), {});
    expect(ordered.map((e) => e.document.title)).toEqual(['Pinned', 'Newer', 'Older']);
  });

  it('searches titles, goals and next actions', () => {
    const a = doc('Board', (d) =>
      ok(setNextAction(d, 'Ask QA about bulk assign', null, 'you', CONTEXT)),
    );
    const b = doc('Exports');
    expect(
      filterWorkstreams([a, b].map(entry), 'active', 'bulk').map((e) => e.document.title),
    ).toEqual(['Board']);
  });
});

describe('list keys', () => {
  it('J moves, Enter opens, N starts a new one', () => {
    useUiStore.setState({ activeSection: 'workstreams' });
    const first = ok(addMembers(doc('First'), [], CONTEXT));
    const second = doc('Second');
    seed([first, second]);
    render(<WorkstreamsSection />);
    const key = (k: string) => handleWorkstreamsKey(new KeyboardEvent('keydown', { key: k }));
    expect(key('j')).toBe(true);
    const selected = useWorkstreamsUiStore.getState().selectedId;
    expect([first.id, second.id]).toContain(selected);
    expect(key('Enter')).toBe(true);
    expect(navigation.showWorkstream).toHaveBeenCalledWith(selected);
    expect(key('n')).toBe(true);
    expect(useWorkstreamsUiStore.getState().creating).not.toBeNull();
  });
});
