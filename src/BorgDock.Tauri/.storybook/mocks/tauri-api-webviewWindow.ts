// .storybook/mocks/tauri-api-webviewWindow.ts
//
// Drop-in replacement for @tauri-apps/api/webviewWindow. Covers:
//   - getCurrentWebviewWindow()    (Phase 5 — Agent Overview titlebar)
//   - WebviewWindow class          (Phase 8 — palette opens child windows)
//
// close() is a no-op — without it, clicking the title-bar X would
// unmount the Storybook iframe. Constructing a WebviewWindow records
// the construction on getControl().webviewWindowsCreated so stories can
// assert "the user just opened a detail window".

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

// Loose-typed options bag — the real plugin's option type has many keys
// and not every consumer passes the same shape. We forward whatever was
// passed.
export interface WebviewWindowOptions {
  url?: string;
  title?: string;
  width?: number;
  height?: number;
  center?: boolean;
  decorations?: boolean;
  resizable?: boolean;
  focus?: boolean;
  skipTaskbar?: boolean;
  visible?: boolean;
  [key: string]: unknown;
}

export class WebviewWindow {
  readonly label: string;
  readonly options: WebviewWindowOptions;

  constructor(label: string, options?: WebviewWindowOptions) {
    this.label = label;
    this.options = options ?? {};
    const ctrl = getControl();
    ctrl.webviewWindowsCreated.push({
      label,
      options: { ...this.options },
    });
    ctrl.invocations.push({
      command: 'webviewWindow.new',
      args: { label, options: { ...this.options } },
    });
  }

  async close() {
    getControl().invocations.push({ command: 'webviewWindow.close', args: { label: this.label } });
  }
  async hide() {
    getControl().invocations.push({ command: 'webviewWindow.hide', args: { label: this.label } });
  }
  async show() {
    getControl().invocations.push({ command: 'webviewWindow.show', args: { label: this.label } });
  }
  async setFocus() {
    getControl().invocations.push({ command: 'webviewWindow.setFocus', args: { label: this.label } });
  }
}
