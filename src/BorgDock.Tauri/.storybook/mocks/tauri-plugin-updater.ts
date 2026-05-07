// .storybook/mocks/tauri-plugin-updater.ts
//
// Mock for @tauri-apps/plugin-updater. Records calls into getControl()
// and returns either no update (default) or a fake Update object whose
// downloadAndInstall() / download() methods also record.

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
