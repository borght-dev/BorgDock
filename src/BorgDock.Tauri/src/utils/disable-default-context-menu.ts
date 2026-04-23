/**
 * Prevents the WebView2 default right-click menu (Inspect, Reload, etc.) from
 * appearing. Components that want their own context menu call
 * `e.preventDefault()` from an `onContextMenu` handler and render their menu
 * imperatively — that still works, because our listener only suppresses the
 * browser default; it does not stop propagation.
 *
 * In dev mode we deliberately leave the default menu alone so the "Inspect"
 * item is reachable — `npm run tauri dev` otherwise has no way to open
 * devtools on chromeless windows.
 */
export function disableDefaultContextMenu() {
  if (import.meta.env.DEV) return;
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
}
