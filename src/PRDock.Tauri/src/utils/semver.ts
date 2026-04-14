function parts(v: string): [number, number, number] {
  const [maj, min, pat] = v.split('.').map(Number);
  return [maj, min, pat];
}

export function semverEq(a: string, b: string): boolean {
  return a === b;
}

export function semverGt(a: string, b: string): boolean {
  const [aMaj, aMin, aPat] = parts(a);
  const [bMaj, bMin, bPat] = parts(b);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat > bPat;
}

export function semverLte(a: string, b: string): boolean {
  return !semverGt(a, b);
}
