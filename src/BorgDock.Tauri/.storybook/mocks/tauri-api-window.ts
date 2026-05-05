// .storybook/mocks/tauri-api-window.ts
//
// Drop-in replacement for @tauri-apps/api/window. Only the surface
// WhatsNewApp uses is implemented: getCurrentWindow().{close,minimize,
// maximize,unmaximize,isMaximized}.
//
// close() is a no-op — without this, the "Got it" button would unmount
// the Storybook iframe.

import { getControl } from './control';

interface MockWindow {
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
}

export function getCurrentWindow(): MockWindow {
  const ctrl = getControl();
  return {
    async close() {
      ctrl.invocations.push({ command: 'window.close' });
    },
    async minimize() {
      ctrl.invocations.push({ command: 'window.minimize' });
    },
    async maximize() {
      ctrl.invocations.push({ command: 'window.maximize' });
      ctrl.windowState.isMaximized = true;
    },
    async unmaximize() {
      ctrl.invocations.push({ command: 'window.unmaximize' });
      ctrl.windowState.isMaximized = false;
    },
    async isMaximized() {
      return ctrl.windowState.isMaximized;
    },
  };
}
