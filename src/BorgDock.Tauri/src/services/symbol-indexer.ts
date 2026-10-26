import type { SymbolEntry } from '@/types/symbol';
import { requestSyntax } from './syntax-worker-client';

export async function indexSymbols(
  filename: string,
  content: string,
  signal?: AbortSignal,
): Promise<SymbolEntry[]> {
  return (await requestSyntax(filename, content.split('\n'), signal, 'symbols'))?.symbols ?? [];
}
