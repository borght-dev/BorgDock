import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMembers, addOutcome } from '@/services/workstreams/edits';
import { refKey } from '@/services/workstreams/identity';
import { memoryStorage } from '@/services/workstreams/storage';
import { usePrStore } from '@/stores/pr-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useWorkstreamSourcesStore } from '@/stores/workstream-sources-store';
import {
  resetWorkstreamsStore,
  settleWrites,
  setWorkstreamStorage,
  useWorkstreamsStore,
} from '@/stores/workstreams-store';
import type { PullRequestWithChecks } from '@/types';
import { recomputeWorkstreams } from '../workstreams-sync';

vi.mock('@/utils/tauri-persist', () => ({
  persistToTauriStore: vi.fn(async () => {}),
  readFromTauriStore: vi.fn(async () => undefined),
}));

const PR = { kind: 'github-pr' as const, owner: 'acme', repo: 'shop', number: 12 };

function polledPr(state: 'open' | 'merged'): PullRequestWithChecks {
  return {
    pullRequest: {
      number: 12,
      title: 'Queue rewrite',
      headRef: 'feature',
      baseRef: 'master',
      authorLogin: 'ada',
      authorAvatarUrl: '',
      state: state === 'open' ? 'open' : 'closed',
      createdAt: '2026-10-20T00:00:00Z',
      updatedAt: '2026-10-26T00:00:00Z',
      isDraft: false,
      htmlUrl: 'https://github.com/acme/shop/pull/12',
      body: '',
      repoOwner: 'acme',
      repoName: 'shop',
      reviewStatus: 'approved',
      commentCount: 0,
      labels: [],
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      commitCount: 1,
      mergedAt: state === 'merged' ? '2026-10-26T10:00:00Z' : undefined,
      requestedReviewers: [],
    },
    overallStatus: 'green',
    failedCheckNames: [],
    failedCheckSuiteIds: [],
    pendingCheckNames: [],
    passedCount: 3,
    skippedCount: 0,
    totalCheckCount: 3,
  };
}

const original = useSettingsStore.getState().settings;

beforeEach(async () => {
  resetWorkstreamsStore();
  setWorkstreamStorage(memoryStorage());
  useSettingsStore.setState({
    hasLoaded: true,
    settings: {
      ...original,
      setupComplete: true,
      repos: [
        { owner: 'acme', name: 'shop', enabled: true, worktreeBasePath: '', worktreeSubfolder: '' },
      ],
    },
  });
  await useWorkstreamsStore.getState().load(null);
});

afterEach(async () => {
  await settleWrites();
  resetWorkstreamsStore();
  usePrStore.setState({ pullRequests: [], closedPullRequests: [], lastPollTime: null });
  useSettingsStore.setState({ settings: original, hasLoaded: false });
});

describe('recomputeWorkstreams', () => {
  it('verifies an outcome by rule once BorgDock sees the pull request merged', async () => {
    const store = useWorkstreamsStore.getState();
    const id = store.create('Checkout rewrite');
    store.edit(id, (d, c) =>
      addMembers(d, [{ ref: PR, label: 'Queue rewrite', role: 'primary' }], c),
    );
    store.edit(id, (d, c) =>
      addOutcome(
        d,
        'Queue merged',
        true,
        [{ kind: 'pr-merged', target: refKey(PR), value: 'master' }],
        c,
      ),
    );

    usePrStore.setState({
      pullRequests: [polledPr('open')],
      closedPullRequests: [],
      lastPollTime: new Date(),
    });
    recomputeWorkstreams();
    expect(useWorkstreamSourcesStore.getState().assessments[id]!.progress).toEqual({
      counted: 0,
      required: 1,
    });

    usePrStore.setState({
      pullRequests: [],
      closedPullRequests: [polledPr('merged')],
      lastPollTime: new Date(),
    });
    recomputeWorkstreams();
    const outcome = useWorkstreamsStore.getState().entries[id]!.document.outcomes[0]!;
    expect(outcome.verification).toMatchObject({
      state: 'verified',
      facts: [
        expect.objectContaining({ result: 'met', summary: 'acme/shop#12 merged into master' }),
      ],
    });
    expect(useWorkstreamsStore.getState().entries[id]!.document.log[0]!.kind).toBe(
      'outcome-verified',
    );
  });

  it('remembers what a live member looked like, for when it can not be read', () => {
    const store = useWorkstreamsStore.getState();
    const id = store.create('x');
    store.edit(id, (d, c) => addMembers(d, [{ ref: PR, label: '' }], c));
    usePrStore.setState({ pullRequests: [polledPr('open')], lastPollTime: new Date() });
    recomputeWorkstreams();
    expect(useWorkstreamSourcesStore.getState().cache[refKey(PR)]).toMatchObject({
      title: 'Queue rewrite',
      stateLabel: 'Approved',
    });
  });
});
