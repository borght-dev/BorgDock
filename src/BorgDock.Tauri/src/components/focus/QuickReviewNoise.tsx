import { FoldVertical, UnfoldVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import type { HunkFolds } from '@/components/pr-detail/diff/DiffFileSection';
import { parsePatch } from '@/services/diff-parser';
import { describeNoise, type FileNoise } from '@/services/review-noise';
import type { DiffFile, DiffHunk } from '@/types';

function hunksOf(file: DiffFile): DiffHunk[] {
  return file.hunks?.length ? file.hunks : file.patch ? parsePatch(file.patch) : [];
}

function changedCount(hunk: DiffHunk | undefined): number {
  return hunk?.lines.filter((line) => line.type === 'add' || line.type === 'delete').length ?? 0;
}

/** Key of one hunk's fold in the set of opened ones. */
export function foldKey(scope: string, path: string, index: number): string {
  return `${scope}:${path}#${index}`;
}

/**
 * The fold lines for `file`'s noise hunks: folded unless the reviewer opened
 * them (`opened`, by `foldKey`) or `pinned` says the hunk holds something
 * that must stay in view, like a draft comment. Undefined when the file has
 * no noise.
 */
export function noiseFolds(
  file: DiffFile,
  noise: FileNoise | undefined,
  scope: string,
  opened: ReadonlySet<string>,
  onToggle: (key: string) => void,
  pinned?: (hunk: DiffHunk) => boolean,
): HunkFolds | undefined {
  if (!noise?.hunks.some(Boolean)) return undefined;
  const hunks = hunksOf(file);
  const folds = new Map<number, { folded: boolean; row: ReactNode }>();
  noise.hunks.forEach((kind, index) => {
    const hunk = hunks[index];
    if (!kind || !hunk || pinned?.(hunk)) return;
    const key = foldKey(scope, file.filename, index);
    const folded = !opened.has(key);
    const lines = changedCount(hunk);
    const Icon = folded ? UnfoldVertical : FoldVertical;
    folds.set(index, {
      folded,
      row: (
        <button
          type="button"
          className="qr-noise"
          data-kind={kind.kind}
          aria-expanded={!folded}
          onClick={() => onToggle(key)}
        >
          <Icon size={13} strokeWidth={2.25} aria-hidden="true" />
          <span className="qr-noise__what">{describeNoise(kind)}</span>
          <span className="qr-noise__size">
            {lines} {lines === 1 ? 'line' : 'lines'}
          </span>
          <span className="qr-noise__act">{folded ? 'Show' : 'Fold'}</span>
        </button>
      ),
    });
  });
  return folds;
}
