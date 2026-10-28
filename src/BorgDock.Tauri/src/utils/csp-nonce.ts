/**
 * Tauri stamps a per-load nonce onto the inline `<script>`/`<style>` tags it
 * serves and whitelists it in the CSP. Any stylesheet a library injects at
 * runtime (CodeMirror's base theme) has to carry the same nonce or the
 * packaged app refuses it. Returns '' outside Tauri (dev server, Storybook,
 * vitest) where no CSP is enforced — CodeMirror treats an empty nonce as
 * "none".
 */
export function readCspNonce(): string {
  if (typeof document === 'undefined') return '';
  const el = document.querySelector<HTMLElement>('style[nonce], script[nonce]');
  return el?.nonce ?? el?.getAttribute('nonce') ?? '';
}
