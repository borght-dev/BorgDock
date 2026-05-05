// .storybook/mocks/tauri-core.ts
//
// Drop-in replacement for @tauri-apps/api/core in Storybook.
// Logs every invocation and returns canned responses from the control surface.
//
// invokeResponses values can be either a static value OR a function
// (args) => T | Promise<T>. The function form lets stories vary the
// response by argument — required when a window fans out the same
// command per repo / per file / per work item.

import { getControl } from './control';

export async function invoke<T = unknown>(command: string, args?: unknown): Promise<T> {
  const ctrl = getControl();
  ctrl.invocations.push({ command, args });
  const response = ctrl.invokeResponses[command];
  if (typeof response === 'function') {
    return (await (response as (a: unknown) => unknown)(args)) as T;
  }
  return (response as T) ?? (undefined as T);
}
