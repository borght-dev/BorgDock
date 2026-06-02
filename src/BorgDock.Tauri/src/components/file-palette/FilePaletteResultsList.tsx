import clsx from 'clsx';
import { useState } from 'react';
import type { SearchMode } from './parse-query';

export interface ResultEntry {
  rel_path: string;
  mode: SearchMode;
  match_count?: number;
  line?: number;
  symbol?: string;
}

interface Props {
  results: ResultEntry[];
  selectedIndex: number;
  onHover: (i: number) => void;
  onOpen: (i: number) => void;
  /** Copy the row's repo-relative path to the clipboard. */
  onCopyPath: (relPath: string) => void;
  rowRef: (el: HTMLButtonElement | null, i: number) => void;
}

export function FilePaletteResultsList({
  results,
  selectedIndex,
  onHover,
  onOpen,
  onCopyPath,
  rowRef,
}: Props) {
  // Which row just flashed a checkmark. Index-keyed; cleared after a short delay.
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  if (results.length === 0) return null;
  return (
    <div className="bd-fp-results">
      {results.map((r, i) => {
        const selected = i === selectedIndex;
        const copied = copiedIndex === i;
        return (
          // The wrap owns hover/selection so the copy button stays visible while the
          // pointer travels from the path onto it. data-file-result lives here (not on
          // the inner button) so it spans the whole row for selectors/tests.
          <div
            key={`${r.rel_path}:${r.line ?? 0}`}
            data-file-result
            data-selected={selected ? 'true' : 'false'}
            className={clsx('bd-fp-result-row-wrap', selected && 'bd-fp-result-row-wrap--selected')}
            onMouseEnter={() => onHover(i)}
          >
            <button
              type="button"
              className="bd-fp-result-row"
              ref={(el) => rowRef(el, i)}
              onClick={() => onOpen(i)}
            >
              <span className="bd-fp-result-path">{r.rel_path}</span>
              {r.match_count !== undefined && (
                <span className="bd-fp-result-meta">
                  {r.match_count} match{r.match_count === 1 ? '' : 'es'}
                </span>
              )}
              {r.line !== undefined && (
                <span className="bd-fp-result-meta">
                  {r.symbol ? `${r.symbol} · ` : ''}L{r.line}
                </span>
              )}
            </button>
            <button
              type="button"
              data-copy-path
              className={clsx('bd-fp-result-copy', copied && 'bd-fp-result-copy--copied')}
              title={copied ? 'Copied!' : 'Copy relative path'}
              aria-label={`Copy relative path: ${r.rel_path}`}
              onClick={() => {
                onCopyPath(r.rel_path);
                setCopiedIndex(i);
                window.setTimeout(() => setCopiedIndex((cur) => (cur === i ? null : cur)), 1200);
              }}
            >
              {copied ? <CheckIcon /> : <ClipboardIcon />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ClipboardIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3.2" width="10" height="11" rx="1.5" />
      <rect x="5.4" y="1.8" width="5.2" height="2.6" rx="0.8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m3.5 8.5 3 3 6-6.5" />
    </svg>
  );
}
