import { commands, events } from '@/generated/commands';

interface Poll {
  setHidden: (hidden: boolean) => void;
}

const polls = new Set<Poll>();
let hidden = false;

function setHidden(value: boolean): void {
  hidden = value;
  for (const poll of polls) poll.setHidden(value);
}

export function trackPolling(poll: Poll): () => void {
  polls.add(poll);
  poll.setHidden(hidden);
  return () => {
    polls.delete(poll);
  };
}

export function startVisibilityTracking(): () => void {
  let stopped = false;
  let receivedEvents = 0;
  let native = false;
  let unlisten: (() => void) | undefined;
  const onVisibility = () => {
    if (!native) setHidden(document.visibilityState === 'hidden');
  };
  document.addEventListener('visibilitychange', onVisibility);
  void events.runtimeVisibility
    .listen((event) => {
      receivedEvents++;
      native = true;
      if (!stopped) setHidden(!event.payload);
    })
    .then((stop) => {
      if (stopped) stop();
      else unlisten = stop;
    })
    .catch(() => {});
  void commands
    .runtimeVisibility()
    .then((visible) => {
      if (!stopped && receivedEvents === 0 && typeof visible === 'boolean') {
        native = true;
        setHidden(!visible);
      }
    })
    .catch(() => {});
  return () => {
    stopped = true;
    unlisten?.();
    document.removeEventListener('visibilitychange', onVisibility);
    setHidden(false);
  };
}
