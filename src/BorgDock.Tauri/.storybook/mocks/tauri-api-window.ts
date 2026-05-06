// .storybook/mocks/tauri-api-window.ts
//
// Drop-in replacement for @tauri-apps/api/window. Covers the surfaces
// every window storied so far uses:
//   - getCurrentWindow().close/minimize/maximize/unmaximize/isMaximized  (Phase 2)
//   - getCurrentWindow().hide/setSize/innerSize/scaleFactor              (Phase 3)
//   - getCurrentWindow().outerPosition/setPosition/onMoved               (Phase 4)
//   - getCurrentWindow().setTitle/getTitle                               (Phase 6)
//   - getCurrentWindow().onFocusChanged                                  (Phase 7)
//   - currentMonitor()                                                   (Phase 3)
//
// hide() and close() are no-ops — without them, the Worktree palette's
// Esc-to-hide, the WhatsNew "Got it" button, and the WorkItemDetail
// close icon would unmount the Storybook iframe. setSize() updates the
// recorded windowSize so a follow-up innerSize() reflects the resize,
// but the iframe itself is unaffected (Storybook controls visible bounds).
//
// Listener-class methods (onMoved, onFocusChanged) register under
// synthetic '__window.<name>' channels. Stories drive events with
// getControl().emit('__window.<name>', payload). The '__window.' prefix
// is reserved for getCurrentWindow() listener emulation so future phases
// (onCloseRequested, onResized, etc.) can reuse the pattern without
// colliding with real Tauri event names.

import { getControl, type ChannelListener } from './control';

interface MockPhysicalSize {
  width: number;
  height: number;
}

interface MockPhysicalPosition {
  x: number;
  y: number;
}

interface PositionInput {
  x: number;
  y: number;
  // Optional discriminator from LogicalPosition / PhysicalPosition.
  type?: 'Logical' | 'Physical';
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
  outerPosition(): Promise<MockPhysicalPosition>;
  setPosition(pos: PositionInput): Promise<void>;
  onMoved(cb: (event: { payload: MockPhysicalPosition }) => void): Promise<() => void>;
  onFocusChanged(cb: (event: { payload: boolean }) => void): Promise<() => void>;
  setTitle(title: string): Promise<void>;
  getTitle(): Promise<string>;
}

export type Window = MockWindow;

const ON_MOVED_CHANNEL = '__window.onMoved';
const ON_FOCUS_CHANGED_CHANNEL = '__window.onFocusChanged';

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
    async outerPosition() {
      // Real Tauri returns PhysicalPosition. Multiply by scaleFactor so
      // SqlApp's `pos.x / scale` round-trip lands back at the logical x,y.
      return {
        x: ctrl.windowSize.x * ctrl.windowSize.scaleFactor,
        y: ctrl.windowSize.y * ctrl.windowSize.scaleFactor,
      };
    },
    async setPosition(pos) {
      ctrl.invocations.push({ command: 'window.setPosition', args: pos });
      // Logical inputs scale up; Physical pass through. A plain {x,y} with
      // no type is treated as Logical (matches the most common caller).
      const isPhysical = pos.type === 'Physical';
      const factor = isPhysical ? 1 : ctrl.windowSize.scaleFactor;
      ctrl.windowSize.x = (pos.x * factor) / ctrl.windowSize.scaleFactor;
      ctrl.windowSize.y = (pos.y * factor) / ctrl.windowSize.scaleFactor;
    },
    async onMoved(cb) {
      let set = ctrl.channels.get(ON_MOVED_CHANNEL);
      if (!set) {
        set = new Set();
        ctrl.channels.set(ON_MOVED_CHANNEL, set);
      }
      const wrapped: ChannelListener = (event) =>
        cb(event as { payload: MockPhysicalPosition });
      set.add(wrapped);
      return () => {
        set?.delete(wrapped);
      };
    },
    async onFocusChanged(cb) {
      let set = ctrl.channels.get(ON_FOCUS_CHANGED_CHANNEL);
      if (!set) {
        set = new Set();
        ctrl.channels.set(ON_FOCUS_CHANGED_CHANNEL, set);
      }
      const wrapped: ChannelListener = (event) =>
        cb(event as { payload: boolean });
      set.add(wrapped);
      return () => {
        set?.delete(wrapped);
      };
    },
    async setTitle(title: string) {
      ctrl.invocations.push({ command: 'window.setTitle', args: { title } });
      ctrl.windowState.title = title;
    },
    async getTitle() {
      return ctrl.windowState.title;
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
