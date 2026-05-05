// .storybook/mocks/tauri-plugin-dialog.ts
//
// Drop-in replacement for @tauri-apps/plugin-dialog. Covers the full
// public API (open / save / message / ask / confirm) so future windows
// (Settings is the immediate next consumer) can reuse without rewrite.
//
// Each call records the invocation on the control surface and reads its
// return from getControl().pluginDialog.<*Response>. Stories may set a
// literal value or a function (which receives the call's options).
//
// Defaults — no story override:
//   open      → null (user cancelled)
//   save      → null (user cancelled)
//   message   → void
//   ask       → true (user said yes)
//   confirm   → true (user confirmed)

import { getControl } from './control';

export interface OpenDialogOptions {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  multiple?: boolean;
  directory?: boolean;
  title?: string;
  recursive?: boolean;
}

export interface SaveDialogOptions {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  title?: string;
}

export interface MessageDialogOptions {
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
  title?: string;
}

export interface ConfirmDialogOptions extends MessageDialogOptions {
  cancelLabel?: string;
}

export async function open(options?: OpenDialogOptions): Promise<string | string[] | null> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:dialog.open', args: options });
  const r = ctrl.pluginDialog.openResponse;
  if (typeof r === 'function') return r(options);
  return r ?? null;
}

export async function save(options?: SaveDialogOptions): Promise<string | null> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:dialog.save', args: options });
  const r = ctrl.pluginDialog.saveResponse;
  if (typeof r === 'function') return r(options);
  return r ?? null;
}

export async function message(text: string, options?: MessageDialogOptions): Promise<void> {
  getControl().invocations.push({ command: 'plugin:dialog.message', args: { text, options } });
}

export async function ask(text: string, options?: ConfirmDialogOptions): Promise<boolean> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:dialog.ask', args: { text, options } });
  const r = ctrl.pluginDialog.askResponse;
  if (typeof r === 'function') return r(text, options);
  return r ?? true;
}

export async function confirm(text: string, options?: ConfirmDialogOptions): Promise<boolean> {
  const ctrl = getControl();
  ctrl.invocations.push({ command: 'plugin:dialog.confirm', args: { text, options } });
  const r = ctrl.pluginDialog.confirmResponse;
  if (typeof r === 'function') return r(text, options);
  return r ?? true;
}
