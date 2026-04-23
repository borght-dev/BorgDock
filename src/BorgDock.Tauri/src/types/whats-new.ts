export type Kind = 'new' | 'improved' | 'fixed';

export interface Highlight {
  kind: Kind;
  title: string;
  /** Markdown description with the hero image stripped out. */
  description: string;
  /** First markdown image in the bullet, or null. */
  hero: { src: string; alt: string } | null;
  /** First backtick-wrapped shortcut token (e.g. "Ctrl+Shift+W"), if any. */
  keyboard: string | null;
}

export interface Release {
  /** "1.0.11" — strict x.y.z. */
  version: string;
  /** ISO-like "YYYY-MM-DD". */
  date: string;
  /** Auto-generated one-liner shown in the hero and collapsed row. */
  summary: string;
  highlights: Highlight[];
  /** Plain-markdown bullets with no **title** prefix. */
  alsoFixed: string[];
  /** Precomputed: ≥1 highlight with kind 'new' or 'improved'. */
  autoOpenEligible: boolean;
}
