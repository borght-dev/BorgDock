/**
 * `.gitignore`-style path patterns: `*` and `?` stay inside one folder, `**`
 * crosses folders. A pattern without a slash matches a file or folder name
 * at any depth (`*.html`, `plans`); one with a slash is anchored at the
 * repository root (`docs/plans/*.html`), unless it starts with `**`/.
 */
export function globToRegExp(pattern: string): RegExp | null {
  let glob = pattern.trim().replaceAll('\\', '/');
  if (!glob || glob.startsWith('#')) return null;
  const anywhere = !glob.replace(/\/$/, '').includes('/');
  glob = glob.replace(/^\//, '').replace(/\/$/, '');
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i] as string;
    if (char === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      source += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  // A folder match covers everything under it.
  return new RegExp(`${anywhere ? '(?:^|/)' : '^'}${source}(?:$|/)`, 'i');
}

/** Whether `path` matches one of `patterns`; blank lines and `#` comments match nothing. */
export function matchesAnyGlob(path: string, patterns: readonly string[]): boolean {
  const normalized = path.replaceAll('\\', '/');
  return patterns.some((pattern) => globToRegExp(pattern)?.test(normalized) ?? false);
}
