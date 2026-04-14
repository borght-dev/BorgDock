import type { Release } from '../../src/types/whats-new';

export type { Release };

export interface ParsedChangelog {
  releases: Release[];
  /** Image references found in the markdown: { version, relPath, lineNumber }. */
  imageRefs: Array<{ version: string; relPath: string; lineNumber: number }>;
}

export interface ParseError extends Error {
  lineNumber?: number;
}
