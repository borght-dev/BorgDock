// .storybook/mocks/tauri-plugin-notification.ts
//
// Defensive mock for @tauri-apps/plugin-notification. Current production
// notification flow runs through `src/services/notification.ts`, which
// calls `invoke('show_flyout_toast')` — the JS plugin API surfaced here
// is not imported by any production .ts/.tsx today. Stories that need to
// drive notification permission/sending should seed the relevant
// `invoke()` command keys against the tauri-core mock.
//
// This mock exists so any future code path that imports the JS plugin
// directly is captured. Default: permission granted; sendNotification
// is a no-op that records into getControl().invocations.

import { getControl } from './control';

export type Permission = 'granted' | 'denied' | 'default';

export async function isPermissionGranted(): Promise<boolean> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'notification.isPermissionGranted' });
  const override = ctrl.invokeResponses['notification.isPermissionGranted'];
  if (typeof override === 'boolean') return override;
  return true;
}

export async function requestPermission(): Promise<Permission> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'notification.requestPermission' });
  const override = ctrl.invokeResponses['notification.requestPermission'];
  if (typeof override === 'string') return override as Permission;
  return 'granted';
}

export interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  [key: string]: unknown;
}

export function sendNotification(options: NotificationOptions | string): void {
  const args = typeof options === 'string' ? { title: options } : options;
  getControl().invocations.push({ command: 'notification.sendNotification', args });
}
