// .storybook/mocks/tauri-event.ts
//
// Drop-in replacement for @tauri-apps/api/event. Stores listeners by channel
// so stories can push events into them via getControl().emit(channel, payload).

import { getControl, type ChannelListener } from './control';

export type UnlistenFn = () => void;

export async function listen<T>(
  channel: string,
  cb: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  const ctrl = getControl();
  let set = ctrl.channels.get(channel);
  if (!set) {
    set = new Set();
    ctrl.channels.set(channel, set);
  }
  const wrapped = cb as ChannelListener;
  set.add(wrapped);
  return () => {
    set?.delete(wrapped);
  };
}

export async function emit(_channel: string, _payload?: unknown): Promise<void> {
  // no-op — outbound emits are not needed for FlyoutApp stories
}

export async function emitTo(
  _target: string,
  _channel: string,
  _payload?: unknown,
): Promise<void> {
  // no-op — outbound emits are not needed for FlyoutApp stories
}
