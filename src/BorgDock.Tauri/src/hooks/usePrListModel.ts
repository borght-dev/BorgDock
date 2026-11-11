import { useMemo } from 'react';
import { jobIndexOf, prCiLens } from '@/services/ci-failures/lens';
import type { CiGroupSummary } from '@/services/ci-failures/types';
import { staleAfterDaysOf } from '@/services/focus-bucket';
import type { PrDisplay } from '@/services/pr-list/display';
import type { PrCiFacts, PrFacts } from '@/services/pr-list/facts';
import {
  buildFacts,
  buildPrListModel,
  type PrListModel,
  type PrViewKey,
} from '@/services/pr-list/model';
import { type PriorityScore, prScoreKey } from '@/services/priority-scoring';
import { blockedOf, useCiFailuresStore } from '@/stores/ci-failures-store';
import { usePrStore } from '@/stores/pr-store';
import { usePrViewStore } from '@/stores/pr-view-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestWithChecks } from '@/types';
import { minuteNow } from '@/utils/relative-time';

/** The CI failure store's view of each red PR, for `PrFacts.ci`. */
function ciLookup(
  groups: readonly CiGroupSummary[],
  prs: readonly PullRequestWithChecks[],
): (pr: PullRequestWithChecks) => PrCiFacts | null {
  if (groups.length === 0) return () => null;
  const index = jobIndexOf(groups);
  const { counts } = blockedOf(groups, prs);
  return (pr) => {
    const lens = prCiLens(pr, index, counts);
    return lens ? { blocked: lens.blockedCount, outside: lens.outsideCause !== null } : null;
  };
}

function focusScoreOf(scores: Map<string, PriorityScore>) {
  return (f: PrFacts) => scores.get(prScoreKey(f.pr.pullRequest))?.total ?? 0;
}

/**
 * The Pull requests list as data (`buildPrListModel`) for the stores' state
 * now. Rebuilt when a poll, the CI failures, the view tab, the query or the
 * display change, and once a minute for ages and staleness.
 */
export function usePrListModel(now: number = minuteNow()): PrListModel & { facts: PrFacts[] } {
  const prs = usePrStore((s) => s.pullRequests);
  const username = usePrStore((s) => s.username);
  const teams = usePrStore((s) => s.teams);
  const filter = usePrStore((s) => s.filter);
  const query = usePrStore((s) => s.searchQuery);
  const hideFailing = usePrStore((s) => s.hideFailing);
  const related = usePrStore((s) => s.relatedFailure);
  const scores = usePrStore((s) => s.priorityScores());
  const ciGroups = useCiFailuresStore((s) => s.groups);
  const staleSetting = useSettingsStore((s) => s.settings.ui?.staleAfterDays);
  const display = usePrViewStore((s) => s.display);
  const savedViews = usePrViewStore((s) => s.savedViews);
  const staleAfterDays = staleAfterDaysOf(staleSetting);

  const facts = useMemo(
    () =>
      buildFacts({
        prs,
        username,
        teams,
        now,
        staleAfterDays,
        ciOf: ciLookup(ciGroups, prs),
      }),
    [prs, username, teams, now, staleAfterDays, ciGroups],
  );

  const model = useMemo(
    () =>
      buildPrListModel({
        facts,
        username,
        now,
        view: filter,
        query,
        hideFailing,
        relatedKeys: related ? new Set(related.prKeys) : null,
        display,
        focusScore: focusScoreOf(scores),
        savedViews,
      }),
    [facts, username, now, filter, query, hideFailing, related, display, scores, savedViews],
  );
  return { ...model, facts };
}

/** What a pending change will set, for predicting the rows it leaves (FLIP). */
export interface PrListOverrides {
  view?: PrViewKey;
  query?: string;
  hideFailing?: boolean;
  display?: PrDisplay;
}

/**
 * The same model from the stores' current state, outside React (keyboard
 * navigation), optionally with a change applied that the stores do not
 * have yet.
 */
export function readPrListModel(
  overrides: PrListOverrides = {},
  now: number = minuteNow(),
): PrListModel {
  const pr = usePrStore.getState();
  const view = usePrViewStore.getState();
  const facts = buildFacts({
    prs: pr.pullRequests,
    username: pr.username,
    teams: pr.teams,
    now,
    staleAfterDays: staleAfterDaysOf(useSettingsStore.getState().settings.ui?.staleAfterDays),
    ciOf: ciLookup(useCiFailuresStore.getState().groups, pr.pullRequests),
  });
  return buildPrListModel({
    facts,
    username: pr.username,
    now,
    view: overrides.view ?? pr.filter,
    query: overrides.query ?? pr.searchQuery,
    hideFailing: overrides.hideFailing ?? pr.hideFailing,
    relatedKeys: pr.relatedFailure ? new Set(pr.relatedFailure.prKeys) : null,
    display: overrides.display ?? view.display,
    focusScore: focusScoreOf(pr.priorityScores()),
    savedViews: view.savedViews,
  });
}
