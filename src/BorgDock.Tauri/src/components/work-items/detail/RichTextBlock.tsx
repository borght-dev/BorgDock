import {
  ChevronDown,
  ChevronUp,
  EyeOff,
  Image as ImageIcon,
  Mail,
  ShieldAlert,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useAdoImageAuth } from '@/hooks/useAdoImageAuth';
import type { HtmlBlock } from '@/services/ado/form-model';
import { cleanHtml, markFailures } from '@/services/ado/html-noise';
import { htmlToText } from '@/services/dispatch/item-text';
import { sanitizeHtml } from '@/utils/sanitize-html';

const ICON = { size: 12, strokeWidth: 2, 'aria-hidden': true } as const;

/** Past this many characters a field clamps behind "Show all". */
const CLAMP_CHARS = 800;
const ADO_IMAGE = /(dev\.azure\.com|visualstudio\.com)/i;
/** How long an ADO image may take to arrive through the authenticated fetch. */
const AUTH_IMAGE_GRACE_MS = 4000;
const BARE_URL = /\bhttps?:\/\/[^\s<>"')]+/i;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** The first link a field mentions as plain text, shown as a chip in its header. */
export function bareUrlOf(html: string): string | null {
  const text = htmlToText(html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ''));
  return BARE_URL.exec(text)?.[0]?.replace(/[.,;:]$/, '') ?? null;
}

/** Images that never arrive (not even through the authenticated fetch) are hidden and counted. */
function useBrokenImages(ref: React.RefObject<HTMLDivElement | null>, html: string): number {
  const [broken, setBroken] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scan the images whenever the rendered html changes
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const timers: number[] = [];
    const count = () => setBroken(el.querySelectorAll('img[data-broken]').length);
    const check = (img: HTMLImageElement) => {
      if (img.complete && img.naturalWidth === 0) img.setAttribute('data-broken', '');
      else img.removeAttribute('data-broken');
      count();
    };
    const cleanups: Array<() => void> = [];
    for (const img of el.querySelectorAll('img')) {
      const onError = () => {
        const wait = ADO_IMAGE.test(img.getAttribute('src') ?? '') ? AUTH_IMAGE_GRACE_MS : 0;
        timers.push(window.setTimeout(() => check(img), wait));
      };
      const onLoad = () => check(img);
      img.addEventListener('error', onError);
      img.addEventListener('load', onLoad);
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) onError();
      cleanups.push(() => {
        img.removeEventListener('error', onError);
        img.removeEventListener('load', onLoad);
      });
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
      for (const c of cleanups) c();
    };
  }, [html]);
  return broken;
}

function Fold({
  icon,
  children,
  folded,
  onToggle,
}: {
  icon: ReactNode;
  children: ReactNode;
  folded: string | null;
  onToggle?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="bd-wid-fold">
        {icon}
        <span>{children}</span>
        {folded !== null && (
          <button
            type="button"
            className="bd-wid-fold__toggle"
            aria-expanded={open}
            onClick={() => {
              setOpen((o) => !o);
              onToggle?.();
            }}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {open && folded !== null && (
        <div
          className="bd-wid-folded bd-wid-prose"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized before cleanHtml split it
          dangerouslySetInnerHTML={{ __html: folded }}
        />
      )}
    </>
  );
}

export interface RichTextBlockProps {
  block: HtmlBlock;
  /** Clamp a long field behind "Show all". Default true. */
  clamp?: boolean;
  /** Extra header content, right-aligned (e.g. an Edit button). */
  actions?: ReactNode;
  /** Header off: the caller draws its own. */
  headless?: boolean;
  /** No fold rows: the header says what was hidden (the peek). */
  compactFolds?: boolean;
}

/**
 * A long-text field as it reads in the main column: email clutter folded
 * (banner, signature, inline images that can't load), `[FAILED]` as a badge,
 * images through the authenticated fetch, and a long field clamped.
 */
export function RichTextBlock({
  block,
  clamp = true,
  actions,
  headless = false,
  compactFolds = false,
}: RichTextBlockProps) {
  const cleaned = useMemo(() => cleanHtml(sanitizeHtml(block.html)), [block.html]);
  const body = useMemo(() => markFailures(cleaned.html), [cleaned.html]);
  const text = useMemo(() => htmlToText(body), [body]);
  const url = useMemo(() => bareUrlOf(block.html), [block.html]);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useAdoImageAuth(ref, body);
  const broken = useBrokenImages(ref, body);
  const long = clamp && text.length > CLAMP_CHARS;
  const fromEmail = cleaned.banner !== null || cleaned.signature !== null;
  const sender = cleaned.signature?.sender;
  const hiddenImages = cleaned.hiddenImages + broken;

  return (
    <section className="bd-wid-field" data-wid-field={block.key}>
      {!headless && (
        <header className="bd-wid-field__head">
          <h2>{block.label}</h2>
          {fromEmail && (
            <span className="bd-wid-field__src">
              <Mail {...ICON} />
              {sender ? `Email from ${sender}` : 'From an email'}
            </span>
          )}
          {block.custom && <span className="bd-wid-ftag">custom field</span>}
          <span className="bd-wid-spacer" />
          {compactFolds && (cleaned.banner !== null || cleaned.signature !== null) && (
            <span className="bd-wid-field__src">
              <EyeOff {...ICON} />
              {[cleaned.banner !== null && 'banner', cleaned.signature !== null && 'signature']
                .filter(Boolean)
                .join(' and ')}{' '}
              hidden
            </span>
          )}
          {url && (
            <button
              type="button"
              className="bd-wid-linkchip"
              title={url}
              onClick={() =>
                import('@tauri-apps/plugin-opener')
                  .then(({ openUrl }) => openUrl(url))
                  .catch(() => {})
              }
            >
              <span>{url.replace(/^https?:\/\//, '')}</span>
            </button>
          )}
          {actions}
        </header>
      )}
      {cleaned.banner !== null && !compactFolds && (
        <Fold icon={<ShieldAlert {...ICON} />} folded={cleaned.banner}>
          External-sender warning hidden
        </Fold>
      )}
      <div
        className={long && !expanded ? 'bd-wid-clamp' : undefined}
        style={long && !expanded ? ({ '--bd-wid-clamp': '230px' } as never) : undefined}
      >
        <div
          ref={ref}
          className="bd-wid-prose"
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.tagName !== 'IMG') return;
            if (target.hasAttribute('data-zoomed')) target.removeAttribute('data-zoomed');
            else target.setAttribute('data-zoomed', '');
          }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via sanitizeHtml, then only folded
          dangerouslySetInnerHTML={{ __html: body }}
        />
      </div>
      {long && (
        <button
          type="button"
          className="bd-wid-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Show less' : `Show all · ${words(text)} words`}
          {expanded ? <ChevronUp {...ICON} /> : <ChevronDown {...ICON} />}
        </button>
      )}
      {cleaned.signature !== null && !compactFolds && (
        <Fold icon={<EyeOff {...ICON} />} folded={cleaned.signature.html}>
          Signature hidden{sender ? `: ${sender}` : ''}
          {cleaned.signature.images + hiddenImages > 0
            ? `, plus ${cleaned.signature.images + hiddenImages} image${cleaned.signature.images + hiddenImages === 1 ? '' : 's'}`
            : ''}
        </Fold>
      )}
      {cleaned.signature === null && hiddenImages > 0 && !compactFolds && (
        <Fold icon={<ImageIcon {...ICON} />} folded={null}>
          {hiddenImages} email image{hiddenImages === 1 ? '' : 's'} can't be shown
        </Fold>
      )}
    </section>
  );
}
