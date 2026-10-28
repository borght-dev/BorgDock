import { highlightLines } from './syntax-engine';
import type { HighlightRequest, HighlightResponse } from './syntax-worker-protocol';

self.onmessage = async (event: MessageEvent<HighlightRequest>) => {
  const { id, filename, lines } = event.data;
  try {
    const highlights = await highlightLines(filename, lines);
    self.postMessage({ id, highlights } satisfies HighlightResponse);
  } catch {
    self.postMessage({ id, highlights: null } satisfies HighlightResponse);
  }
};
