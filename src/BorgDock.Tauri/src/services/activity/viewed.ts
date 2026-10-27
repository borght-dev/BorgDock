import { useSettingsStore } from '@/stores/settings-store';
import * as api from './api';
import { entityKey } from './sources';

/**
 * Opening something marks what happened to it up to now read: a PR's
 * detail, an item in Dispatch, a workstream, a CI failure group. Entries of
 * other entities never change this way. Settings can turn it off.
 */
function markViewed(key: string): void {
  if (useSettingsStore.getState().settings.notifications.activity?.markReadOnOpen === false) return;
  void api
    .mark({
      ids: [],
      entityKeys: [key],
      before: new Date().toISOString(),
      read: 'read',
      reason: 'viewed',
    })
    .catch(() => {});
}

export const viewed = {
  pr: (owner: string, repo: string, number: number) =>
    markViewed(entityKey.pr(owner, repo, number)),
  workItem: (id: number) => {
    const { organization, project } = useSettingsStore.getState().settings.azureDevOps;
    if (organization && project) markViewed(entityKey.workItem(organization, project, id));
  },
  workstream: (id: string) => markViewed(entityKey.workstream(id)),
  ciGroup: (groupId: string) => markViewed(entityKey.ciGroup(groupId)),
};
