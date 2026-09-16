const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');

/** `⌘K` on macOS, `Ctrl+K` elsewhere. */
export function shortcutLabel(key: string): string {
  return IS_MAC ? `⌘${key}` : `Ctrl+${key}`;
}
