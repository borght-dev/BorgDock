// .storybook/mocks/tauri-api-webviewWindow.ts
//
// Drop-in replacement for @tauri-apps/api/webviewWindow. Only the surface
// AgentOverviewApp uses is implemented: getCurrentWebviewWindow() with
// minimize / toggleMaximize / close.
//
// close() is a no-op — without this, clicking the title-bar X would
// unmount the Storybook iframe.

import { getControl } from './control';

interface MockWebviewWindow {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}

export function getCurrentWebviewWindow(): MockWebviewWindow {
  const ctrl = getControl();
  return {
    async minimize() {
      ctrl.invocations.push({ command: 'webviewWindow.minimize' });
    },
    async toggleMaximize() {
      ctrl.invocations.push({ command: 'webviewWindow.toggleMaximize' });
    },
    async close() {
      ctrl.invocations.push({ command: 'webviewWindow.close' });
    },
  };
}
