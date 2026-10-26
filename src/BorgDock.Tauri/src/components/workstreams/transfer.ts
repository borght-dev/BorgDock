import { commands } from '@/generated/commands';
import { commandData } from '@/services/native-command';
import { isMainWindow, showWorkstream } from '@/services/navigation';
import type { Assessment } from '@/services/workstreams/attention';
import { fromJson, toJson, toMarkdown } from '@/services/workstreams/export';
import type { WorkstreamDocument } from '@/services/workstreams/types';
import { showToast, toastError } from '@/stores/toast-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';

/** A file name made from a workstream's title. */
function fileName(document: WorkstreamDocument): string {
  const slug = document.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${slug || 'workstream'}.workstream.json`;
}

/** Copy the workstream as Markdown, to paste into a pull request or a work item. */
export async function copyAsMarkdown(
  document: WorkstreamDocument,
  assessment: Assessment | undefined,
): Promise<void> {
  try {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(toMarkdown(document, assessment));
    showToast({ tone: 'success', message: 'Copied as Markdown.' });
  } catch (error) {
    toastError('Not copied', error);
  }
}

/** Save the workstream as a JSON file, to import on a machine that doesn't share the folder. */
export async function exportJson(document: WorkstreamDocument): Promise<void> {
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      title: 'Export workstream',
      defaultPath: fileName(document),
      filters: [{ name: 'Workstream', extensions: ['json'] }],
    });
    if (!path) return;
    await commandData(commands.workstreamsExportFile(path, toJson(document)));
    showToast({ tone: 'success', message: `Exported to ${path}.` });
  } catch (error) {
    toastError('Not exported', error);
  }
}

/** Import a workstream from a JSON file: a new one, or merged into the one it was exported from. */
export async function importJson(): Promise<void> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({
      title: 'Import workstream',
      multiple: false,
      filters: [{ name: 'Workstream', extensions: ['json'] }],
    });
    if (typeof path !== 'string') return;
    const read = fromJson(await commandData(commands.workstreamsImportFile(path)));
    if (!read.ok) {
      showToast({ tone: 'error', message: read.reason });
      return;
    }
    const result = useWorkstreamsStore.getState().importDocument(read.document);
    const messages: Record<string, string> = {
      created: `Imported "${read.document.title}".`,
      merged: `Merged the file into "${read.document.title}".`,
      conflict: `"${read.document.title}" differs from the file: choose what to keep.`,
    };
    const known = messages[result];
    showToast({
      tone: known ? 'success' : 'error',
      message: known ?? result,
      ...(known
        ? { actionLabel: 'Open', onAction: () => void showWorkstream(read.document.id) }
        : {}),
    });
    if (result === 'conflict' && isMainWindow()) void showWorkstream(read.document.id);
  } catch (error) {
    toastError('Not imported', error);
  }
}
