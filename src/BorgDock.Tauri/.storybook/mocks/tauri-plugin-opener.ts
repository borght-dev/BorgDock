// .storybook/mocks/tauri-plugin-opener.ts

import { getControl } from './control';

export async function openUrl(url: string): Promise<void> {
  getControl().invocations.push({ command: 'plugin:opener.openUrl', args: { url } });
}

export async function openPath(path: string): Promise<void> {
  getControl().invocations.push({ command: 'plugin:opener.openPath', args: { path } });
}
