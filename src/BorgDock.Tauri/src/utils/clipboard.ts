import { createLogger } from '@/services/logger';

const log = createLogger('clipboard');

/**
 * Copy text to the system clipboard with a 3-tier fallback chain:
 *
 *   1. `@tauri-apps/plugin-clipboard-manager` — preferred, but requires the
 *      target window's capabilities to grant `clipboard-manager:default` and
 *      can throw when called from a window that hasn't.
 *   2. `navigator.clipboard.writeText` — works in WebView2 when the page is
 *      focused; rejects on permission errors.
 *   3. `document.execCommand('copy')` via a hidden textarea — last-resort
 *      synchronous path that doesn't require any plugin permissions, used by
 *      the PR detail "Copy branch" button which originally surfaced this
 *      whole problem.
 *
 * Returns `true` on success, `false` if every strategy failed (the caller
 * decides whether to surface that to the user).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(text);
    return true;
  } catch (err) {
    log.warn('tauri clipboard plugin failed, trying navigator.clipboard', {
      error: String(err),
    });
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    log.warn('navigator.clipboard failed, trying execCommand fallback', {
      error: String(err),
    });
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) throw new Error('execCommand returned false');
    return true;
  } catch (err) {
    log.error('all clipboard strategies failed', err);
    return false;
  }
}
