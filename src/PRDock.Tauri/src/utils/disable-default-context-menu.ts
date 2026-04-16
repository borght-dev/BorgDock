/**
 * Prevents the WebView2 default right-click menu (Inspect, Reload, etc.) from
 * appearing. Components that want their own context menu call
 * `e.preventDefault()` from an `onContextMenu` handler and render their menu
 * imperatively — that still works, because our listener only suppresses the
 * browser default; it does not stop propagation.
 */
export function disableDefaultContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
}
