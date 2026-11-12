import { clip, htmlToText } from '@/services/dispatch/item-text';

/**
 * Email clutter in long-text fields (design/work-item-detail/mockups.html,
 * frame F): an item filed from an email starts with an external-sender
 * banner, ends with a signature full of logos, and carries inline images
 * (`cid:`) that can never load. These rules only fold: the folded parts are
 * returned so "Show" can put them back, and editing always edits the original.
 */

const BANNER =
  /(originated from outside (of )?(the|your|our) organi[sz]ation|^\s*caution\s*:|\[\s*external\s*\]|external (sender|e-?mail)|this (e-?mail|message) (is|was|came) from (an )?(external|outside))/i;

/** A short closing line that starts a signature. */
const SIGN_OFF =
  /^(kind regards|best regards|warm regards|warmest regards|regards|best wishes|best|cheers|many thanks|thanks|thank you|met vriendelijke groet(en)?|vriendelijke groet(en)?|hartelijke groet(en)?|groet(en|jes)?|mvg|vurige groeten|cordialement|bien (à|a) vous|salutations|mit freundlichen gr(ü|ue)(ß|ss)en|viele gr(ü|ue)(ß|ss)e|saludos|un saludo)\b/i;

const GREETING =
  /^(hi|hello|hey|dear|good (morning|afternoon|evening)|beste|hallo|hoi|goedemorgen|goedemiddag|bonjour|guten (tag|morgen)|hola)\b[^.!?]{0,60}[,!:]?$/i;

/** Images this small are logos, icons or trackers. */
const TINY_IMAGE_PX = 48;

export interface FoldedSignature {
  html: string;
  /** The sender's name: the line after the sign-off. */
  sender: string | null;
  /** Images the signature held. */
  images: number;
}

export interface CleanedHtml {
  html: string;
  /** The external-sender banner, when one was folded. */
  banner: string | null;
  signature: FoldedSignature | null;
  /** Inline email images and tiny images that were dropped outside the signature. */
  hiddenImages: number;
}

const BLOCK_TAGS = new Set([
  'DIV',
  'P',
  'TABLE',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'PRE',
  'HR',
]);

function textOf(node: Node): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function isWrapper(el: Element): boolean {
  return el.tagName === 'DIV' || el.tagName === 'SPAN' || el.tagName === 'FONT';
}

/** The element whose children are the email's blocks: past any single wrapper div. */
function contentRoot(body: HTMLElement): Element {
  let root: Element = body;
  for (;;) {
    const kids = [...root.childNodes].filter(
      (n) => n.nodeType === 1 || (n.nodeType === 3 && textOf(n) !== ''),
    );
    const only = kids[0];
    if (kids.length !== 1 || !only || only.nodeType !== 1 || !isWrapper(only as Element))
      return root;
    root = only as Element;
  }
}

function isTinyImage(img: HTMLImageElement): boolean {
  const w = Number(img.getAttribute('width'));
  const h = Number(img.getAttribute('height'));
  return (w > 0 && w <= TINY_IMAGE_PX) || (h > 0 && h <= TINY_IMAGE_PX);
}

function unloadable(img: HTMLImageElement): boolean {
  const src = (img.getAttribute('src') ?? '').trim();
  return src === '' || /^cid:/i.test(src);
}

function isBlank(node: Node): boolean {
  if (node.nodeType === 3) return textOf(node) === '';
  if (node.nodeType !== 1) return true;
  const el = node as Element;
  if (el.tagName === 'IMG' || el.tagName === 'HR') return false;
  if (el.querySelector('img, table, hr')) return false;
  return textOf(el) === '';
}

function serialize(nodes: Node[]): string {
  const holder = document.createElement('div');
  for (const node of nodes) holder.appendChild(node.cloneNode(true));
  return holder.innerHTML;
}

/** The first short line of `nodes` that reads like a name. */
function senderOf(lines: string[]): string | null {
  for (const line of lines) {
    if (!line || line.length > 60 || /[@\d:/]/.test(line)) continue;
    return line.replace(/[,.]$/, '');
  }
  return null;
}

/** Folds the banner, the signature and images that can't load; keeps everything else as written. */
export function cleanHtml(html: string): CleanedHtml {
  const result: CleanedHtml = { html, banner: null, signature: null, hiddenImages: 0 };
  if (!html || typeof DOMParser === 'undefined') return result;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const root = contentRoot(doc.body);

  // The banner: one of the first three blocks with text.
  const firstBlocks = [...root.childNodes].filter((n) => !isBlank(n)).slice(0, 3);
  const banner = firstBlocks.find((n) => BANNER.test(textOf(n)) && textOf(n).length < 600);
  if (banner) {
    result.banner = serialize([banner]);
    banner.parentNode?.removeChild(banner);
  }

  // The signature: from a short sign-off line to the end, when text comes before it.
  const blocks = [...root.childNodes];
  const signOffAt = blocks.findIndex((n, i) => {
    if (i === 0) return false;
    const text = textOf(n);
    if (!text || text.length > 80) return false;
    if (!SIGN_OFF.test(text)) return false;
    return blocks.slice(0, i).some((b) => textOf(b) !== '');
  });
  if (signOffAt > 0) {
    const tail = blocks.slice(signOffAt);
    const lines = tail.flatMap((n) =>
      (n.nodeType === 1 ? htmlToText((n as Element).outerHTML) : textOf(n)).split('\n'),
    );
    const images = tail.reduce(
      (count, n) =>
        count +
        (n.nodeType === 1
          ? (n as Element).querySelectorAll('img').length +
            ((n as Element).tagName === 'IMG' ? 1 : 0)
          : 0),
      0,
    );
    result.signature = { html: serialize(tail), sender: senderOf(lines.slice(1)), images };
    for (const node of tail) node.parentNode?.removeChild(node);
  }

  // Images that can never load, and logos.
  for (const img of [...root.querySelectorAll('img')]) {
    if (!unloadable(img) && !isTinyImage(img)) continue;
    result.hiddenImages += 1;
    const parent = img.parentElement;
    img.remove();
    if (parent && parent !== root && isBlank(parent) && !BLOCK_TAGS.has(parent.tagName))
      parent.remove();
  }

  // Runs of empty blocks and stacked line breaks.
  let previousBlank = true;
  for (const node of [...root.childNodes]) {
    const blank = isBlank(node) && !(node.nodeType === 1 && (node as Element).tagName === 'BR');
    if (blank) {
      node.parentNode?.removeChild(node);
      continue;
    }
    if (node.nodeType === 1 && (node as Element).tagName === 'BR' && previousBlank) {
      node.parentNode?.removeChild(node);
      continue;
    }
    previousBlank = node.nodeType === 1 && (node as Element).tagName === 'BR';
  }
  for (const br of [...root.querySelectorAll('br + br')]) br.remove();

  result.html = doc.body.innerHTML;
  return result;
}

/** `[FAILED]` in repro steps becomes a red "Fails" badge. */
export function markFailures(html: string): string {
  return html.replace(/\[\s*fail(ed)?\s*\]/gi, '<span class="bd-wi-fails">Fails</span>');
}

/**
 * What an item is about, as plain text for a card: the cleaned field without
 * its greeting, cut at `limit` characters.
 */
export function gistText(html: string, limit = 280): string {
  const cleaned = cleanHtml(html).html;
  const lines = htmlToText(cleaned)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^\[?image\]?$/i.test(line));
  while (lines.length > 1 && GREETING.test(lines[0]!)) lines.shift();
  return clip(lines.join(' '), limit);
}
