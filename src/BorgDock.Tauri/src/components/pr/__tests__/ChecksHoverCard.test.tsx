import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  failingPr,
  failingPrFailures,
  runningPr,
  sharedGroup,
} from '../__fixtures__/checks-card-data';
import { ChecksCardView } from '../ChecksHoverCard';
import { checksCardData } from '../checks-card-data';

afterEach(() => {
  cleanup();
});

function renderFailing() {
  const pr = failingPr();
  const group = sharedGroup();
  return render(
    <ChecksCardView
      pr={pr}
      data={checksCardData(pr, failingPrFailures(), true)}
      sharedOf={(jobId) => (jobId === 502 ? group : undefined)}
      actions={<button type="button">Rerun failed</button>}
    />,
  );
}

describe('ChecksCardView', () => {
  it('shows why a test failed: the test, the assertion, expected against received, where', () => {
    renderFailing();
    const job = screen
      .getByText('test (ubuntu-latest, node 22)')
      .closest('[data-check-failing]') as HTMLElement;
    expect(within(job).getByText('Run vitest')).toBeInTheDocument();
    expect(within(job).getByText(/3 failed, 412 passed/)).toBeInTheDocument();
    expect(
      within(job).getByText('PlanBoard › drag preview › clamps to the last lane'),
    ).toBeInTheDocument();
    expect(within(job).getByText('AssertionError: expected 412 to be 380')).toBeInTheDocument();
    expect(within(job).getByText('380')).toHaveAttribute('data-side', 'expected');
    expect(within(job).getByText('412')).toHaveAttribute('data-side', 'actual');
    expect(within(job).getByText('src/planboard/drag-preview.test.ts:88')).toBeInTheDocument();
    expect(within(job).getByText('Lane › scrolled › keeps offset')).toBeInTheDocument();
  });

  it('marks a failure master shares as not caused by the PR', () => {
    renderFailing();
    const job = screen.getByText('build-api').closest('[data-check-failing]') as HTMLElement;
    expect(within(job).getByText('CS0246')).toBeInTheDocument();
    expect(within(job).getByText('Not caused by this PR.')).toBeInTheDocument();
    expect(within(job).getByText(/also fails on master/)).toBeInTheDocument();
  });

  it('counts every kind and lists passed and skipped checks by name', () => {
    renderFailing();
    expect(screen.getByText('2 failing')).toBeInTheDocument();
    expect(screen.getByText('1 running')).toBeInTheDocument();
    expect(screen.getByText('14 passed')).toBeInTheDocument();
    expect(screen.getByText('3 skipped')).toBeInTheDocument();
    expect(screen.getByText('e2e (chromium)')).toBeInTheDocument();
    expect(screen.getByText('+8 more')).toBeInTheDocument();
    expect(screen.getByText('deploy-preview')).toBeInTheDocument();
    expect(screen.getByText('Rerun failed')).toBeInTheDocument();
  });

  it('shows a skeleton while the log is read, and a link when it has no reason', () => {
    const pr = failingPr();
    const { container } = render(
      <ChecksCardView
        pr={pr}
        data={checksCardData(pr, null, false)}
        sharedOf={() => undefined}
        actions={null}
      />,
    );
    expect(screen.getAllByText(/Related CI failures are off/)).toHaveLength(2);
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('leaves out the failing section when nothing failed', () => {
    const pr = runningPr();
    render(
      <ChecksCardView
        pr={pr}
        data={checksCardData(pr, null, true)}
        sharedOf={() => undefined}
        actions={null}
      />,
    );
    expect(screen.queryByRole('region', { name: 'Failing checks' })).toBeNull();
    expect(screen.getByText('SonarCloud Code Analysis')).toBeInTheDocument();
  });
});
