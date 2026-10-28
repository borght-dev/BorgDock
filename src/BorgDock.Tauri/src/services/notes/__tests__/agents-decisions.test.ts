import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkstreamDocument } from '@/services/workstreams/types';
import { useNotesStore } from '@/stores/notes-store';
import { withNotesFor } from '../agents';
import { decisionNoteText, notePathOfUrl, noteUrl } from '../decisions';
import { parseNote } from '../parse';
import { buildIndex } from '../vault-index';
import { messageId, withAgentNote } from '../writeback';

describe('thread results written back', () => {
  const thread = { threadId: 't-1', label: 'Profile planner query' };
  const at = new Date(2026, 9, 28, 14, 32);

  it('appends the message once, inside BorgDock’s markers', () => {
    const once = withAgentNote('# Plan\n', thread, 'Use RECOMPILE.', at);
    expect(once).toContain(`<!-- borgdock:agent t-1 ${messageId('Use RECOMPILE.')} -->`);
    expect(once).toContain('## Agent notes');
    expect(once).toContain('Use RECOMPILE.');
    expect(withAgentNote(once!, thread, 'Use RECOMPILE.', at)).toBeNull();
    expect(withAgentNote(once!, thread, 'A newer answer.', at)).toContain('A newer answer.');
  });

  it('never touches text outside its markers', () => {
    const text = '# Plan\nMy own words.\n';
    expect(withAgentNote(text, thread, 'Reply', at)!.startsWith(text.trimEnd())).toBe(true);
  });
});

describe('prompts', () => {
  beforeEach(() => {
    const parsed = [
      parseNote('Planner.md', 'Fix is in acme/planner#1412'),
      parseNote('Other.md', 'Nothing about it'),
    ];
    useNotesStore.setState({
      vaultPath: 'C:/Vault/BorgDock Notes',
      texts: { 'Planner.md': 'Fix is in acme/planner#1412', 'Other.md': 'Nothing about it' },
      index: buildIndex(parsed, { adoOrganization: null, adoProject: null, repos: [] }),
    });
  });

  it('adds the notes that mention a PR and the vault’s path', () => {
    const prompt = withNotesFor('Fix the checks.', 'acme', 'planner', 1412);
    expect(prompt).toContain('Fix the checks.');
    expect(prompt).toContain('## My notes about this pull request');
    expect(prompt).toContain('### Planner (C:/Vault/BorgDock Notes/Planner.md)');
    expect(prompt).not.toContain('Nothing about it');
    expect(prompt).toContain('My notes are Markdown files in C:/Vault/BorgDock Notes');
  });

  it('adds only the vault line when no note mentions the PR', () => {
    const prompt = withNotesFor('Fix.', 'acme', 'api', 1);
    expect(prompt).not.toContain('My notes about');
    expect(prompt).toContain('C:/Vault/BorgDock Notes');
  });
});

describe('decision notes', () => {
  const document = {
    id: 'ws-1',
    title: 'Planner speed',
    members: [
      {
        key: 'gh:github.com/acme/planner#1412',
        ref: { kind: 'github-pr', owner: 'acme', repo: 'planner', number: 1412 },
        label: 'Index hint',
      },
      {
        key: 'gh:github.com/acme/planner#1420',
        ref: { kind: 'github-pr', owner: 'acme', repo: 'planner', number: 1420 },
        label: 'Recompile',
      },
    ],
    decisions: [
      {
        id: 'd-1',
        question: 'Hint or recompile?',
        options: ['gh:github.com/acme/planner#1412', 'gh:github.com/acme/planner#1420'],
      },
    ],
  } as unknown as WorkstreamDocument;

  it('records the question, the choice, what was set aside and why', () => {
    const text = decisionNoteText(
      document,
      'd-1',
      'gh:github.com/acme/planner#1420',
      'Stale stats',
      new Date(2026, 9, 28),
    );
    expect(text).toContain('# Hint or recompile?');
    expect(text).toContain('Workstream: [Planner speed](borgdock://workstreams/ws-1)');
    expect(text).toContain('## Chosen\n- acme/planner#1420 Recompile');
    expect(text).toContain('## Set aside\n- acme/planner#1412 Index hint');
    expect(text).toContain('## Why\nStale stats');
  });

  it('round-trips a note address', () => {
    expect(notePathOfUrl(noteUrl('Decisions/2026-10-28 Hint?.md'))).toBe(
      'Decisions/2026-10-28 Hint?.md',
    );
    expect(notePathOfUrl('https://example.com')).toBeNull();
  });
});
