// .storybook/mocks/tauri-api-app.ts
//
// Drop-in replacement for @tauri-apps/api/app.getVersion().
// Returns the per-story override or a sensible default.

import { getControl } from './control';

export async function getVersion(): Promise<string> {
  return getControl().appVersion ?? '1.2.0';
}
