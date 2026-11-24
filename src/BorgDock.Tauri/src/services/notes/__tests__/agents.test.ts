import { beforeEach, describe, expect, it } from 'vitest';
import { useNotesStore } from '@/stores/notes-store';
import { withNotesFor } from '../agents';
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
