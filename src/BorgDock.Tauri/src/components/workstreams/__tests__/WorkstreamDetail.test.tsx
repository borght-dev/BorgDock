import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/navigation', () => ({
  showWorkstream: vi.fn(async () => {}),
  showSection: vi.fn(async () => {}),
  showPr: vi.fn(async () => {}),
  showWorkItem: vi.fn(async () => {}),
  popView: vi.fn(async () => {}),
  isMainWindow: () => true,
  isOverlayOpen: () => false,
}));
vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(async () => {}),
  readFromTauriStore: vi.fn(async () => undefined),
}));

import { recomputeWorkstreams } from '@/runtime/workstreams-sync';
import { addMembers, addOutcome } from '@/services/workstreams/edits';
import { refKey } from '@/services/workstreams/identity';
import { newDocument } from '@/services/workstreams/schema';
import { memoryStorage } from '@/services/workstreams/storage';
import type { SourceRef } from '@/services/workstreams/types';
import { useSettingsStore } from '@/stores/settings-store';
import { useUiStore } from '@/stores/ui-store';
import {
  resetWorkstreamsStore,
  setWorkstreamStorage,
  useWorkstreamsStore,
} from '@/stores/workstreams-store';
import { LinkPicker } from '../LinkPicker';
import { WorkstreamDetailView } from '../WorkstreamDetailView';

const CONTEXT = { now: '2026-10-26T09:00:00Z', device: 'Laptop' };
const A: SourceRef = { kind: 'github-pr', owner: 'acme', repo: 'shop', number: 12 };
const B: SourceRef = { kind: 'github-pr', owner: 'acme', repo: 'shop', number: 15 };

function ok<T>(result: { document: T } | { error: string }): T {
  if ('error' in result) throw new Error(result.error);
  return result.document;
}

function seed() {
  let d = newDocument('Checkout', CONTEXT.now, { deviceId: 'd', deviceLabel: 'Laptop' });
  d = ok(
    addMembers(
      d,
      [
        { ref: A, label: 'Queue rewrite' },
        { ref: B, label: 'Patch' },
      ],
      CONTEXT,
    ),
  );
  d = ok(addOutcome(d, 'Customers can pay', true, [], CONTEXT));
  useWorkstreamsStore.setState({
    loaded: true,
    entries: {
      [d.id]: {
        document: d,
        base: null,
        readOnly: false,
        dirty: true,
        saving: false,
        saveError: null,
        conflict: null,
      },
    },
  });
  recomputeWorkstreams();
  return d.id;
}

function document(id: string) {
  return useWorkstreamsStore.getState().entries[id]!.document;
}

beforeEach(() => {
  resetWorkstreamsStore();
  setWorkstreamStorage(memoryStorage());
  useSettingsStore.setState((s) => ({ settings: { ...s.settings, setupComplete: true } }));
  useUiStore.setState({ viewStack: [{ kind: 'list' }] });
});

describe('the record picker', () => {
  it('adds a pasted pull request with the role picked', () => {
    const id = seed();
    const onClose = vi.fn();
    render(<LinkPicker workstreamId={id} onClose={onClose} />);
    const input = screen.getByRole('textbox', { name: 'Paste an address or search' });
    fireEvent.change(input, { target: { value: 'https://github.com/acme/warehouse/pull/12' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 record' }));
    expect(document(id).members.map((m) => m.key)).toContain('gh:github.com/acme/warehouse#12');
    expect(onClose).toHaveBeenCalled();
  });

  it('says a pasted record is in the workstream already', () => {
    const id = seed();
    render(<LinkPicker workstreamId={id} onClose={() => {}} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Paste an address or search' }), {
      target: { value: 'acme/shop#12' },
    });
    expect(screen.getByText('In the workstream already')).toBeInTheDocument();
  });
});

describe('the detail view', () => {
  it('opens a decision between two records and keeps one', () => {
    const id = seed();
    render(<WorkstreamDetailView id={id} />);
    fireEvent.click(screen.getByRole('button', { name: 'New decision' }));
    const sheet = screen.getByRole('dialog', { name: 'New decision' });
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Question' }), {
      target: { value: 'Rewrite or patch?' },
    });
    for (const box of within(sheet).getAllByRole('checkbox')) fireEvent.click(box);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Open decision' }));
    expect(document(id).decisions[0]).toMatchObject({
      question: 'Rewrite or patch?',
      status: 'open',
    });

    recomputeWorkstreams();
    fireEvent.click(screen.getAllByRole('button', { name: 'Keep this' })[1]!);
    const decide = screen.getByRole('dialog');
    fireEvent.change(within(decide).getByRole('textbox', { name: 'Why' }), {
      target: { value: 'Smaller' },
    });
    fireEvent.click(within(decide).getByRole('button', { name: 'Decide' }));
    const decided = document(id);
    expect(decided.decisions[0]).toMatchObject({
      status: 'decided',
      chosen: refKey(B),
      rationale: 'Smaller',
    });
    expect(decided.members.find((m) => m.key === refKey(A))!.role).toBe('superseded');
  });

  it('confirms an outcome only with evidence and a note', () => {
    const id = seed();
    render(<WorkstreamDetailView id={id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm with evidence' }));
    const sheet = screen.getByRole('dialog');
    const confirm = within(sheet).getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    fireEvent.click(within(sheet).getAllByRole('checkbox')[0]!);
    expect(confirm).toBeDisabled();
    fireEvent.change(within(sheet).getByRole('textbox', { name: 'Why this proves it' }), {
      target: { value: 'Paid on staging' },
    });
    fireEvent.click(confirm);
    expect(document(id).outcomes[0]!.verification).toMatchObject({
      state: 'confirmed',
      note: 'Paid on staging',
    });
  });

  it('says so when the workstream is gone', () => {
    render(<WorkstreamDetailView id="nope" />);
    expect(screen.getByText(/This workstream is gone/)).toBeInTheDocument();
  });
});
