// .storybook/mocks/tauri-plugin-updater.ts
//
// Defensive mock for @tauri-apps/plugin-updater. The current production
// `useAutoUpdate` hook does NOT import this package directly — it routes
// through Tauri IPC via `invoke('check_for_update')` and
// `invoke('download_and_install_update')`. Stories that need to drive
// update flow should seed those keys via `getControl().invokeResponses`
// against the tauri-core mock, NOT this file.
//
// This mock exists so that any future code path that imports the JS
// plugin API directly is captured (no story is silently calling the
// real package). Records calls into getControl().invocations and supports
// per-story overrides through invokeResponses['updater.*'].

import { getControl } from './control';

export interface MockUpdate {
  version: string;
  date?: string;
  body?: string;
  downloadAndInstall(): Promise<void>;
  download(): Promise<void>;
  install(): Promise<void>;
}

export async function check(): Promise<MockUpdate | null> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'updater.check' });
  const override = ctrl.invokeResponses['updater.check'];
  if (override === '__throw__') {
    throw new Error('updater.check rejected (storybook mock)');
  }
  if (typeof override === 'function') {
    return (override as (args: unknown) => MockUpdate | null)(undefined);
  }
  if (override && typeof override === 'object') {
    return wrapUpdate(override as Partial<MockUpdate>);
  }
  return null;
}

function wrapUpdate(over: Partial<MockUpdate>): MockUpdate {
  return {
    version: over.version ?? '99.0.0',
    date: over.date,
    body: over.body,
    async downloadAndInstall() {
      getControl().invocations.push({ command: 'updater.downloadAndInstall' });
    },
    async download() {
      getControl().invocations.push({ command: 'updater.download' });
    },
    async install() {
      getControl().invocations.push({ command: 'updater.install' });
    },
  };
}
