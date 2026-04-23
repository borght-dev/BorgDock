/**
 * Joins a root directory path and a relative path, producing a forward-slash
 * absolute path. Normalizes backslashes (Windows), strips trailing slash from
 * root, and strips leading slash from rel.
 */
export function joinRootAndRel(root: string, rel: string): string {
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  const normRel = rel.replace(/\\/g, '/').replace(/^\//, '');
  return `${normRoot}/${normRel}`;
}
