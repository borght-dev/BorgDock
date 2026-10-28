import { seedWorkstreams } from '@/components/workstreams/__fixtures__/workstreams-data';
import { parseNote } from '@/services/notes/parse';
import { dailyPath, dayKey } from '@/services/notes/paths';
import { refContextOf } from '@/services/notes/settings';
import { memoryNotesStorage } from '@/services/notes/storage';
import { buildIndex } from '@/services/notes/vault-index';
import { type NotesView, setNotesStorage, useNotesStore } from '@/stores/notes-store';
import { useSettingsStore } from '@/stores/settings-store';

export const VAULT_PATH = 'C:/Users/you/OneDrive/BorgDock Notes';
const DAY = 24 * 60 * 60 * 1000;

export interface NotesScene {
  /** A vault with no notes. */
  empty?: boolean;
  /** The note shown in the editor. */
  open?: 'investigation' | 'today' | 'decision' | null;
  view?: NotesView;
  /** The open note changed on disk under an unsaved edit. */
  conflict?: boolean;
}

/** The vault the stories and e2e specs show: a week of notes about the shop's exports. */
export function vaultNotes(workstreamId: string, now = new Date()): Record<string, string> {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - DAY));
  return {
    'Projects/CSV export drops the last column.md': [
      '---',
      'tags: [exports, bug]',
      `workstream: "[Exports keep every column](borgdock://workstreams/${workstreamId})"`,
      '---',
      '# CSV export drops the last column',
      '',
      'Customers lose the last column when it is empty. Tracked in AB#60102.',
      '',
      '## Findings',
      '- The writer skips the final delimiter when the last cell is empty, see [[Excel export]].',
      '- Fix is up in shop#3712.',
      '- Agent run: [CSV export drops the last column](t3code://threads/env-laptop/t-60102)',
      '- The bulk-assign work in shop#3741 touches the same writer. #exports',
      '',
      '## Next',
      '- [ ] Ask QA to export a report with an empty last column',
      '- [ ] Check the Excel path once shop#3712 merges',
      '- [x] Reproduce with the March invoices',
      '',
    ].join('\n'),
    'Projects/Excel export.md': [
      '# Excel export',
      '',
      'Same writer as the CSV path; see [[CSV export drops the last column]].',
      '',
      '- [ ] Add a test with an empty trailing cell',
      '',
    ].join('\n'),
    'Projects/Planning board.md': [
      '# Planning board',
      '',
      'Technician availability lands with AB#59877. Plan waits in [Technician availability](t3code://threads/env-laptop/t-59877).',
      '',
    ].join('\n'),
    [`Daily/${yesterday}.md`]: [
      `# ${new Date(now.getTime() - DAY).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      '',
      '## Notes',
      '- Standup: CSV fix waits on review. [[CSV export drops the last column]]',
      '',
    ].join('\n'),
    [`Daily/${today}.md`]: [
      `# ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`,
      '',
      '## Since yesterday',
      `<!-- borgdock:since ${today} -->`,
      '- acme/shop#3668 · Merged into main',
      '- AB#60102 moved to Code Review',
      '- “CSV export drops the last column” finished and waits for you',
      '- acme/shop#3741 · Checks failed on the bulk-assign branch',
      `<!-- /borgdock:since ${today} -->`,
      '',
      '## Notes',
      '- Pair with QA on the export test at 14:00.',
      '',
      '## Captured',
      '- 09:12 Empty trailing cells also break the PDF renderer? · acme/shop#3712',
      '',
    ].join('\n'),
    'Decisions/2026-10-21 Fix the writer or the exporter.md': [
      '# Fix the writer or the exporter?',
      '',
      `Workstream: [Exports keep every column](borgdock://workstreams/${workstreamId})`,
      'Decided: 2026-10-21',
      '',
      '## Chosen',
      '- acme/shop#3712 fix: CSV export keeps the last column',
      '',
      '## Why',
      'One fix covers CSV and Excel.',
      '',
    ].join('\n'),
    'Templates/Daily.md': ['# {{title}}', '', '## Notes', '', '## Tasks', '- [ ] '].join('\n'),
    'Templates/PR review.md': [
      '## Review of {{title}}',
      '- [ ] Read the description',
      '- [ ] Run it locally',
      '- [ ] Checks green',
    ].join('\n'),
    'Inbox.md': '# Inbox\n\n- Look at the report renderer upgrade (AB#60031)\n',
  };
}

/** Seed every store the Notes section reads, synchronously, for a story or a test. */
export function seedNotes(scene: NotesScene = {}) {
  const { ids } = seedWorkstreams({});
  const workstreamId = ids[2] ?? 'ws';
  const notes = scene.empty ? {} : vaultNotes(workstreamId);
  setNotesStorage(memoryNotesStorage(notes));
  const context = refContextOf(useSettingsStore.getState().settings);
  const parsed = Object.fromEntries(
    Object.entries(notes).map(([path, text]) => [path, parseNote(path, text)]),
  );
  const openPath =
    scene.open === null || scene.empty
      ? null
      : scene.open === 'today'
        ? dailyPath(new Date())
        : scene.open === 'decision'
          ? 'Decisions/2026-10-21 Fix the writer or the exporter.md'
          : 'Projects/CSV export drops the last column.md';
  const files = Object.fromEntries(
    Object.entries(notes).map(([path, text], i) => [
      path,
      { modifiedMs: i + 1, size: text.length },
    ]),
  );
  useNotesStore.setState({
    folder: null,
    vaultPath: VAULT_PATH,
    status: 'ready',
    error: null,
    texts: notes,
    parsed,
    files,
    context,
    index: buildIndex(Object.values(parsed), context),
    buffers:
      scene.conflict && openPath ? { [openPath]: `${notes[openPath]}\nMy unsaved line.` } : {},
    conflicts:
      scene.conflict && openPath
        ? { [openPath]: `${notes[openPath]}\nA line added in Obsidian.` }
        : {},
    openPath,
    view: scene.view ?? 'note',
  });
  return { workstreamId };
}
