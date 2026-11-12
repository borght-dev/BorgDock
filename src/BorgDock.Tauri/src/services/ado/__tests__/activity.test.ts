import { describe, expect, it } from 'vitest';
import {
  activityComments,
  activityUpdates,
  localAt,
  SAMPLE_PROOF,
} from '@/components/work-items/__fixtures__/activity-data';
import type { WorkItemComment } from '@/types';
import { buildActivity, dateRange, shortHash, toActivityLink } from '../activity';

/** Thu 12 Nov 2026, 15:00 local time. */
const NOW = new Date(2026, 10, 12, 15, 0).getTime();

function events(activity: ReturnType<typeof buildActivity>) {
  return activity.days.flatMap((d) => d.events);
}

describe('buildActivity', () => {
  const updates = activityUpdates(NOW);
  const comments = activityComments(NOW);

  it('lists events newest first, grouped by local day', () => {
    const activity = buildActivity(updates, comments, { now: NOW });
    expect(activity.days.map((d) => d.label)).toEqual(['Today', 'Sat 7 Nov', 'Thu 5 Nov']);
    expect(events(activity).map((e) => e.kind)).toEqual([
      'state',
      'link',
      'agentRun',
      'state',
      'fields',
      'comment',
      'link',
      'fields',
      'created',
    ]);
  });

  it('labels yesterday and days of another year', () => {
    const yesterday = buildActivity(
      [],
      [
        {
          id: 1,
          text: 'hi',
          createdBy: { displayName: 'Dana Reyes' },
          createdDate: localAt(NOW, 1, 9, 0),
          modifiedDate: localAt(NOW, 1, 9, 0),
        },
        {
          id: 2,
          text: 'old',
          createdBy: { displayName: 'Dana Reyes' },
          createdDate: new Date(2025, 11, 30, 9, 0).toISOString(),
          modifiedDate: new Date(2025, 11, 30, 9, 0).toISOString(),
        },
      ],
      { now: NOW },
    );
    expect(yesterday.days.map((d) => d.label)).toEqual(['Yesterday', 'Tue 30 Dec 2025']);
  });

  it('adds nothing when the same updates and comments arrive twice', () => {
    const once = buildActivity(updates, comments, { now: NOW });
    const twice = buildActivity([...updates, ...updates], [...comments, ...comments], {
      now: NOW,
    });
    expect(twice).toEqual(once);
  });

  it('turns a state change into old → new and skips noise fields', () => {
    const activity = buildActivity(updates, [], { now: NOW });
    const state = events(activity).find((e) => e.kind === 'state');
    expect(state).toMatchObject({ from: 'Development In Progress', to: 'Code Review' });
    // The update that only moved StateChangeDate and ChangedDate adds no field row.
    const fieldRows = events(activity).filter((e) => e.kind === 'fields');
    expect(fieldRows).toHaveLength(2);
  });

  it('diffs tags and field values', () => {
    const activity = buildActivity(updates, [], { now: NOW });
    const severity = events(activity).find(
      (e) => e.kind === 'fields' && e.changes.some((c) => c.label === 'Severity'),
    );
    expect(severity).toMatchObject({
      author: 'Dana Reyes',
      changes: [{ label: 'Severity', from: '3 - Low', to: '2 - Not Critical' }],
      tagsAdded: ['northwind'],
      tagsRemoved: [],
    });
    const assigned = events(activity).find(
      (e) => e.kind === 'fields' && e.changes.some((c) => c.label === 'Assigned to'),
    );
    expect(assigned).toMatchObject({ changes: [{ label: 'Assigned to', from: null, to: 'Vera' }] });
  });

  it('marks long text as edited without values', () => {
    const activity = buildActivity(
      [
        {
          id: 9,
          rev: 9,
          revisedBy: { displayName: 'Dana Reyes' },
          revisedDate: localAt(NOW, 0, 10, 0),
          fields: {
            'System.Description': { oldValue: '<p>a</p>', newValue: '<p>b</p>' },
            'Microsoft.VSTS.Common.Priority': { oldValue: 3, newValue: 2 },
            'System.IterationPath': {
              oldValue: 'Acme\\Release 5.2.9',
              newValue: 'Acme\\Release 5.2.10',
            },
          },
        },
      ],
      [],
      { now: NOW },
    );
    expect(events(activity)[0]).toMatchObject({
      changes: [
        { label: 'Description', edited: true, from: null, to: null },
        { label: 'Priority', from: 'P3', to: 'P2' },
        { label: 'Iteration', from: 'Release 5.2.9', to: 'Release 5.2.10' },
      ],
    });
  });

  it('reads pull request and work item links', () => {
    expect(
      toActivityLink(
        {
          rel: 'ArtifactLink',
          url: 'vstfs:///GitHub/PullRequest/0c3a1f2e-7b4d%2F812',
          attributes: {},
        },
        false,
      ),
    ).toMatchObject({ kind: 'pr', number: 812, removed: false });
    expect(
      toActivityLink(
        {
          rel: 'ArtifactLink',
          url: 'vstfs:///Git/PullRequestId/proj%2Frepo%2F77',
          attributes: { comment: 'Price list API' },
        },
        true,
      ),
    ).toMatchObject({ kind: 'pr', number: 77, detail: 'Price list API', removed: true });
    expect(
      toActivityLink(
        {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: 'https://dev.azure.com/acme/_apis/wit/workItems/3980',
          attributes: {},
        },
        false,
      ),
    ).toMatchObject({ kind: 'item', label: 'parent', number: 3980 });
  });

  it("folds an agent's consecutive steps into one run, newest first", () => {
    const activity = buildActivity([], comments, { now: NOW });
    const run = events(activity).find((e) => e.kind === 'agentRun');
    expect(run?.kind).toBe('agentRun');
    if (run?.kind !== 'agentRun') return;
    expect(run.author).toBe('Vera');
    expect(run.steps.map((s) => s.kind)).toEqual([
      'pr',
      'tests',
      'dev',
      'plan-verify',
      'plan-verify',
      'plan',
      'plan',
    ]);
    expect(run.since).toBe(localAt(NOW, 6, 8, 0));
    expect(activity.agentName).toBe('Vera');
    expect(activity.counts).toEqual({ all: 8, comments: 1, changes: 0, agent: 7 });
  });

  it('splits a run where someone else comments', () => {
    const between: WorkItemComment = {
      id: 150,
      text: '<p>Please also check the legacy export.</p>',
      createdBy: { displayName: 'Dana Reyes' },
      createdDate: localAt(NOW, 4, 12, 0),
      modifiedDate: localAt(NOW, 4, 12, 0),
    };
    const activity = buildActivity([], [...comments, between], { now: NOW });
    const runs = events(activity).filter((e) => e.kind === 'agentRun');
    expect(runs.map((r) => (r.kind === 'agentRun' ? r.steps.length : 0))).toEqual([2, 5]);
  });

  it('shows each step on its own when runs are not folded', () => {
    const activity = buildActivity([], comments, { now: NOW, foldAgentRuns: false });
    expect(events(activity).filter((e) => e.kind === 'agentRun')).toHaveLength(7);
  });

  it('takes proofs out of the text and keeps them whole for copying', () => {
    const activity = buildActivity([], comments, { now: NOW });
    const run = events(activity).find((e) => e.kind === 'agentRun');
    if (run?.kind !== 'agentRun') throw new Error('no run');
    const repair = run.steps.find((s) => s.summary.startsWith('GATE-REPAIR'));
    expect(repair).toMatchObject({
      warn: true,
      proofs: [{ label: 'proof', value: SAMPLE_PROOF }],
      summary: 'GATE-REPAIR — Mechanical citation repair only; no semantic gaps found.',
    });
    // The detail is what the summary leaves out.
    expect(repair?.detail.startsWith('The "What exists today" row cites')).toBe(true);
    expect(repair?.detail).not.toContain(SAMPLE_PROOF.slice(0, 12));
    expect(run.steps.find((s) => s.kind === 'pr')?.warn).toBe(false);
    expect(shortHash(SAMPLE_PROOF)).toBe('481c5a2a…172bbbb');
  });

  it('labels each proof with the key it was written with', () => {
    const hex = 'd30fe005e55cc452e35996576e6923b5426d16bd2714b883147adcf2ab78d44a';
    const activity = buildActivity(
      [],
      [
        {
          id: 1,
          text: `Vera · plan — Approved pair SHA-256: html=${hex} md=${hex.replace('d3', 'e4')}`,
          createdBy: { displayName: 'Vera' },
          createdDate: localAt(NOW, 0, 9, 0),
          modifiedDate: localAt(NOW, 0, 9, 0),
        },
      ],
      { now: NOW },
    );
    const run = events(activity)[0];
    if (run?.kind !== 'agentRun') throw new Error('no run');
    expect(run.steps[0]!.proofs.map((p) => p.label)).toEqual(['html', 'md']);
    expect(run.steps[0]!.summary).toBe('Approved pair SHA-256:');
  });

  it('filters by kind and keeps the counts of everything', () => {
    const all = buildActivity(updates, comments, { now: NOW });
    const changes = buildActivity(updates, comments, { now: NOW, filter: 'changes' });
    expect(
      events(changes).every((e) => ['state', 'fields', 'link', 'created'].includes(e.kind)),
    ).toBe(true);
    expect(changes.counts).toEqual(all.counts);
    expect(events(buildActivity(updates, comments, { now: NOW, filter: 'comments' }))).toHaveLength(
      1,
    );
    expect(all.counts).toEqual({ all: 15, comments: 1, changes: 7, agent: 7 });
  });
});

describe('dateRange', () => {
  it('shares the month when it can', () => {
    expect(dateRange(localAt(NOW, 5, 9, 0), localAt(NOW, 0, 9, 0), NOW)).toBe('7 – 12 Nov');
    expect(
      dateRange(new Date(2026, 9, 30).toISOString(), new Date(2026, 10, 2).toISOString(), NOW),
    ).toBe('30 Oct – 2 Nov');
    expect(dateRange(localAt(NOW, 0, 8, 0), localAt(NOW, 0, 9, 0), NOW)).toBe('12 Nov');
  });
});
