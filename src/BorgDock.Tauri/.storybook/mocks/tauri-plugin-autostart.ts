// .storybook/mocks/tauri-plugin-autostart.ts
//
// Drop-in replacement for @tauri-apps/plugin-autostart. AppearanceSection
// toggles autostart via enable() / disable(); the mock records the call into
// the standard invocations log so stories can assert on it without a new
// control field.
//
// To force enable() to reject (e.g. for AutostartFailure story), set:
//   getControl().invokeResponses['autostart.enable'] = '__throw__'
// or assign a function that returns a rejected promise.

import { getControl } from './control';

export async function enable(): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'autostart.enable' });
  const override = ctrl.invokeResponses['autostart.enable'];
  if (override === '__throw__') throw new Error('autostart enable failed');
  if (typeof override === 'function') {
    return (override as (args: unknown) => Promise<void> | void)(undefined) as Promise<void>;
  }
}

export async function disable(): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'autostart.disable' });
  const override = ctrl.invokeResponses['autostart.disable'];
  if (override === '__throw__') throw new Error('autostart disable failed');
  if (typeof override === 'function') {
    return (override as (args: unknown) => Promise<void> | void)(undefined) as Promise<void>;
  }
}
