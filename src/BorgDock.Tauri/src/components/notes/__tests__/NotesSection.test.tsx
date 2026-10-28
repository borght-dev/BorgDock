import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseNote } from '@/services/notes/parse';
import { memoryNotesStorage } from '@/services/notes/storage';
import { buildIndex, type RefContext } from '@/services/notes/vault-index';
import { setNotesStorage, useNotesStore } from '@/stores/notes-store';
import { NotesTab } from '../NotesTab';
import { matchTitles } from '../QuickSwitcher';
import { TasksView } from '../TasksView';

vi.mock('@/services/navigation', () => ({
  showNote: vi.fn(() => Promise.resolve()),
  showSection: vi.fn(() => Promise.resolve()),
  showPr: vi.fn(() => Promise.resolve()),
  showWorkItem: vi.fn(() => Promise.resolve()),
  showWorkstream: vi.fn(() => Promise.resolve()),
}));

const context: RefContext = {
  adoOrganization: 'acme',
  adoProject: 'Shop',
  repos: [{ owner: 'acme', name: 'shop' }],
};

const NOTES: Record<string, string> = {
  'Plan.md': '# Plan\n\nFix is in shop#3712.\n\n- [ ] Ask QA\n- [x] Reproduce\n',
  'Daily/2026-10-28.md': 'Standup about shop#3712 and [[Plan]]\n',
  'Templates/Daily.md': '- [ ] template task\n',
};

let vault: ReturnType<typeof memoryNotesStorage>;

beforeEach(() => {
  vault = memoryNotesStorage(NOTES);
  setNotesStorage(vault);
  const parsed = Object.fromEntries(
    Object.entries(NOTES).map(([path, text]) => [path, parseNote(path, text)]),
  );
  useNotesStore.setState({
    folder: null,
    status: 'ready',
    texts: { ...NOTES },
    parsed,
    files: {},
    context,
    index: buildIndex(Object.values(parsed), context),
    buffers: {},
    conflicts: {},
    openPath: null,
    view: 'tasks',
  });
});

describe('TasksView', () => {
  it('lists open tasks by note, leaving templates out, and ticks them in the file', async () => {
    render(<TasksView />);
    expect(screen.getByRole('heading', { name: /Open tasks/ })).toHaveTextContent('1');
    expect(screen.queryByText('template task')).toBeNull();
    expect(screen.queryByText('Reproduce')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ask QA' }));
    await waitFor(() => expect(vault.files.get('Plan.md')?.text).toContain('- [x] Ask QA'));
  });
});

describe('NotesTab', () => {
  it('lists the notes that mention a pull request with the lines that do', () => {
    render(
      <NotesTab
        refKey="gh:github.com/acme/shop#3712"
        newTitle="fix: CSV export"
        newFirstLine="acme/shop#3712 · fix: CSV export"
      />,
    );
    expect(screen.getByText('2 notes mention this.')).toBeInTheDocument();
    const plan = screen.getByRole('button', { name: /^Plan/ });
    expect(within(plan).getByText('Fix is in shop#3712.')).toBeInTheDocument();
  });

  it('makes a new note that mentions it', async () => {
    render(<NotesTab refKey="ado:acme#7" newTitle="Bug seven" newFirstLine="AB#7 · Bug seven" />);
    expect(screen.getByText('No note mentions this yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New note about this/ }));
    await waitFor(() => expect(vault.files.get('Bug seven.md')?.text).toBe('AB#7 · Bug seven\n\n'));
    expect(useNotesStore.getState().index.mentions.get('ado:acme#7')).toHaveLength(1);
  });
});

describe('matchTitles', () => {
  it('prefers titles that start with the query and skips ones missing a letter', () => {
    const paths = ['Projects/Spec.md', 'Plan.md', 'Inspection.md', 'Other.md'];
    expect(matchTitles(paths, 'sp')).toEqual(['Projects/Spec.md', 'Inspection.md']);
    expect(matchTitles(paths, 'zz')).toEqual([]);
  });
});
