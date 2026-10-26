import { commands, events } from '@/generated/commands';
import { commandData } from '@/services/native-command';
import { useT3SessionStore } from '@/stores/t3-session-store';

export function followT3Sessions(): () => void {
  let stopped = false;
  let received = false;
  let unlisten: (() => void) | undefined;
  void events.t3SessionsUpdated
    .listen((event) => {
      received = true;
      if (!stopped) useT3SessionStore.getState().setSessions(event.payload);
    })
    .then(async (stop) => {
      if (stopped) {
        stop();
        return;
      }
      unlisten = stop;
      const sessions = await commandData(commands.t3ListSessions());
      if (!stopped && !received) useT3SessionStore.getState().setSessions(sessions);
    })
    .catch(() => {});
  return () => {
    stopped = true;
    unlisten?.();
  };
}
