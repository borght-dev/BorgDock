import { type ChipSources, chipView, openReference } from '@/services/notes/chips';
import type { RefToken } from '@/services/notes/parse';
import { useDispatchStore } from '@/stores/dispatch-store';
import { useNotesStore } from '@/stores/notes-store';
import { usePrStore } from '@/stores/pr-store';
import { useWorkItemsStore } from '@/stores/work-items-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';

/** The store slices a chip reads, subscribed so the chip follows each poll. */
function useChipSources(): ChipSources {
  return {
    pullRequests: usePrStore((s) => s.pullRequests),
    closedPullRequests: usePrStore((s) => s.closedPullRequests),
    items: useDispatchStore((s) => s.items),
    contextItems: useDispatchStore((s) => s.contextItems),
    workItems: useWorkItemsStore((s) => s.workItems),
    threads: useDispatchStore((s) => s.threads),
    hosts: useDispatchStore((s) => s.hosts),
    workstreams: useWorkstreamsStore((s) => s.entries),
  };
}

/**
 * RefChip — a pull request, work item, thread or workstream named in a note,
 * with what its source says now. Click opens it: the PR or item in BorgDock,
 * the thread in T3.
 */
export function RefChip({ token }: { token: RefToken }) {
  const context = useNotesStore((s) => s.context);
  const sources = useChipSources();
  const view = chipView(token, context, sources);
  return (
    <button
      type="button"
      className="bd-note-chip bd-note-chip--button"
      data-tone={view.tone}
      title={[view.title, view.state].filter(Boolean).join(' · ') || undefined}
      onClick={() => void openReference(token, context)}
    >
      <span className="bd-note-chip__dot" aria-hidden="true" />
      <span className="bd-note-chip__label">{view.label}</span>
      {view.state && <span className="bd-note-chip__state">{view.state}</span>}
    </button>
  );
}
