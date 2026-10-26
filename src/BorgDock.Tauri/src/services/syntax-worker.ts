import { extractSymbols } from './symbol-engine';
import { highlightLines } from './syntax-engine';
import type { HighlightRequest, HighlightResponse } from './syntax-worker-protocol';

self.onmessage = async (event: MessageEvent<HighlightRequest>) => {
  const { id, filename, lines, operation } = event.data;
  try {
    const result =
      operation === 'symbols'
        ? { id, symbols: await extractSymbols(filename, lines) }
        : { id, highlights: await highlightLines(filename, lines) };
    self.postMessage(result satisfies HighlightResponse);
  } catch {
    self.postMessage({ id, highlights: null, symbols: [] } satisfies HighlightResponse);
  }
};
