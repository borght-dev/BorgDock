import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KEY_FILE = 'attachment-key';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATTACHMENT_URL = /\/_apis\/wit\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\?([^#]*))?/i;
const HOUR_SECONDS = 3600;
/** A signed URL works for a day or a little more: it changes once an hour, so the phone's image cache holds. */
const VALID_HOURS = 25;
const MAX_NAME = 255;

/** The attachment an ADO URL points at (images in rich text, AttachedFile relations), or null for anything else. */
export function adoAttachment(url: string): { guid: string; name: string | null } | null {
  const match = ATTACHMENT_URL.exec(url);
  if (!match) return null;
  const name = new URLSearchParams(match[2] ?? '').get('fileName');
  return { guid: match[1].toLowerCase(), name: name?.trim() ? name.trim().slice(0, MAX_NAME) : null };
}

/**
 * Signed paths to ADO attachments, so the phone loads them without an Authorization header (AsyncImage sends
 * none). HMAC-SHA256 over `itemId/guid/name/exp` with a key kept in the data folder.
 */
export class AttachmentSigner {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    this.key = key;
  }

  /** The key in `<dataDir>/attachment-key`, made the first time. */
  static inDataDir(dataDir: string): AttachmentSigner {
    const file = join(dataDir, KEY_FILE);
    if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('base64url'), { mode: 0o600 });
    return new AttachmentSigner(Buffer.from(readFileSync(file, 'utf8').trim(), 'base64url'));
  }

  path(itemId: number, guid: string, name: string, nowMs = Date.now()): string {
    const exp = (Math.floor(nowMs / 1000 / HOUR_SECONDS) + VALID_HOURS) * HOUR_SECONDS;
    const query = new URLSearchParams({ name, exp: String(exp), sig: this.signature(itemId, guid.toLowerCase(), name, exp) });
    return `/api/items/${itemId}/attachments/${guid.toLowerCase()}?${query}`;
  }

  verify(itemId: number, guid: string, name: string, exp: string, sig: string, nowMs = Date.now()): boolean {
    const expires = Number(exp);
    if (!Number.isInteger(itemId) || !GUID.test(guid) || !name || name.length > MAX_NAME || !Number.isInteger(expires) || expires * 1000 <= nowMs) return false;
    const expected = Buffer.from(this.signature(itemId, guid.toLowerCase(), name, expires));
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private signature(itemId: number, guid: string, name: string, exp: number): string {
    return createHmac('sha256', this.key).update(`${itemId}/${guid}/${name}/${exp}`).digest('base64url');
  }
}

const INLINE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic' };

/**
 * How the proxy answers an attachment: raster images show inline; anything else (HTML, SVG, scripts) only
 * downloads, so a file someone attached never runs on the server's origin.
 */
export function attachmentHeaders(name: string, upstreamType: string | null, length: string | null): Record<string, string> {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() ?? '';
  const declared = (upstreamType ?? '').split(';')[0].trim().toLowerCase();
  const image = Object.values(INLINE_TYPES).includes(declared) ? declared : INLINE_TYPES[extension];
  const filename = encodeURIComponent(name);
  return {
    'Content-Type': image ?? 'application/octet-stream',
    'Content-Disposition': `${image ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
    'Cache-Control': 'private, max-age=86400',
    ...(length && /^\d+$/.test(length) ? { 'Content-Length': length } : {}),
  };
}
