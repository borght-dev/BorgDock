import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/shared/primitives';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import { useWorkItemDetailData } from '@/hooks/useWorkItemDetailData';
import { useSettingsStore } from '@/stores/settings-store';
import type { WorkItem, WorkItemAttachment } from '@/types';
import type { AppSettings, AzureDevOpsSettings } from '@/types/settings';
import { revealWindow } from '@/utils/window-reveal';
import { getField } from '@/utils/work-item-helpers';
import { WorkItemDetailPanel } from './WorkItemDetailPanel';
import { useAdjacentNav } from './WorkItemDetailPanel/useAdjacentNav';

/**
 * The pop-out window has its own stores: load the settings, fill its
 * settings store (useAdoImageAuth reads the PAT there). The theme is the
 * entry's job (startWindowTheme in workitem-detail-main.tsx).
 */
async function preparePopOut(): Promise<AzureDevOpsSettings> {
  const settings = await invoke<AppSettings>('load_settings');
  useSettingsStore.setState({ settings, isLoading: false });
  return settings.azureDevOps;
}

function titleWindow(item: WorkItem) {
  getCurrentWindow()
    .setTitle(`#${item.id} - ${getField(item, 'System.Title')}`)
    .catch(console.debug); /* fire-and-forget */
}

const POP_OUT_OPTIONS = { prepare: preparePopOut, onLoaded: titleWindow, resolveImages: true };

// ---- Component ----

/**
 * WorkItemDetailApp — the pop-out work item window (`workitem-detail.html`,
 * opened by the work item palette). The data comes from
 * `useWorkItemDetailData`, shared with the main window's full-screen
 * `WorkItemDetailView`; this file adds the window chrome, ↑/↓ through the
 * palette's list, and the window's own close and save-to-disk behaviour.
 */
export function WorkItemDetailApp() {
  // Reveal the (invisible-built) window once React has painted.
  const revealedRef = useRef(false);
  useEffect(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    requestAnimationFrame(() => {
      void revealWindow();
    });
  }, []);

  // Get work item ID from URL search params
  const [workItemId, setWorkItemId] = useState<number | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return Number(params.get('id')) || null;
  });

  const adjacent = useAdjacentNav(workItemId);
  const data = useWorkItemDetailData(workItemId, POP_OUT_OPTIONS);
  const { detailData, error, isLoading, getClient, remove } = data;

  const handleArrowNav = useCallback(
    (dir: 'prev' | 'next') => {
      const target = dir === 'prev' ? adjacent.prevId : adjacent.nextId;
      if (target == null) return;
      const url = new URL(window.location.href);
      url.searchParams.set('id', String(target));
      window.history.replaceState({}, '', url.toString());
      setWorkItemId(target);
    },
    [adjacent.prevId, adjacent.nextId],
  );

  const handleDelete = useCallback(async () => {
    if (await remove()) getCurrentWindow().close().catch(console.debug); /* fire-and-forget */
  }, [remove]);

  const handleClose = useCallback(() => {
    getCurrentWindow().close().catch(console.debug); /* fire-and-forget */
  }, []);

  // The pop-out saves attachments through the native save dialog.
  const handleDownloadAttachment = useCallback(
    async (attachment: WorkItemAttachment) => {
      const client = getClient();
      if (!client) return;
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const savePath = await save({ defaultPath: attachment.fileName });
        if (!savePath) return;

        const blob = await client.getStream(
          `wit/attachments/${attachment.id}?fileName=${encodeURIComponent(attachment.fileName)}`,
        );
        const buffer = await blob.arrayBuffer();
        const { writeFile } = await import('@tauri-apps/plugin-fs');
        await writeFile(savePath, new Uint8Array(buffer));
      } catch (err) {
        console.error('Failed to download:', err);
      }
    },
    [getClient],
  );

  const titleText = detailData
    ? `#${detailData.id} — ${detailData.title}`
    : workItemId
      ? `Work Item #${workItemId}`
      : 'Work Item';

  // Playwright wait-target: flips on after the initial load_settings +
  // getWorkItem roundtrip resolves (success OR failure path). Either way,
  // the window is rendering its real surface (error, spinner, or panel).
  const appReady = !isLoading ? 'true' : undefined;

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[var(--color-surface)]" data-app-ready={appReady}>
        <WindowTitleBar title={titleText} />
        <div className="flex flex-1 items-center justify-center">
          <Card padding="md">
            <p className="text-[13px] text-[var(--color-text-muted)]">{error}</p>
          </Card>
        </div>
      </div>
    );
  }

  if (!detailData) {
    return (
      <div className="flex h-screen flex-col bg-[var(--color-surface)]" data-app-ready={appReady}>
        <WindowTitleBar title={titleText} />
        <div className="flex flex-1 items-center justify-center">
          <Card padding="md">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--color-surface)]" data-app-ready={appReady}>
      <WindowTitleBar title={titleText} />
      <div className="flex-1 overflow-y-auto">
        <WorkItemDetailPanel
          item={detailData}
          isLoading={isLoading}
          statusText={data.statusText}
          availableStates={data.availableStates}
          richTextFields={data.richText}
          standardFields={data.standard}
          customFields={data.custom}
          extraTabs={data.extraTabs}
          detailsFieldKeys={data.detailsFieldKeys}
          attachments={data.attachments}
          comments={data.comments}
          isLoadingComments={data.isLoadingComments}
          onSave={data.save}
          onDelete={() => void handleDelete()}
          onClose={handleClose}
          onOpenInBrowser={(url) => void data.openInBrowser(url)}
          onDownloadAttachment={(a) => void handleDownloadAttachment(a)}
          onAddComment={data.addComment}
          adjacent={adjacent}
          onArrowNav={handleArrowNav}
        />
      </div>
    </div>
  );
}
