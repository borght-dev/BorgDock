// .storybook/mocks/play-helpers.ts
//
// Shared helpers for Storybook play functions. Co-located with the rest of
// the storybook mock layer rather than in src/ because they're test-only.
//
// findButton(label): locate a <button> by visible text.
// waitFor(get, timeoutMs): poll until `get()` returns a truthy value, or throw.

export function findButton(label: RegExp): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((b) =>
    label.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined;
}

export async function waitFor<T>(
  get: () => T | undefined,
  // 1500ms is generous enough for a Tauri-mock invocation round-trip in
  // CI; reduce locally if a play function feels sluggish in interactive
  // Storybook.
  timeoutMs = 1500,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = get();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('waitFor: timed out');
}
