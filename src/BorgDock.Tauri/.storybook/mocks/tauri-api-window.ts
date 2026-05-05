// .storybook/mocks/tauri-api-window.ts
//
// Drop-in replacement for @tauri-apps/api/window. Covers the surfaces
// every window storied so far uses:
//   - getCurrentWindow().close/minimize/maximize/unmaximize/isMaximized  (Phase 2)
//   - getCurrentWindow().hide/setSize/innerSize/scaleFactor              (Phase 3)
//   - currentMonitor()                                                   (Phase 3)
//
// hide() and close() are no-ops — without them, the Worktree palette's
// Esc-to-hide and the WhatsNew "Got it" button would unmount the
// Storybook iframe. setSize() updates the recorded windowSize so a
// follow-up innerSize() reflects the resize, but the iframe itself is
// unaffected (Storybook controls visible bounds).

import { getControl } from './control';

interface MockPhysicalSize {
  width: number;
  height: number;
}

interface MockWindow {
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  hide(): Promise<void>;
  setSize(size: { width: number; height: number }): Promise<void>;
  innerSize(): Promise<MockPhysicalSize>;
  scaleFactor(): Promise<number>;
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
    async hide() {
      ctrl.invocations.push({ command: 'window.hide' });
    },
    async setSize(size) {
      ctrl.invocations.push({ command: 'window.setSize', args: size });
      ctrl.windowSize.width = size.width;
      ctrl.windowSize.height = size.height;
    },
    async innerSize() {
      // Production code expects PhysicalSize, so return width*scaleFactor.
      return {
        width: ctrl.windowSize.width * ctrl.windowSize.scaleFactor,
        height: ctrl.windowSize.height * ctrl.windowSize.scaleFactor,
      };
    },
    async scaleFactor() {
      return ctrl.windowSize.scaleFactor;
    },
  };
}

export async function currentMonitor() {
  const ctrl = getControl();
  return (
    ctrl.monitorState ?? {
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
    }
  );
}
