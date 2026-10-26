import type { HighlightCategory, HighlightSpan } from '@/types';
import { requestSyntax } from './syntax-worker-client';

export async function highlightLines(
  filename: string,
  lines: string[],
  signal?: AbortSignal,
): Promise<Map<number, HighlightSpan[]> | null> {
  return (await requestSyntax(filename, lines, signal))?.highlights ?? null;
}
export function getHighlightClass(category: HighlightCategory): string {
  return `--color-syntax-${category}`;
}
