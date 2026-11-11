import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpenText,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  ExternalLink,
  Eye,
  FlaskConical,
  GitCommitHorizontal,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Button, Pill } from '@/components/shared/primitives';
import {
  citationLabel,
  citationsByPath,
  coverageSummary,
  type FileRead,
  type RiskAssessment,
  type RiskCitation,
  type RiskLevel,
  type RiskReason,
  riskLimits,
  type SnippetLine,
} from '@/services/risk-assessment';
import type { RiskView } from '@/stores/risk-assessment-store';
import { formatAgo } from '@/utils/relative-time';
import './quick-review-risk.css';

const ICON = { size: 14, strokeWidth: 2.25, 'aria-hidden': true } as const;
const SMALL = { size: 12, strokeWidth: 2.25, 'aria-hidden': true } as const;

const WORD: Record<RiskLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unknown: 'Unknown',
};

/** A reason's tone: its severity, or `lower` for one that keeps the risk down. */
type Tone = RiskLevel | 'lower' | 'none';

export function toneOf(reason: RiskReason): Tone {
  return reason.effect === 'lowers' ? 'lower' : (reason.severity ?? 'medium');
}

function agentName(provider: string): string {
  return provider === 'codex' ? 'Codex' : 'Claude';
}

function byline(assessment: RiskAssessment): string {
  const model = assessment.model && assessment.model !== 'default' ? ` · ${assessment.model}` : '';
  return `${agentName(assessment.provider)}${model}`;
}

const short = (sha: string) => sha.slice(0, 7);
const base = (path: string) => path.split('/').pop() ?? path;

function LevelIcon({ level, size = 14 }: { level: RiskLevel; size?: number }) {
  const props = { size, strokeWidth: 2.25, 'aria-hidden': true } as const;
  if (level === 'unknown') return <CircleHelp {...props} />;
  if (level === 'low') return <CircleCheck {...props} />;
  return <TriangleAlert {...props} />;
}

/** The assessment the view shows, current or stale, or null. */
function shownAssessment(view: RiskView): RiskAssessment | null {
  if (view.kind === 'ready') return view.assessment;
  if (view.kind === 'waiting') return null;
  return view.previous;
}

/**
 * The header's risk chip: the level, "older commit" when it is for an
 * earlier head, or what is happening while there is none. Never Low
 * without an assessment.
 */
export function RiskPill({ view }: { view: RiskView }) {
  if (view.kind === 'waiting') return null;
  const assessment = shownAssessment(view);
  if (!assessment) {
    if (view.kind === 'assessing')
      return (
        <Pill
          tone="ghost"
          className="qr-risk-pill"
          icon={<LoaderCircle {...SMALL} className="qr-spin" />}
        >
          Assessing risk
        </Pill>
      );
    return (
      <Pill
        tone="ghost"
        className="qr-risk-pill"
        icon={view.kind === 'failed' ? <TriangleAlert {...SMALL} /> : undefined}
        title={view.kind === 'failed' ? `No assessment: ${view.error}` : undefined}
      >
        Risk not assessed
      </Pill>
    );
  }
  const stale = view.kind !== 'ready';
  const level = assessment.level;
  return (
    <Pill
      tone={
        level === 'high'
          ? 'error'
          : level === 'medium'
            ? 'warning'
            : level === 'low'
              ? 'success'
              : 'ghost'
      }
      className="qr-risk-pill"
      data-level={level}
      data-stale={stale || undefined}
      icon={<LevelIcon level={level} size={12} />}
      title={stale ? `For ${short(assessment.headSha)}, an older commit` : assessment.headline}
    >
      {level === 'unknown' ? 'Risk unknown' : `${WORD[level]} risk`}
      {stale && ' · older commit'}
    </Pill>
  );
}

function Scale({ level }: { level: RiskLevel | null }) {
  const on = level === 'low' ? 0 : level === 'medium' ? 1 : level === 'high' ? 2 : -1;
  return (
    <div className="qr-risk__scale" aria-hidden="true">
      {['Low', 'Medium', 'High'].map((word, i) => (
        <span key={word} data-on={i === on || undefined}>
          {word}
        </span>
      ))}
    </div>
  );
}

