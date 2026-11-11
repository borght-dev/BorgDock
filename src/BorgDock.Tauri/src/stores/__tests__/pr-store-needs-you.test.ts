import { beforeEach, describe, expect, it } from 'vitest';
import { FIXTURE_ME, workbenchPrs } from '@/components/pr/__fixtures__/pr-list-data';
import { DEFAULT_DISPLAY } from '@/services/pr-list/display';
import { buildFacts, buildPrListModel } from '@/services/pr-list/model';
import { usePrStore } from '../pr-store';

const NOW = Date.parse('2026-09-25T12:00:00Z');

describe('pr-store: the Workbench "Needs you" count', () => {
  beforeEach(() => {
    usePrStore.setState({
      pullRequests: workbenchPrs(NOW),
      closedPullRequests: [],
      filter: 'all',
      searchQuery: '',
      hideFailing: false,
      username: FIXTURE_ME,
      teams: [],
    });
  });

  it('counts needsYou next to the existing filters', () => {
    const counts = usePrStore.getState().counts();
    expect(counts.all).toBe(18);
    expect(counts.needsYou).toBe(6);
    expect(counts.mine).toBe(6);
    expect(counts.failing).toBe(2);
    // "Needs review" is only the review requests.
    expect(counts.needsReview).toBe(4);
  });
});

describe('the "Your turn" tab on the Workbench fixture', () => {
  const facts = buildFacts({
    prs: workbenchPrs(NOW),
    username: FIXTURE_ME,
    teams: [],
    now: NOW,
    staleAfterDays: 7,
    ciOf: () => null,
  });
  const model = buildPrListModel({
    facts,
    username: FIXTURE_ME,
    now: NOW,
    view: 'needsYou',
    query: '',
    hideFailing: false,
    relatedKeys: null,
    display: DEFAULT_DISPLAY,
  });

  it('lists the PRs that need me', () => {
    const numbers = model.rows.map((f) => f.pr.pullRequest.number).sort((a, b) => a - b);
    expect(numbers).toEqual([86, 88, 458, 471, 479, 3668]);
  });

  it('counts what it lists', () => {
    expect(model.counts.needsYou).toBe(model.rows.length);
  });
});
