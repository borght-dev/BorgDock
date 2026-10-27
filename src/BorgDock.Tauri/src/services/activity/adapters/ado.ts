import type { DispatchItem } from '@/services/dispatch/types';
import { useSettingsStore } from '@/stores/settings-store';
import { type AdoItemFacts, deriveAdo } from '../derive/ado';
import { ingest, markSourceFailed, type SourceDescriptor } from '../ingest';
import { sourceId } from '../sources';

/** A comment an agent signed reads `Vera · plan`. */
const SIGNED = / · /;

function adoSource(): SourceDescriptor | null {
  const { organization, project, authMethod } = useSettingsStore.getState().settings.azureDevOps;
  if (!organization || !project) return null;
  return {
    sourceId: sourceId.ado(organization, project),
    kind: 'ado',
    label: `${organization}/${project}`,
    configKey: JSON.stringify([organization.toLowerCase(), project.toLowerCase(), authMethod]),
  };
}

function factsOf(item: DispatchItem): AdoItemFacts | null {
  if (item.rev === undefined) return null;
  const comment = item.lastComment;
  const signed = !!comment && SIGNED.test(comment.author);
  return {
    id: item.id,
    title: item.title,
    url: item.url,
    rev: item.rev,
    state: item.state,
    states: item.states.map((state) => state.name),
    assignedToMe: item.assignedToMe,
    changedBy: item.changedBy ?? null,
    changedByMe: item.changedByMe ?? false,
    changedAt: item.changedAt,
    newestComment:
      comment?.id !== undefined
        ? {
            id: comment.id,
            author: comment.author,
            signedBy: signed ? comment.author : null,
            byMe: comment.byMe,
            at: comment.at,
            text: comment.text,
          }
        : null,
  };
}

/**
 * The items Dispatch lists, as one read of the ADO project. The context
 * items workstreams ask for are not ingested: they belong to others or are done.
 */
export function ingestAdoItems(items: readonly DispatchItem[], startedAt: number): void {
  const source = adoSource();
  if (!source) return;
  const { organization, project } = useSettingsStore.getState().settings.azureDevOps;
  void ingest(source, { time: startedAt }, deriveAdo, {
    organization,
    project,
    items: items.flatMap((item) => {
      const facts = factsOf(item);
      return facts ? [facts] : [];
    }),
  });
}

export function adoReadFailed(): void {
  const source = adoSource();
  if (source) markSourceFailed(source.sourceId);
}
