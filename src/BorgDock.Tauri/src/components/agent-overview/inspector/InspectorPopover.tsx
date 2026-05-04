import { useEffect, useRef, useState } from 'react';
import { useAgentSessions } from '@/hooks/useAgentSessions';
import { AssistantMarkdown } from '../AssistantMarkdown';
import { useInspector } from '../InspectorContext';
import { InspectorActions } from './InspectorActions';
import { InspectorFilesSection } from './InspectorFilesSection';
import { InspectorHeader } from './InspectorHeader';
import { InspectorMessageCallout } from './InspectorMessageCallout';
import { placePopover, type PopoverStyle } from './position';

interface Props { sessionId: string }

export function InspectorPopover({ sessionId }: Props) {
  const sessions = useAgentSessions();
  const session = sessions.find((s) => s.sessionId === sessionId);
  const inspector = useInspector();
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<PopoverStyle | null>(null);

  useEffect(() => {
    function measure() {
      const el = document.querySelector<HTMLElement>(`[data-session-id="${sessionId}"]`);
      if (!el) { setStyle(null); return; }
      const rect = el.getBoundingClientRect();
      setStyle(placePopover(rect, { width: window.innerWidth, height: window.innerHeight }));
    }
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [sessionId]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      const target = e.target as Node;
      if (ref.current.contains(target)) return;
      const card = document.querySelector(`[data-session-id="${sessionId}"]`);
      if (card && card.contains(target)) return;
      inspector.closeAll();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [inspector, sessionId]);

  if (!session || !style) return null;

  return (
    <div
      ref={ref}
      role="tooltip"
      className="inspector-popover"
      style={style}
      onMouseEnter={inspector.onPopoverEnter}
      onMouseLeave={inspector.onPopoverLeave}
      onClick={() => inspector.onCardClick(session.sessionId)}
      data-pinned={inspector.pinnedSessionId === session.sessionId || undefined}
    >
      <InspectorHeader session={session} />
      <div className="inspector-body">
        {session.lastUserMsg && <InspectorMessageCallout text={session.lastUserMsg} />}
        {session.lastAssistantMsg && (
          <div className="ag-assistant-md">
            <AssistantMarkdown text={session.lastAssistantMsg} />
          </div>
        )}
        <InspectorFilesSection session={session} />
      </div>
      <InspectorActions session={session} />
    </div>
  );
}
