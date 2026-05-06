// .storybook/mocks/tauri-plugin-fs.ts
//
// Drop-in replacement for @tauri-apps/plugin-fs. WorkItemDetailApp uses
// writeFile() for attachment downloads. Settings export/import will use
// readTextFile / writeTextFile. We also alias readFile so future
// consumers don't need a follow-up mock.
//
// All writes/reads go through an in-memory Map on getControl().pluginFs
// so stories can assert against bytes the production code wrote.

import { getControl } from './control';

export async function writeFile(path: string, contents: Uint8Array): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({
    command: 'plugin:fs.writeFile',
    args: { path, byteLength: contents.byteLength },
  });
  if (ctrl.pluginFs.failNextWrite) {
    ctrl.pluginFs.failNextWrite = false;
    throw new Error('storybook: writeFile failed');
  }
  ctrl.pluginFs.writes.set(path, contents);
}

export async function readFile(path: string): Promise<Uint8Array> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:fs.readFile', args: { path } });
  const data = ctrl.pluginFs.reads.get(path);
  if (!data) throw new Error(`storybook: no read fixture for ${path}`);
  return data;
}

export async function writeTextFile(path: string, text: string): Promise<void> {
  return writeFile(path, new TextEncoder().encode(text));
}

export async function readTextFile(path: string): Promise<string> {
  const bytes = await readFile(path);
  return new TextDecoder().decode(bytes);
}
