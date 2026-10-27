import type { Assessment } from '@/services/workstreams/attention';
import type { WorkstreamDocument } from '@/services/workstreams/types';
import { useSettingsStore } from '@/stores/settings-store';
import { deriveWorkstreams } from '../derive/workstreams';
import { ingest, monotonicTime } from '../ingest';
import { sourceId } from '../sources';

/**
 * The workstreams' attention after a recompute. `quiet` passes (a host
 * just came back) record what holds without entries.
 */
export function ingestWorkstreams(
  documents: readonly WorkstreamDocument[],
  assessments: Readonly<Record<string, Assessment>>,
  quiet: boolean,
): void {
  const folder = useSettingsStore.getState().settings.workstreams?.folder ?? '';
  void ingest(
    {
      sourceId: sourceId.workstreams(),
      kind: 'workstreams',
      label: 'Workstreams',
      configKey: folder || 'this machine',
    },
    monotonicTime(sourceId.workstreams()),
    deriveWorkstreams,
    {
      quiet,
      documents: documents.map((document) => ({
        id: document.id,
        title: document.title,
        createdAt: document.createdAt,
        attention: (assessments[document.id]?.attention ?? []).map((entry) => ({
          id: entry.id,
          tone: entry.tone,
          reason: entry.reason,
        })),
      })),
    },
  );
}
