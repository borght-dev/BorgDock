interface Props {
  path: string;
  relPath: string;
  initialBaseline: 'HEAD' | 'mergeBaseDefault';
  onPopOut: (baseline: 'HEAD' | 'mergeBaseDefault') => void;
}

export function DiffPreview({ path, relPath, initialBaseline, onPopOut }: Props) {
  return (
    <div className="bd-fp-preview bd-fp-preview--diff">
      <div className="bd-fp-preview-actionbar">
        <span className="bd-mono">{relPath}</span>
        <span className="bd-fp-preview-spacer" />
        <span>{initialBaseline === 'HEAD' ? 'vs HEAD' : 'vs main'}</span>
        <button type="button" aria-label="Open in window" onClick={() => onPopOut(initialBaseline)}>↗</button>
      </div>
      <div className="bd-fp-preview-body">Diff for {path} — populated in Task 15.</div>
    </div>
  );
}
