import { ChevronDown, ChevronUp, Eye, ShieldCheck } from 'lucide-react';
import type { HtmlView } from '@/components/pr-detail/diff/RenderedHtml';
import { IconButton, Seg2 } from '@/components/shared/primitives';

function short(sha: string) {
  return sha.slice(0, 7);
}

function Commit({ headSha }: { headSha: string }) {
  return (
    <>
      <Eye size={14} strokeWidth={2.25} aria-hidden="true" />
      <span>
        Rendered at the head commit <code>{short(headSha)}</code>
      </span>
    </>
  );
}

interface MarkdownStripProps {
  headSha: string;
  /** A new file has no changes to step through: all of it is new. */
  newFile: boolean;
  /** How many changes the page marks. */
  changes: number;
  /** The change last stepped to, from 0. */
  at: number;
  onStep: (delta: number) => void;
}

/** Above a rendered Markdown file: which commit it is, what the marks mean, and the steps between them. */
export function RenderedMarkdownStrip({
  headSha,
  newFile,
  changes,
  at,
  onStep,
}: MarkdownStripProps) {
  return (
    <div className="qr-rendered-strip">
      <Commit headSha={headSha} />
      {newFile && <span className="qr-rendered-strip__pill">New file</span>}
      <span className="qr-spacer" />
      {!newFile && changes > 0 && (
        <>
          <span className="qr-rendered-strip__key" data-change="added">
            added
          </span>
          <span className="qr-rendered-strip__key" data-change="changed">
            changed
          </span>
          <span className="qr-rendered-strip__key" data-change="removed">
            removed
          </span>
          <span className="qr-rendered-strip__count" role="status">
            Change {Math.min(at, changes - 1) + 1} of {changes}
          </span>
          <IconButton
            icon={<ChevronUp size={14} strokeWidth={2.25} aria-hidden="true" />}
            tooltip="Previous change"
            aria-label="Previous change"
            size={22}
            onClick={() => onStep(-1)}
          />
          <IconButton
            icon={<ChevronDown size={14} strokeWidth={2.25} aria-hidden="true" />}
            tooltip="Next change"
            aria-label="Next change"
            size={22}
            onClick={() => onStep(1)}
          />
        </>
      )}
    </div>
  );
}

interface HtmlStripProps {
  headSha: string;
  /** The pull request changed an existing page: there is a version from before. */
  earlier: boolean;
  view: HtmlView;
  onView: (view: HtmlView) => void;
  fit: boolean;
  onFit: (fit: boolean) => void;
}

/** Above a rendered HTML file: which commit it is, which version, and how wide. */
export function RenderedHtmlStrip({ headSha, earlier, view, onView, fit, onFit }: HtmlStripProps) {
  return (
    <div className="qr-rendered-strip">
      <Commit headSha={headSha} />
      {!earlier && <span className="qr-rendered-strip__pill">New file</span>}
      <span className="qr-spacer" />
      {earlier && (
        <Seg2
          size="sm"
          ariaLabel="Version"
          value={view}
          onChange={onView}
          options={[
            { value: 'after', label: 'After' },
            { value: 'before', label: 'Before' },
            { value: 'both', label: 'Side by side' },
          ]}
        />
      )}
      <Seg2
        size="sm"
        ariaLabel="Page width"
        value={fit ? 'fit' : 'actual'}
        onChange={(value) => onFit(value === 'fit')}
        options={[
          { value: 'fit', label: 'Fit width' },
          { value: 'actual', label: '100%' },
        ]}
      />
      <span
        className="qr-rendered-strip__pill"
        data-tone="safe"
        title="The page's scripts run in a closed frame. It cannot reach BorgDock, your GitHub account or other servers on this machine."
      >
        <ShieldCheck size={12} strokeWidth={2.25} aria-hidden="true" />
        Sandboxed
      </span>
    </div>
  );
}
