import { useCallback, useMemo, useReducer, useRef } from 'react';

export interface InspectorState {
  hoveredSessionId: string | null;
  pinnedSessionId:  string | null;
  focusedSessionId: string | null;
  openSessionId:    string | null;

  onCardEnter:    (sessionId: string) => void;
  onCardLeave:    (sessionId: string) => void;
  onPopoverEnter: () => void;
  onPopoverLeave: () => void;
  onCardClick:    (sessionId: string) => void;
  togglePin:      (sessionId: string) => void;
  unpin:          () => void;
  cycleFocus:     (direction: 1 | -1) => void;
  closeAll:       () => void;
}

interface State {
  hoveredSessionId: string | null;
  pinnedSessionId:  string | null;
  focusedSessionId: string | null;
}

type Action =
  | { type: 'hover/set'; id: string | null }
  | { type: 'pin/set'; id: string | null }
  | { type: 'focus/set'; id: string | null }
  | { type: 'reset' };

function reduce(s: State, a: Action): State {
  switch (a.type) {
    case 'hover/set': return { ...s, hoveredSessionId: a.id };
    case 'pin/set':   return { ...s, pinnedSessionId:  a.id };
    case 'focus/set': return { ...s, focusedSessionId: a.id };
    case 'reset':     return { hoveredSessionId: null, pinnedSessionId: null, focusedSessionId: null };
  }
}

const HOVER_CLOSE_DELAY_MS = 220;

export function useInspectorState(awaitingSessionIds: string[]): InspectorState {
  const [state, dispatch] = useReducer(reduce, {
    hoveredSessionId: null,
    pinnedSessionId:  null,
    focusedSessionId: null,
  });
  const closeTimer = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      dispatch({ type: 'hover/set', id: null });
      closeTimer.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  }, [cancelClose]);

  const onCardEnter = useCallback((id: string) => {
    cancelClose();
    dispatch({ type: 'hover/set', id });
  }, [cancelClose]);

  const onCardLeave = useCallback((_id: string) => { scheduleClose(); }, [scheduleClose]);
  const onPopoverEnter = useCallback(() => { cancelClose(); }, [cancelClose]);
  const onPopoverLeave = useCallback(() => { scheduleClose(); }, [scheduleClose]);

  const onCardClick = useCallback((id: string) => {
    cancelClose();
    dispatch({ type: 'pin/set', id });
  }, [cancelClose]);

  const togglePin = useCallback((id: string) => {
    dispatch({ type: 'pin/set', id: state.pinnedSessionId === id ? null : id });
  }, [state.pinnedSessionId]);

  const unpin = useCallback(() => { dispatch({ type: 'pin/set', id: null }); }, []);

  const cycleFocus = useCallback((direction: 1 | -1) => {
    if (awaitingSessionIds.length === 0) return;
    const cur = state.focusedSessionId;
    const len = awaitingSessionIds.length;
    let next: number;
    if (cur === null) {
      next = direction === 1 ? 0 : len - 1;
    } else {
      const idx = awaitingSessionIds.indexOf(cur);
      next = (idx + direction + len) % len;
    }
    const id = awaitingSessionIds[next] ?? null;
    dispatch({ type: 'focus/set', id });
    dispatch({ type: 'pin/set', id: null });
    dispatch({ type: 'hover/set', id });
  }, [awaitingSessionIds, state.focusedSessionId]);

  const closeAll = useCallback(() => { cancelClose(); dispatch({ type: 'reset' }); }, [cancelClose]);

  const openSessionId = state.pinnedSessionId ?? state.hoveredSessionId ?? state.focusedSessionId;

  return useMemo(() => ({
    ...state,
    openSessionId,
    onCardEnter, onCardLeave, onPopoverEnter, onPopoverLeave,
    onCardClick, togglePin, unpin, cycleFocus, closeAll,
  }), [state, openSessionId, onCardEnter, onCardLeave, onPopoverEnter, onPopoverLeave,
        onCardClick, togglePin, unpin, cycleFocus, closeAll]);
}
