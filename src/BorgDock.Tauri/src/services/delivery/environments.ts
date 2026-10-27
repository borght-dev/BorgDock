/**
 * Which deployment environments a repository follows: glob patterns such
 * as `dev`, `*-a`, `acc*` or `prod*`, matched without regard to case.
 */

function toRegExp(pattern: string): RegExp {
  const escaped = pattern
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

export function matchesEnvironment(environment: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => pattern.trim() !== '' && toRegExp(pattern).test(environment));
}

/** The environments recent deployments went to, most used first: what the setup suggests. */
export function suggestEnvironments(environments: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const environment of environments) {
    counts.set(environment, (counts.get(environment) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a, left], [b, right]) => right - left || a.localeCompare(b))
    .map(([environment]) => environment);
}
