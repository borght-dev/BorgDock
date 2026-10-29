import {
  type CSSProperties,
  lazy,
  type MouseEvent,
  type ReactNode,
  Suspense,
  useState,
} from 'react';
import { HoverPopover } from '@/components/shared/primitives/HoverPopover';
import { isWebHref } from '@/services/work-item-peek';
import { useSettingsStore } from '@/stores/settings-store';
import type { WorkItem } from '@/types';

// Both lazy, so everything that renders Markdown stays light: the card reads
// the Dispatch and PR stores, and the preview renders Markdown itself.
const WorkItemHoverCard = lazy(() =>
  import('./WorkItemHoverCard').then((m) => ({ default: m.WorkItemHoverCard })),
);
const WorkItemPreview = lazy(() =>
  import('@/components/pr-detail/WorkItemPreview').then((m) => ({ default: m.WorkItemPreview })),
);

/** What the card shows while its module loads on the first hover. */
function CardLoading({ id }: { id: number }) {
  return (
    <div className="bd-wi-card" data-work-item-card={id} aria-busy="true">
      <div className="bd-wi-card__body">
        <div className="bd-wi-card__top">
          <span className="bd-wi-card__id">AB#{id}</span>
        </div>
        <div className="bd-skeleton-line" style={{ width: '92%', height: 12, marginTop: 12 }} />
        <div className="bd-skeleton-line" style={{ width: '60%', height: 12 }} />
      </div>
    </div>
  );
}

/** The ADO page of a work item: the link's own URL, else built from the configured org and project. */
function useWorkItemWebUrl(id: number, href?: string): string | null {
  const ado = useSettingsStore((s) => s.settings.azureDevOps);
  if (isWebHref(href)) return href;
  if (!ado.organization || !ado.project) return null;
  return `https://dev.azure.com/${encodeURIComponent(ado.organization)}/${encodeURIComponent(ado.project)}/_workitems/edit/${id}`;
}

function openInBrowser(url: string) {
  import('@tauri-apps/plugin-opener')
    .then(({ openUrl }) => openUrl(url))
    .catch((err) => console.error('openUrl failed', err));
}

/** The card's width and the most it grows before it scrolls. */
export const WORK_ITEM_CARD_SIZE = { maxWidth: 400, maxHeight: 440 } as const;

interface WorkItemRefProps {
  id: number;
  /** The item when the caller already has it; the card shows it at once. */
  item?: WorkItem;
  /** The link's own href; an ADO URL is what Ctrl+click opens. */
  href?: string;
  /** The trigger. Without it, `AB#<id>` as a link. */
  children?: ReactNode;
  className?: string;
  triggerStyle?: CSSProperties;
  'aria-label'?: string;
}

/**
 * A work item reference with its hover card: hover shows the card, click
 * reads the whole item in the preview dialog, Ctrl+click opens it in Azure
 * DevOps.
 */
export function WorkItemRef({
  id,
  item,
  href,
  children,
  className = 'bd-wi-ref',
  triggerStyle,
  'aria-label': ariaLabel,
}: WorkItemRefProps) {
  const [reading, setReading] = useState(false);
  const webUrl = useWorkItemWebUrl(id, href);

  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if ((event.ctrlKey || event.metaKey) && webUrl) openInBrowser(webUrl);
    else setReading(true);
  };

  return (
    <>
      <HoverPopover
        variant="card"
        disabled={reading}
        triggerStyle={triggerStyle}
        {...WORK_ITEM_CARD_SIZE}
        content={
          <Suspense fallback={<CardLoading id={id} />}>
            <WorkItemHoverCard id={id} initial={item} canOpenWeb={!!webUrl} />
          </Suspense>
        }
      >
        <a
          href={webUrl ?? undefined}
          className={className}
          data-work-item-ref={id}
          aria-label={ariaLabel}
          onClick={onClick}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.stopPropagation();
            // A link with an href turns Enter into a click by itself.
            if (event.key === ' ' || !webUrl) {
              event.preventDefault();
              setReading(true);
            }
          }}
          role={webUrl ? undefined : 'button'}
          tabIndex={0}
        >
          {children ?? `AB#${id}`}
        </a>
      </HoverPopover>
      {reading && (
        <Suspense fallback={null}>
          <WorkItemPreview key={id} id={id} item={item} onClose={() => setReading(false)} />
        </Suspense>
      )}
    </>
  );
}
