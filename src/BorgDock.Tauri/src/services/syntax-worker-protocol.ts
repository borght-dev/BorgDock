import type { HighlightSpan } from '@/types';

export interface HighlightRequest {
  id: number;
  filename: string;
  lines: string[];
}

export interface HighlightResponse {
  id: number;
  highlights?: Map<number, HighlightSpan[]> | null;
}
