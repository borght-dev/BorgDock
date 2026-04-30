import { useMemo } from 'react';
import type { Selection } from './FilePaletteApp';
import { DiffPreview } from './DiffPreview';
import { FilePreview } from './FilePreview';
import { joinRootAndRel } from './join-path';

interface ContentHit {
  matches: { line: number }[];
}

interface Props {
  rootPath: string | null;
  selection: Selection | null;
  contentHit: ContentHit | null;
  onIdentifierJump: (word: string) => void;
  onPopOut: (path: string, baseline?: 'HEAD' | 'mergeBaseDefault') => void;
}

export function FilePalettePreviewPane({
  rootPath, selection, contentHit, onIdentifierJump, onPopOut,
}: Props) {
  const absPath = useMemo(() => {
    if (!rootPath || !selection) return null;
    return joinRootAndRel(rootPath, selection.path);
  }, [rootPath, selection]);

  if (!selection || !absPath) {
    return <div className="bd-fp-preview bd-fp-preview--empty">Select a file to preview</div>;
  }

  if (selection.kind === 'diff') {
    return (
      <DiffPreview
        path={absPath}
        relPath={selection.path}
        initialBaseline={selection.baseline}
        onPopOut={(baseline) => onPopOut(absPath, baseline)}
      />
    );
  }

  return (
    <FilePreview
      path={absPath}
      relPath={selection.path}
      contentHit={contentHit}
      scrollToLine={selection.line}
      onIdentifierJump={onIdentifierJump}
      onPopOut={() => onPopOut(absPath, undefined)}
    />
  );
}