/** A code excerpt: the cited lines marked, the rest for context. */
export function RiskSnippet({
  lines,
  single,
  tone,
  label,
}: {
  lines: readonly SnippetLine[];
  /** One line number column: a file or the description, not a diff. */
  single: boolean;
  tone: Tone;
  label: string;
}) {
  let labelled = false;
  return (
    <div className="qr-risk-code" data-single={single || undefined}>
      <div className="qr-risk-code__in">
        {lines.map((line) => {
          const showLabel = line.cited && !labelled;
          if (showLabel) labelled = true;
          return (
            <div
              key={`${line.kind}:${line.old ?? ''}:${line.new ?? ''}`}
              className="qr-risk-code__line"
              data-kind={line.kind}
              data-tone={line.cited ? tone : undefined}
            >
              <span className="qr-risk-code__mark">{showLabel && <b>{label}</b>}</span>
              {!single && <span className="qr-risk-code__num">{line.old ?? ''}</span>}
              <span className="qr-risk-code__num">{line.new ?? ''}</span>
              <span className="qr-risk-code__sign">
                {line.kind === 'add' ? '+' : line.kind === 'delete' ? '−' : ''}
              </span>
              <span className="qr-risk-code__text">{line.text || ' '}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WHERE = { diff: 'in this PR', file: 'outside the diff', description: 'PR description' };

/** Whether the walk can show a citation: a line of a changed file the walk lists. */
function walkable(citation: RiskCitation, files: ReadonlySet<string>): boolean {
  return citation.where !== 'description' && files.has(citation.path);
}

interface CitationActions {
  /** Changed files the walk lists now. */
  files: ReadonlySet<string>;
  onOpenCitation?: (citation: RiskCitation) => void;
  onOpenOnGitHub?: (citation: RiskCitation) => void;
}

function CitationChip({
  citation,
  actions,
  onExpand,
}: {
  citation: RiskCitation;
  actions: CitationActions;
  onExpand: () => void;
}) {
  const where = citation.where === 'diff' ? 'diff' : citation.where === 'file' ? 'file' : 'body';
  const canWalk = !!actions.onOpenCitation && walkable(citation, actions.files);
  const path = citation.where === 'description' ? 'PR description' : citation.path;
  const lines =
    citation.from === citation.to
      ? `line ${citation.from}`
      : `lines ${citation.from}–${citation.to}`;
  return (
    <button
      type="button"
      className="qr-risk-anchor"
      data-where={where}
      title={`${path}, ${lines} (${WHERE[citation.where]})${canWalk ? ' · open in the walk' : ''}`}
      onClick={() => (canWalk ? actions.onOpenCitation?.(citation) : onExpand())}
    >
      <span>{citationLabel(citation)}</span>
      {citation.where === 'file' && <small>outside diff</small>}
    </button>
  );
}

function Evidence({
  reason,
  citation,
  actions,
}: {
  reason: RiskReason;
  citation: RiskCitation;
  actions: CitationActions;
}) {
  const canWalk = !!actions.onOpenCitation && walkable(citation, actions.files);
  const lines =
    citation.from === citation.to
      ? `line ${citation.from}`
      : `lines ${citation.from}–${citation.to}`;
  return (
    <figure className="qr-risk-snip">
      <figcaption>
        <code>{citation.where === 'description' ? 'PR description' : citation.path}</code>
        <span>{lines}</span>
        <span className="qr-risk-where" data-where={citation.where}>
          {citation.where === 'file'
            ? 'outside the diff, at the head commit'
            : citation.where === 'description'
              ? 'written by the PR author'
              : WHERE[citation.where]}
        </span>
        {canWalk ? (
          <Button
            variant="ghost"
            size="sm"
            trailing={<ArrowRight {...SMALL} />}
            onClick={() => actions.onOpenCitation?.(citation)}
          >
            Open in walk
          </Button>
        ) : (
          citation.where === 'file' &&
          actions.onOpenOnGitHub && (
            <Button
              variant="ghost"
              size="sm"
              trailing={<ExternalLink {...SMALL} />}
              onClick={() => actions.onOpenOnGitHub?.(citation)}
            >
              GitHub
            </Button>
          )
        )}
      </figcaption>
      <RiskSnippet
        lines={citation.snippet}
        single={citation.where !== 'diff'}
        tone={toneOf(reason)}
        label={reason.id}
      />
    </figure>
  );
}

const TEST_TEXT = {
  none: 'No test',
  partial: 'Partly tested',
  covered: 'Tested',
  unknown: 'Tests not read',
};

function ReasonItem({
  reason,
  open,
  onToggle,
  actions,
  idBase,
}: {
  reason: RiskReason;
  open: boolean;
  onToggle: () => void;
  actions: CitationActions;
  idBase: string;
}) {
  const evidenceId = `${idBase}-evidence-${reason.id}`;
  const tone = toneOf(reason);
  const test = reason.test;
  return (
    <li
      className="qr-risk-reason"
      data-tone={tone}
      data-open={open || undefined}
      data-reason={reason.id}
    >
      <div className="qr-risk-reason__row">
        <div className="qr-risk-reason__tag">
          <span className="qr-risk-reason__id">{reason.id}</span>
          <span className="qr-risk-reason__level">
            {reason.effect === 'lowers' ? <ArrowDown {...SMALL} /> : <ArrowUp {...SMALL} />}
            {reason.effect === 'lowers' ? 'Lowers' : WORD[reason.severity ?? 'medium']}
          </span>
        </div>
        <div className="qr-risk-reason__main">
          <button
            type="button"
            className="qr-risk-reason__title"
            aria-expanded={open}
            aria-controls={evidenceId}
            onClick={onToggle}
          >
            <span>{reason.title}</span>
            <ChevronRight {...ICON} />
          </button>
          {reason.because && <p className="qr-risk-reason__because">{reason.because}</p>}
          <div className="qr-risk-reason__meta">
            {reason.citations.map((citation) => (
              <CitationChip
                key={`${citationLabel(citation)}:${citation.where}`}
                citation={citation}
                actions={actions}
                onExpand={() => {
                  if (!open) onToggle();
                }}
              />
            ))}
            {test && (
              <span className="qr-risk-test" data-status={test.status}>
                {test.status === 'covered' ? (
                  <CircleCheck {...SMALL} />
                ) : test.status === 'unknown' ? (
                  <CircleHelp {...SMALL} />
                ) : (
                  <FlaskConical {...SMALL} />
                )}
                <span>{test.note || TEST_TEXT[test.status]}</span>
                {test.citation && (
                  <CitationChip
                    citation={test.citation}
                    actions={actions}
                    onExpand={() => {
                      if (!open) onToggle();
                    }}
                  />
                )}
              </span>
            )}
          </div>
          {!reason.citations.length && (
            <p className="qr-risk-reason__unmatched">
              {reason.unmatched
                ? "None of the lines it cited matched the code, so there's no evidence to show."
                : 'It cited no lines for this.'}
            </p>
          )}
        </div>
      </div>
      <div className="qr-risk-evidence" id={evidenceId} hidden={!open}>
        {open && (
          <>
            {reason.why && (
              <p className="qr-risk-evidence__why">
                <b>
                  {reason.effect === 'lowers'
                    ? 'Keeps it down.'
                    : `Why ${WORD[reason.severity ?? 'medium'].toLowerCase()}.`}
                </b>{' '}
                {reason.why}
              </p>
            )}
            {reason.citations.map((citation) => (
              <Evidence
                key={`${citationLabel(citation)}:${citation.where}`}
                reason={reason}
                citation={citation}
                actions={actions}
              />
            ))}
            {test?.citation && (
              <Evidence reason={reason} citation={test.citation} actions={actions} />
            )}
            {reason.unmatched > 0 && reason.citations.length > 0 && (
              <p className="qr-risk-reason__unmatched">
                {reason.unmatched === 1
                  ? 'One more line it cited did not match the code and is left out.'
                  : `${reason.unmatched} more lines it cited did not match the code and are left out.`}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}

const READ_LABEL: Record<FileRead | 'outside' | 'body', string> = {
  full: 'Read in full',
  cut: 'Cut at the prompt budget',
  name: 'By name only',
  outside: 'Outside the diff',
  body: 'PR description',
};

/** Characters a long file name keeps, cut in the middle so similar names still differ at the end. */
function middle(name: string, max = 22): string {
  return name.length > max ? `${name.slice(0, 9)}…${name.slice(-(max - 10))}` : name;
}

function CiteTags({ reasons }: { reasons: readonly RiskReason[] }) {
  if (!reasons.length) return null;
  return (
    <span className="qr-risk-tags">
      {reasons.map((reason) => (
        <i key={reason.id} data-tone={toneOf(reason)}>
          {reason.id}
        </i>
      ))}
    </span>
  );
}

function Coverage({
  assessment,
  onOpenFile,
  files,
}: {
  assessment: RiskAssessment;
  onOpenFile?: (path: string) => void;
  files: ReadonlySet<string>;
}) {
  const cited = new Map<string, RiskReason[]>();
  for (const [path, list] of citationsByPath(assessment)) {
    cited.set(path, [...new Map(list.map(({ reason }) => [reason.id, reason])).values()]);
  }
  const reads = new Set<string>(assessment.files.map((f) => f.read));
  if (assessment.outside.length) reads.add('outside');
  const many = assessment.files.length > 12;
  return (
    <section className="qr-risk-cov" aria-label="What the assessment read">
      <h4 className="qr-risk-group__h">
        What it read{' '}
        <span>
          {assessment.files.length} changed {assessment.files.length === 1 ? 'file' : 'files'}
        </span>
      </h4>
      {many ? (
        <ul className="qr-risk-cells" aria-label="Changed files by how they were read">
          {assessment.files.map((file) => {
            const by = cited.get(file.path) ?? [];
            const label = `${file.path} · ${READ_LABEL[file.read]}${by.length ? ` · cited by ${by.map((r) => r.id).join(', ')}` : ''}`;
            const first = by[0];
            return (
              <li key={file.path}>
                <button
                  type="button"
                  className="qr-risk-cell qr-risk-rd"
                  data-read={file.read}
                  data-cited={first ? toneOf(first) : undefined}
                  title={label}
                  aria-label={label}
                  disabled={!onOpenFile || !files.has(file.path)}
                  onClick={() => onOpenFile?.(file.path)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="qr-risk-tiles">
          {assessment.files.map((file) => (
            <button
              key={file.path}
              type="button"
              className="qr-risk-tile"
              data-read={file.read}
              title={`${file.path} · ${READ_LABEL[file.read]}${file.nameOnly === 'generated' ? ' (generated)' : file.nameOnly === 'skipped' ? ' (skipped by your settings)' : ''}`}
              disabled={!onOpenFile || !files.has(file.path)}
              onClick={() => onOpenFile?.(file.path)}
            >
              <span className="qr-risk-rd" data-read={file.read} />
              <span className="qr-risk-tile__name">{middle(base(file.path))}</span>
              <span className="qr-risk-tile__meta">
                <span className="qr-positive">+{file.additions}</span>
                <span className="qr-negative">−{file.deletions}</span>
                {file.generated && <span>gen</span>}
                <CiteTags reasons={cited.get(file.path) ?? []} />
              </span>
            </button>
          ))}
          {assessment.outside.length > 0 && (
            <>
              <p className="qr-risk-tiles__sep">
                Cited outside the diff, checked against the head commit
              </p>
              {assessment.outside.map((path) => (
                <div
                  key={path}
                  className="qr-risk-tile"
                  data-read="outside"
                  title={`${path} · not changed by this PR`}
                >
                  <span className="qr-risk-rd" data-read="outside" />
                  <span className="qr-risk-tile__name">{middle(base(path))}</span>
                  <span className="qr-risk-tile__meta">
                    <span>not changed</span>
                    <CiteTags reasons={cited.get(path) ?? []} />
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      <ul className="qr-risk-legend">
        {(['full', 'cut', 'name', 'outside'] as const)
          .filter((read) => reads.has(read))
          .map((read) => (
            <li key={read}>
              <span className="qr-risk-rd" data-read={read} />
              {READ_LABEL[read]}
            </li>
          ))}
      </ul>
      <p className="qr-risk-cov__sum">{coverageSummary(assessment)}</p>
      <p className="qr-risk-limits">
        <Eye {...SMALL} />
        <span>{riskLimits(assessment)}</span>
      </p>
    </section>
  );
}

function Reasons({
  assessment,
  open,
  onToggle,
  actions,
  idBase,
}: {
  assessment: RiskAssessment;
  open: ReadonlySet<string>;
  onToggle: (id: string) => void;
  actions: CitationActions;
  idBase: string;
}) {
  const raises = assessment.reasons.filter((r) => r.effect === 'raises');
  const lowers = assessment.reasons.filter((r) => r.effect === 'lowers');
  const unknown = assessment.level === 'unknown';
  return (
    <div className="qr-risk-groups">
      {raises.length ? (
        <div className="qr-risk-group">
          <h4 className="qr-risk-group__h">
            {unknown ? 'Seen in what it read' : 'What could break'} <span>{raises.length}</span>
            {unknown && <small>Not a verdict</small>}
          </h4>
          <ol className="qr-risk-reasons">
            {raises.map((reason) => (
              <ReasonItem
                key={reason.id}
                reason={reason}
                open={open.has(reason.id)}
                onToggle={() => onToggle(reason.id)}
                actions={actions}
                idBase={idBase}
              />
            ))}
          </ol>
        </div>
      ) : (
        <p className="qr-risk-none">
          {unknown ? (
            <>
              <b>Nothing found in what it read.</b> That says little while most of it went unread.
            </>
          ) : (
            <>
              <b>Nothing found that could break.</b> Low covers what it read. See its limits below.
            </>
          )}
        </p>
      )}
      {lowers.length > 0 && (
        <div className="qr-risk-group">
          <h4 className="qr-risk-group__h">
            What keeps it down <span>{lowers.length}</span>
          </h4>
          <ol className="qr-risk-reasons">
            {lowers.map((reason) => (
              <ReasonItem
                key={reason.id}
                reason={reason}
                open={open.has(reason.id)}
                onToggle={() => onToggle(reason.id)}
                actions={actions}
                idBase={idBase}
              />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="qr-risk-skel" aria-hidden="true">
      {[78, 64, 70].map((width) => (
        <div key={width}>
          <span>
            <i style={{ width: 26 }} />
            <i style={{ width: 44 }} />
          </span>
          <span>
            <i style={{ width: `${width}%` }} />
            <i style={{ width: `${width - 18}%` }} />
            <i style={{ width: '38%' }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export interface QuickReviewRiskSectionProps {
  view: RiskView;
  /** The head commit under review. */
  head: string | null;
  /** Changed files the walk lists now: a citation of one opens there. */
  files: readonly string[] | null;
  /** One line on the review guide: written, or skipped and why. */
  guideNote?: string | null;
  onAssess: () => void;
  onOpenCitation?: (citation: RiskCitation) => void;
  onOpenFile?: (path: string) => void;
  onOpenOnGitHub?: (citation: RiskCitation) => void;
  /** A reason to open and bring into view, asked for from the walk; `at` makes a repeat count. */
  focus?: { id: string; at: number } | null;
  now?: number;
}

/**
 * The card's first section (design/risk-assessment/opus-mockup.html): the
 * level on a three-step scale with one sentence on what could break, the
 * reasons that raise and lower it with their cited lines, and what the
 * assessment read. Without an assessment for the head it says what is
 * happening, never Low; an older head's assessment shows marked stale.
 */
export function QuickReviewRiskSection({
  view,
  head,
  files,
  guideNote,
  onAssess,
  onOpenCitation,
  onOpenFile,
  onOpenOnGitHub,
  focus,
  now,
}: QuickReviewRiskSectionProps) {
  const assessment = shownAssessment(view);
  const stale = view.kind !== 'ready' && !!assessment;
  const [open, setOpen] = useState<ReadonlySet<string>>(() =>
    assessment?.level === 'high' && assessment.decidedBy
      ? new Set([assessment.decidedBy])
      : new Set(),
  );
  const fileSet = new Set(files ?? []);
  const actions: CitationActions = { files: fileSet, onOpenCitation, onOpenOnGitHub };
  const idBase = useId();
  const sectionRef = useRef<HTMLElement>(null);

  function toggle(id: string) {
    setOpen((before) => {
      const next = new Set(before);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
  /** Opens a reason and moves to it: its title takes the focus. */
  function jump(id: string) {
    setOpen((before) => new Set([...before, id]));
    requestAnimationFrame(() => {
      const item = sectionRef.current?.querySelector<HTMLElement>(`[data-reason="${id}"]`);
      item?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      item?.querySelector<HTMLElement>('.qr-risk-reason__title')?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    if (!focus) return;
    setOpen((before) => new Set([...before, focus.id]));
    const frame = requestAnimationFrame(() => {
      const item = sectionRef.current?.querySelector<HTMLElement>(`[data-reason="${focus.id}"]`);
      item?.scrollIntoView?.({ block: 'nearest' });
      item?.querySelector<HTMLElement>('.qr-risk-reason__title')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  const provider =
    view.kind === 'waiting'
      ? 'claude'
      : view.kind === 'ready'
        ? view.assessment.provider
        : view.provider;
  const agent = agentName(provider);
  const level: RiskLevel | null = assessment?.level ?? null;
  const tone = level ?? 'none';
  const guide = guideNote ? (
    <span>
      <BookOpenText {...SMALL} />
      {guideNote}
    </span>
  ) : null;

  let word: ReactNode;
  let main: ReactNode;
  let provenance: ReactNode;
  if (assessment) {
    word = (
      <>
        <LevelIcon level={assessment.level} size={18} />
        {WORD[assessment.level]}
      </>
    );
    main = (
      <>
        <p className="qr-risk__headline">{assessment.headline}</p>
        <p className="qr-risk__decided">
          {assessment.level === 'unknown' ? (
            'Unknown until more of it is read. Below is what it saw so far.'
          ) : assessment.decidedBy ? (
            <>
              Its highest reason sets the level:{' '}
              <button
                type="button"
                className="qr-risk-link"
                onClick={() => jump(assessment.decidedBy!)}
              >
                {assessment.decidedBy}
              </button>
              .
            </>
          ) : assessment.reasons.length ? (
            `${assessment.reasons.map((r) => r.id).join(' and ')} ${assessment.reasons.length === 1 ? 'keeps' : 'keep'} it down; nothing raises it.`
          ) : (
            'Nothing it read raises it.'
          )}
        </p>
      </>
    );
    provenance = (
      <>
        <span>
          <GitCommitHorizontal {...SMALL} />
          {stale ? 'Assessed ' : ''}
          <code>{short(assessment.headSha)}</code>
          <span className="qr-risk-fresh" data-fresh={stale ? 'behind' : 'current'}>
            {stale ? 'older commit' : 'Current head'}
          </span>
        </span>
        {stale && head && (
          <span>
            Head <code>{short(head)}</code>
          </span>
        )}
        <span>
          <Clock {...SMALL} />
          {formatAgo(assessment.createdAt, now)}
        </span>
        <span>{byline(assessment)}</span>
        {guide}
      </>
    );
  } else if (view.kind === 'assessing') {
    word = (
      <>
        <LoaderCircle size={18} strokeWidth={2.25} aria-hidden="true" className="qr-spin" />
        Assessing
      </>
    );
    main = (
      <p className="qr-risk__headline qr-risk__headline--quiet">
        {view.startedAt === null
          ? `Waiting for another assessment to finish. Then ${agent} reads the diff and the code it calls.`
          : `${agent} is reading the diff and the code it calls. It cites a line for every reason. You can start the walk meanwhile.`}
      </p>
    );
    provenance = (
      <>
        {head && (
          <span>
            <GitCommitHorizontal {...SMALL} />
            <code>{short(head)}</code>
            <span className="qr-risk-fresh" data-fresh="busy">
              Head
            </span>
          </span>
        )}
        {view.startedAt !== null && (
          <span>
            <Clock {...SMALL} />
            Started {formatAgo(new Date(view.startedAt).toISOString(), now)}
          </span>
        )}
        <span>{agent}</span>
        {guide}
      </>
    );
  } else {
    word = 'Not assessed';
    main =
      view.kind === 'failed' ? (
        <p className="qr-risk__headline qr-risk__headline--quiet">
          No assessment for this commit. Not assessed is not Low.
        </p>
      ) : view.kind === 'idle' ? (
        <>
          <p className="qr-risk__headline qr-risk__headline--quiet">
            {view.paused
              ? `The last assessment failed (${view.paused}), so new ones wait for a click for a few minutes.`
              : `${agent} can read the diff and the code it calls, and say what could break, with a line for every reason.`}
          </p>
          <div className="qr-risk__cta">
            <Button variant="secondary" size="sm" onClick={onAssess}>
              Assess risk
            </Button>
          </div>
        </>
      ) : (
        <p className="qr-risk__headline qr-risk__headline--quiet">
          Waiting for the PR's files. Not assessed is not Low.
        </p>
      );
    provenance =
      head || guide ? (
        <>
          {head && (
            <span>
              <GitCommitHorizontal {...SMALL} />
              <code>{short(head)}</code>
            </span>
          )}
          {view.kind === 'failed' && (
            <span>
              <Clock {...SMALL} />
              Failed {formatAgo(new Date(view.failedAt).toISOString(), now)}
            </span>
          )}
          {view.kind !== 'waiting' && <span>{agent}</span>}
          {guide}
        </>
      ) : null;
  }

  let alert: ReactNode = null;
  if (view.kind === 'failed') {
    alert = (
      <div className="qr-risk-alert" data-tone="error" role="alert">
        <CircleX {...ICON} />
        <span>
          {stale ? 'No assessment of the head' : 'No assessment'}: {view.error}
        </span>
        <Button variant="secondary" size="sm" onClick={onAssess}>
          Try again
        </Button>
      </div>
    );
  }
  const staleAlert =
    stale && assessment ? (
      <div className="qr-risk-alert" data-tone="warning">
        <TriangleAlert {...ICON} />
        <span>
          The head moved since this assessment. The level and reasons below are for{' '}
          <code>{short(assessment.headSha)}</code>
          {head ? (
            <>
              , not <code>{short(head)}</code>
            </>
          ) : null}
          , and the lines they cite may have moved.
          {view.kind === 'assessing' && ` ${agent} is assessing the head now.`}
        </span>
        {view.kind === 'idle' && (
          <Button variant="secondary" size="sm" onClick={onAssess}>
            Assess head
          </Button>
        )}
        {view.kind === 'assessing' && <LoaderCircle {...ICON} className="qr-spin" />}
      </div>
    ) : null;
  const unknownAlert =
    assessment?.level === 'unknown' ? (
      <div className="qr-risk-alert" data-tone="neutral">
        <CircleHelp {...ICON} />
        <span>
          <b>Why unknown.</b> {assessment.unknownWhy} Unknown is not Low: review it as unassessed,
          or split the PR.
        </span>
      </div>
    ) : null;

  return (
    <section
      ref={sectionRef}
      className="qr-overview-section qr-risk"
      aria-label="Regression risk"
      data-risk-state={view.kind}
    >
      <h3 className="qr-risk__h3">
        Regression risk
        {view.kind === 'ready' && (
          <Button
            variant="ghost"
            size="sm"
            leading={<RefreshCw {...SMALL} />}
            title="Assess this commit again"
            onClick={onAssess}
          >
            Assess again
          </Button>
        )}
      </h3>
      <div className="qr-risk__verdict" data-tone={tone} data-stale={stale || undefined}>
        <div className="qr-risk__level">
          <div>
            <p className="qr-risk__word">{word}</p>
            {stale && assessment && (
              <span className="qr-risk__sub">
                for <code>{short(assessment.headSha)}</code>, not the head
              </span>
            )}
          </div>
          <Scale level={level} />
        </div>
        <div className="qr-risk__main" aria-live="polite">
          {main}
        </div>
        {provenance && <div className="qr-risk__prov">{provenance}</div>}
      </div>
      {alert}
      {staleAlert}
      {unknownAlert}
      {view.kind === 'assessing' && !assessment && <Skeleton />}
      {assessment && (
        <>
          <Reasons
            assessment={assessment}
            open={open}
            onToggle={toggle}
            actions={actions}
            idBase={idBase}
          />
          <Coverage assessment={assessment} onOpenFile={onOpenFile} files={fileSet} />
        </>
      )}
    </section>
  );
}

/** Reason tags for each changed file a reason cites, for the walk's tree. */
export function riskTagsByPath(assessment: RiskAssessment | null): Map<string, RiskReason[]> {
  const map = new Map<string, RiskReason[]>();
  if (!assessment) return map;
  for (const [path, list] of citationsByPath(assessment)) {
    map.set(path, [...new Map(list.map(({ reason }) => [reason.id, reason])).values()]);
  }
  return map;
}

export function RiskTreeTags({ reasons }: { reasons: readonly RiskReason[] }) {
  if (!reasons.length) return null;
  return (
    <span
      className="qr-risk-tags"
      role="img"
      aria-label={`Cited by ${reasons.map((r) => r.id).join(', ')}`}
    >
      {reasons.map((reason) => (
        <i key={reason.id} data-tone={toneOf(reason)}>
          {reason.id}
        </i>
      ))}
    </span>
  );
}

/**
 * Above the diff in the walk: each reason that cites this file and the lines
 * it cites, a warning when the assessment is for an older commit, and what
 * the assessment saw of a file it did not read in full.
 */
export function RiskFileStrip({
  assessment,
  path,
  stale,
  onShowReason,
}: {
  assessment: RiskAssessment;
  path: string;
  /** The assessment is for an older head than the diff shown. */
  stale: boolean;
  onShowReason?: (id: string) => void;
}) {
  const cites = citationsByPath(assessment).get(path) ?? [];
  const byReason = new Map<string, { reason: RiskReason; lines: string[] }>();
  for (const { reason, citation } of cites) {
    const entry = byReason.get(reason.id) ?? { reason, lines: [] };
    const range =
      citation.from === citation.to ? `${citation.from}` : `${citation.from}–${citation.to}`;
    const label =
      citation.where === 'diff' && citation.side === 'old' ? `${range} (removed)` : range;
    if (!entry.lines.includes(label)) entry.lines.push(label);
    byReason.set(reason.id, entry);
  }
  const coverage = assessment.files.find((f) => f.path === path);
  const strips: ReactNode[] = [];
  if (stale && byReason.size)
    strips.push(
      <div key="stale" className="qr-risk-strip" data-tone="warning">
        <TriangleAlert {...ICON} />
        <p>
          <b>Assessed at {short(assessment.headSha)}.</b> This diff is newer; the cited lines may
          have moved.
        </p>
      </div>,
    );
  for (const { reason, lines } of byReason.values()) {
    strips.push(
      <div key={reason.id} className="qr-risk-strip" data-tone={toneOf(reason)}>
        {reason.effect === 'lowers' ? <ArrowDown {...ICON} /> : <TriangleAlert {...ICON} />}
        <p>
          <b>
            {reason.id} ·{' '}
            {reason.effect === 'lowers' ? 'Lowers' : WORD[reason.severity ?? 'medium']}
          </b>{' '}
          {onShowReason ? (
            <button type="button" className="qr-risk-link" onClick={() => onShowReason(reason.id)}>
              {reason.title}
            </button>
          ) : (
            reason.title
          )}
          <em>Lines</em>
          {lines.join(', ')}
        </p>
      </div>,
    );
  }
  if (!byReason.size && coverage && coverage.read !== 'full')
    strips.push(
      <div key="read" className="qr-risk-strip" data-tone="none">
        <Eye {...ICON} />
        <p>
          {coverage.read === 'name' ? (
            <>
              <b>Risk: read by name only.</b> The assessment didn't see what changed here
              {coverage.nameOnly === 'generated'
                ? ' (generated)'
                : coverage.nameOnly === 'skipped'
                  ? ' (skipped by your settings)'
                  : ''}
              .
            </>
          ) : (
            <>
              <b>Risk: cut at the prompt budget.</b> The assessment saw {coverage.shown} of{' '}
              {coverage.lines} diff lines here.
            </>
          )}
        </p>
      </div>,
    );
  if (!strips.length) return null;
  return (
    <div className="qr-risk-strips" data-quick-review-risk="">
      {strips}
    </div>
  );
}

/** Under a diff line: the reasons whose cited lines end here. */
export function RiskLineMark({ reasons }: { reasons: readonly RiskReason[] }) {
  return (
    <div className="qr-risk-linemark" data-tone={reasons[0] ? toneOf(reasons[0]) : undefined}>
      {reasons.map((reason) => (
        <span key={reason.id}>
          <b data-tone={toneOf(reason)}>{reason.id}</b>
          {reason.title}
        </span>
      ))}
    </div>
  );
}
