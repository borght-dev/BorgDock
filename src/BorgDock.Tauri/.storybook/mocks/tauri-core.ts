// .storybook/mocks/tauri-core.ts
//
// Drop-in replacement for @tauri-apps/api/core in Storybook.
// Logs every invocation and returns canned responses from the control surface.

import { getControl } from './control';

export async function invoke<T = unknown>(command: string, args?: unknown): Promise<T> {
  const ctrl = getControl();
  ctrl.invocations.push({ command, args });
  const response = ctrl.invokeResponses[command];
  return (response as T) ?? (undefined as T);
}
