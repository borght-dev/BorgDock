// .storybook/mocks/tauri-plugin-clipboard-manager.ts
//
// Drop-in replacement for @tauri-apps/plugin-clipboard-manager. Only
// writeText is stubbed (SqlApp's only consumer). Writes are recorded
// in getControl().clipboardWrites so stories can assert what was
// copied without poking at the real OS clipboard.

import { getControl } from './control';

export async function writeText(text: string): Promise<void> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'clipboard.writeText', args: { text } });
  ctrl.clipboardWrites.push(text);
}
