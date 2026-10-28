/**
 * What the note editor reads from the rest of BorgDock: chips for references
 * and the lists `[[`, `AB#`, `#` and `/` complete from. Read at the moment of
 * use, so a completion always offers what the stores hold now.
 */
import { openUrl } from '@tauri-apps/plugin-opener';
import { rawId } from '@/services/dispatch/hosts';
import { openReference, renderChipNode } from '@/services/notes/chips';
import type { InlineToken } from '@/services/notes/parse';
import { isRefToken, scanLine, titleOf } from '@/services/notes/parse';
import { isTemplatePath } from '@/services/notes/paths';
import { fillTemplate, withoutFrontmatter } from '@/services/notes/text-edits';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useNotesStore } from '@/stores/notes-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';
import { getField } from '@/utils/work-item-helpers';
import type { NoteCompletionSources } from './editor/NoteEditor';

export function renderChip(token: InlineToken): HTMLElement | null {
  if (!isRefToken(token)) return null;
  return renderChipNode(token, useNotesStore.getState().context);
}

/** A `t3code://` or `borgdock://` address opens in BorgDock or T3; anything else in the browser. */
export function openNoteUrl(url: string) {
  const [token] = scanLine(`[x](${url})`);
  if (token && isRefToken(token)) {
    void openReference(token, useNotesStore.getState().context);
    return;
  }
  if (/^https?:\/\//i.test(url)) void openUrl(url).catch(() => {});
}

function now() {
  const date = new Date();
  return {
    date: date.toISOString().slice(0, 10),
    time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function completionSources(currentTitle: () => string): NoteCompletionSources {
  return {
    notes: () =>
      Object.keys(useNotesStore.getState().texts)
        .filter((path) => !isTemplatePath(path))
        .map((path) => ({ title: titleOf(path), path })),
    tags: () => [...useNotesStore.getState().index.tags.keys()],
    workItems: () => {
      const { items, contextItems } = useDispatchStore.getState();
      const seen = new Map<number, string>();
      for (const item of [...items, ...contextItems]) seen.set(item.id, item.title);
      for (const item of useWorkItemsStore.getState().workItems) {
        if (!seen.has(item.id)) seen.set(item.id, getField(item, 'System.Title'));
      }
      return [...seen.entries()].map(([id, title]) => ({ id, title }));
    },
    threads: () => {
      const { threads, hosts } = useDispatchStore.getState();
      return threads.flatMap((thread) => {
        const environmentId = hosts.find((h) => h.id === thread.hostId)?.environmentId;
        if (!environmentId) return [];
        const id = rawId(thread.hostId, thread.id);
        return [
          {
            label: thread.title || `Thread ${id.slice(0, 8)}`,
            url: `t3code://threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(id)}`,
          },
        ];
      });
    },
    workstreams: () =>
      Object.entries(useWorkstreamsStore.getState().entries).map(([id, entry]) => ({
        label: entry.document.title,
        url: `borgdock://workstreams/${encodeURIComponent(id)}`,
      })),
    templates: () => {
      const { texts } = useNotesStore.getState();
      const { date, time } = now();
      return Object.entries(texts)
        .filter(([path]) => isTemplatePath(path))
        .map(([path, text]) => ({
          name: titleOf(path),
          text: fillTemplate(withoutFrontmatter(text), {
            date,
            time,
            title: currentTitle(),
          }).trim(),
        }));
    },
  };
}
