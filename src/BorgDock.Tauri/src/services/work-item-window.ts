import { isMainWindow, showWorkItem } from '@/services/navigation';

/** The pop-out work item window, as the work item palette opens it. */
export async function openWorkItemWindow(id: number): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  new WebviewWindow(`workitem-detail-${id}`, {
    url: `workitem-detail.html?id=${id}`,
    title: `Work Item #${id}`,
    width: 1180,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    center: true,
    decorations: false,
    resizable: true,
    focus: true,
    skipTaskbar: false,
    visible: false,
  });
}

/** A work item in full: the main window's detail view there, else its pop-out window. */
export function openWorkItemFull(id: number): void {
  if (isMainWindow()) void showWorkItem(id);
  else openWorkItemWindow(id).catch((err) => console.error('Failed to open work item window', err));
}
