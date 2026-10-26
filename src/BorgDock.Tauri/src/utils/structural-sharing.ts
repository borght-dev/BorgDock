export function shareValue<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (Array.isArray(previous) && Array.isArray(next)) {
    const shared = next.map((value, i) => shareValue(previous[i], value));
    return previous.length === shared.length && shared.every((value, i) => value === previous[i])
      ? previous
      : (shared as T);
  }
  if (
    previous &&
    next &&
    typeof previous === 'object' &&
    typeof next === 'object' &&
    Object.getPrototypeOf(previous) === Object.prototype &&
    Object.getPrototypeOf(next) === Object.prototype
  ) {
    const before = previous as Record<string, unknown>;
    const after = next as Record<string, unknown>;
    const keys = Object.keys(after);
    const shared = Object.fromEntries(
      keys.map((key) => [key, shareValue(before[key], after[key])]),
    );
    return keys.length === Object.keys(before).length &&
      keys.every((key) => Object.hasOwn(before, key) && shared[key] === before[key])
      ? previous
      : (shared as T);
  }
  return next;
}

export function shareEntities<T>(
  previous: T[],
  next: T[],
  keyOf: (value: T) => string | number,
): T[] {
  const byKey = new Map(previous.map((value) => [keyOf(value), value]));
  const shared = next.map((value) => shareValue(byKey.get(keyOf(value)), value) as T);
  return shared.length === previous.length && shared.every((value, i) => value === previous[i])
    ? previous
    : shared;
}
