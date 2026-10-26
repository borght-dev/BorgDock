import type { HighlightSpan } from '@/types';
import type { SymbolEntry } from '@/types/symbol';

export interface HighlightRequest {
  id: number;
  operation?: 'highlight' | 'symbols';
  filename: string;
  lines: string[];
}

export interface HighlightResponse {
  id: number;
  highlights?: Map<number, HighlightSpan[]> | null;
  symbols?: SymbolEntry[];
}
