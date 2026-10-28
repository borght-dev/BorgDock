import { useNotesStore } from '@/stores/notes-store';

/** The vault's folder, for prompts: `null` before the vault is loaded. */
export function vaultPath(): string | null {
  return useNotesStore.getState().vaultPath;
}

/** One line naming the vault, for every prompt BorgDock writes. */
export function vaultLine(): string {
  const path = vaultPath();
  return path
    ? `My notes are Markdown files in ${path} (an Obsidian-style vault; [[Title]] links to the note Title.md). Read them for context; write new notes there when you have something worth keeping.`
    : '';
}

/** `prompt` with the vault line appended, when there is a vault. */
export function withVault(prompt: string): string {
  const line = vaultLine();
  return line ? `${prompt.trimEnd()}\n\n${line}` : prompt;
}
