import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  LOW_ANSWER,
  REFUND_ANSWER,
  REFUND_FILES,
  REFUND_HEAD,
  REFUND_NEXT_HEAD,
  refundAssessment,
  UNKNOWN_ANSWER,
} from '../__fixtures__/quick-review-risk';
import {
  QuickReviewRiskSection,
  type QuickReviewRiskSectionProps,
  RiskFileStrip,
  RiskPill,
} from '../QuickReviewRisk';

const PATHS = REFUND_FILES.map((f) => f.filename);

function section(
  props: Partial<QuickReviewRiskSectionProps> & Pick<QuickReviewRiskSectionProps, 'view'>,
) {
  const handlers = {
    onAssess: vi.fn(),
    onOpenCitation: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenOnGitHub: vi.fn(),
  };
  render(<QuickReviewRiskSection head={REFUND_HEAD} files={PATHS} {...handlers} {...props} />);
  return handlers;
}

const risk = () => screen.getByRole('region', { name: 'Regression risk' });

describe('QuickReviewRiskSection', () => {
  it('shows the level, its sentence and which reason sets it, with the deciding evidence open', () => {
    section({ view: { kind: 'ready', assessment: refundAssessment() } });
    expect(risk()).toHaveTextContent('High');
    expect(risk()).toHaveTextContent('A refund that names a cancelled line pays it out in full');
    expect(risk()).toHaveTextContent('Its highest reason sets the level: R1.');
    expect(risk()).toHaveTextContent('Current head');
    expect(risk()).toHaveTextContent('Claude · sonnet');
    const r1 = screen.getByRole('button', { name: 'Refunds on orders with a cancelled line' });
    expect(r1).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('It pays out money, on a path no test covers.')).toBeVisible();
    const r2 = screen.getByRole('button', {
      name: 'Shipping refunds split over three or more lines',
    });
    expect(r2).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a reason to its code evidence and the walk at a cited line', () => {
    const { onOpenCitation } = section({ view: { kind: 'ready', assessment: refundAssessment() } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Shipping refunds split over three or more lines' }),
    );
    const evidence = document.getElementById(
      screen
        .getByRole('button', { name: 'Shipping refunds split over three or more lines' })
        .getAttribute('aria-controls')!,
    )!;
    expect(evidence).toHaveTextContent(
      'const perLine = Math.round(order.shippingTotal.cents / shipped.length);',
    );
    fireEvent.click(within(evidence).getAllByRole('button', { name: /Open in walk/ })[0]!);
    expect(onOpenCitation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: 'diff',
        path: 'src/refunds/allocate-shipping.ts',
        from: 7,
        to: 9,
      }),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'calculate.ts:139–141' })[0]!);
    expect(onOpenCitation).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: 'src/refunds/calculate.ts', side: 'new', from: 139 }),
    );
  });

  it('marks citations outside the diff and opens them on GitHub, not in the walk', () => {
    const { onOpenCitation, onOpenOnGitHub } = section({
      view: { kind: 'ready', assessment: refundAssessment() },
    });
    const outside = screen.getByRole('button', { name: /refundable-lines\.ts:12/ });
    expect(outside).toHaveAttribute('data-where', 'file');
    fireEvent.click(outside);
    expect(onOpenCitation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'GitHub' }));
    expect(onOpenOnGitHub).toHaveBeenCalledWith(
      expect.objectContaining({ where: 'file', path: 'src/refunds/refundable-lines.ts' }),
    );
  });

  it('says what it read, file by file, and what it did not do', () => {
    const { onOpenFile } = section({ view: { kind: 'ready', assessment: refundAssessment() } });
    const coverage = screen.getByRole('region', { name: 'What the assessment read' });
    expect(coverage).toHaveTextContent('pnpm-lock.yaml by name only, as a generated file.');
    expect(coverage).toHaveTextContent('BorgDock gave it no test results, build output or CI logs');
    expect(coverage).toHaveTextContent('refundable-lines.ts');
    fireEvent.click(within(coverage).getByTitle(/^src\/api\/refunds\.controller\.ts/));
    expect(onOpenFile).toHaveBeenCalledWith('src/api/refunds.controller.ts');
  });

  it('is Low without a reason that raises it', () => {
    section({ view: { kind: 'ready', assessment: refundAssessment({ answer: LOW_ANSWER }) } });
    expect(risk()).toHaveTextContent('Low');
    expect(risk()).toHaveTextContent('Nothing found that could break.');
    expect(risk()).toHaveTextContent('L1 and L2 keep it down; nothing raises it.');
  });

  it('jumps to the reason that sets the level', async () => {
    const medium = { ...REFUND_ANSWER, reasons: [REFUND_ANSWER.reasons[0]!] };
    section({ view: { kind: 'ready', assessment: refundAssessment({ answer: medium }) } });
    const title = screen.getByRole('button', {
      name: 'Shipping refunds split over three or more lines',
    });
    expect(title).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'R1' }));
    expect(title).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(title).toHaveFocus());
  });

  it('calls Unknown not Low, and says why', () => {
    section({ view: { kind: 'ready', assessment: refundAssessment({ answer: UNKNOWN_ANSWER }) } });
    expect(risk()).toHaveTextContent('Unknown');
    expect(risk()).toHaveTextContent('Why unknown.');
    expect(risk()).toHaveTextContent('Unknown is not Low');
    expect(risk()).toHaveTextContent('Seen in what it read');
    expect(risk()).toHaveTextContent('Not a verdict');
  });

  it('offers to assess when nothing is assessed, and never says Low', () => {
    const { onAssess } = section({ view: { kind: 'idle', provider: 'codex', previous: null } });
    expect(risk()).toHaveTextContent('Not assessed');
    expect(risk()).toHaveTextContent('Codex can read the diff');
    expect(risk()).not.toHaveTextContent(/\bLow\b(?! *Medium)/);
    fireEvent.click(screen.getByRole('button', { name: 'Assess risk' }));
    expect(onAssess).toHaveBeenCalledOnce();
  });

  it('shows progress while assessing', () => {
    section({
      view: { kind: 'assessing', provider: 'claude', startedAt: Date.now(), previous: null },
    });
    expect(risk()).toHaveTextContent('Assessing');
    expect(risk()).toHaveTextContent('You can start the walk meanwhile.');
    expect(document.querySelector('.qr-risk-skel')).not.toBeNull();
  });

  it('says why it failed and offers to try again', () => {
    const { onAssess } = section({
      view: {
        kind: 'failed',
        provider: 'claude',
        error: 'usage limit reached',
        failedAt: Date.now(),
        previous: null,
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('No assessment: usage limit reached');
    expect(risk()).toHaveTextContent('Not assessed is not Low.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onAssess).toHaveBeenCalledOnce();
  });

  it("marks an older head's assessment stale and offers the head", () => {
    const { onAssess } = section({
      head: REFUND_NEXT_HEAD,
      view: { kind: 'idle', provider: 'claude', previous: refundAssessment() },
    });
    expect(risk()).toHaveTextContent('for 9c41e7a, not the head');
    expect(risk()).toHaveTextContent('The head moved since this assessment.');
    expect(risk()).toHaveTextContent('older commit');
    expect(document.querySelector('.qr-risk__verdict')).toHaveAttribute('data-stale', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Assess head' }));
    expect(onAssess).toHaveBeenCalledOnce();
  });

  it('says a guide was skipped but risk is assessed anyway', () => {
    section({
      view: { kind: 'ready', assessment: refundAssessment() },
      guideNote: 'No guide (a dependency update). Risk is assessed anyway.',
    });
    expect(risk()).toHaveTextContent('No guide (a dependency update). Risk is assessed anyway.');
  });
});

describe('RiskPill', () => {
  it('names the level, the older commit, or that there is none', () => {
    const { rerender } = render(
      <RiskPill view={{ kind: 'ready', assessment: refundAssessment() }} />,
    );
    expect(screen.getByText('High risk')).toBeInTheDocument();
    rerender(
      <RiskPill view={{ kind: 'idle', provider: 'claude', previous: refundAssessment() }} />,
    );
    expect(screen.getByText(/High risk/)).toHaveTextContent('High risk · older commit');
    rerender(<RiskPill view={{ kind: 'idle', provider: 'claude', previous: null }} />);
    expect(screen.getByText('Risk not assessed')).toBeInTheDocument();
    rerender(
      <RiskPill view={{ kind: 'assessing', provider: 'claude', startedAt: 1, previous: null }} />,
    );
    expect(screen.getByText('Assessing risk')).toBeInTheDocument();
    rerender(
      <RiskPill
        view={{ kind: 'ready', assessment: refundAssessment({ answer: UNKNOWN_ANSWER }) }}
      />,
    );
    expect(screen.getByText('Risk unknown')).toBeInTheDocument();
  });
});

describe('RiskFileStrip', () => {
  it('lists the reasons citing the file with their lines', () => {
    const onShowReason = vi.fn();
    render(
      <RiskFileStrip
        assessment={refundAssessment()}
        path="src/refunds/calculate.ts"
        stale={false}
        onShowReason={onShowReason}
      />,
    );
    const strip = document.querySelector('[data-quick-review-risk]')!;
    expect(strip).toHaveTextContent('R1 · High');
    expect(strip).toHaveTextContent('139–141, 138 (removed)');
    fireEvent.click(
      screen.getByRole('button', { name: 'Refunds on orders with a cancelled line' }),
    );
    expect(onShowReason).toHaveBeenCalledWith('R1');
  });

  it('warns that lines may have moved, and says when a file was read by name only', () => {
    const { rerender } = render(
      <RiskFileStrip assessment={refundAssessment()} path="src/refunds/calculate.ts" stale />,
    );
    expect(screen.getByText(/Assessed at 9c41e7a\./)).toBeInTheDocument();
    rerender(<RiskFileStrip assessment={refundAssessment()} path="pnpm-lock.yaml" stale={false} />);
    expect(document.querySelector('[data-quick-review-risk]')).toHaveTextContent(
      "Risk: read by name only. The assessment didn't see what changed here (generated).",
    );
    rerender(
      <RiskFileStrip
        assessment={refundAssessment()}
        path="src/refunds/allocate-shipping.ts"
        stale={false}
      />,
    );
    expect(document.querySelector('[data-quick-review-risk]')).toHaveTextContent('R2 · Medium');
  });
});
