import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ToastViewport } from '@/components/shared/Toast';
import type { HeldPr } from '@/services/author-run';
import { useE2eStore } from '@/services/e2e/load';
import { RISK_PROMPT_TITLE } from '@/services/risk-assessment';
import { useLinkStore } from '@/stores/link-store';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useReviewGuideStore } from '@/stores/review-guide-store';
import { resetRiskAssessments } from '@/stores/risk-assessment-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestFileChange, RepoSettings } from '@/types';
import type { ClaudeReviewComment } from '@/types/claude-review';
import beforeDispatch from '../../../../../docs/whats-new/4.0.0/dispatch.png?inline';
import afterDispatch from '../../../../../docs/whats-new/4.0.1/dispatch-width.png?inline';
import { getControl } from '../../../.storybook/mocks/control';
import { LARGE_PR_BODY, LARGE_PR_FILES, LARGE_PR_TITLE } from './__fixtures__/quick-review-large';
import {
  NOISE_FILES,
  PLANBOARD_COMMITS,
  PLANBOARD_GUIDE,
  planboardCommitFiles,
} from './__fixtures__/quick-review-reading';
import {
  BUMP_ANSWER,
  BUMP_BODY,
  BUMP_FILES,
  BUMP_HEAD,
  BUMP_SOURCES,
  REFUND_ANSWER,
  REFUND_FILES,
  REFUND_GUIDE,
  REFUND_NEXT_HEAD,
  REFUND_SOURCES,
  refundAssessment,
  refundPr,
} from './__fixtures__/quick-review-risk';
import {
  PLANBOARD_BODY,
  PLANBOARD_FILES,
  PLANBOARD_HEAD,
  TIMESHEET_BODY,
  TIMESHEET_COMPARE,
  TIMESHEET_FILES,
  TIMESHEET_HEAD,
  TIMESHEET_REVIEWED,
} from './__fixtures__/quick-review-v2';
import { makePr } from './__tests__/helpers';
import { QuickReviewOverlay } from './QuickReviewOverlay';

function resetReviewDisplayPreferences() {
  for (const preference of [
    'fullscreen',
    'wrap-lines',
    'rich-diff',
    'split-diff',
    'context-open',
  ]) {
    localStorage.removeItem(`borgdock-quick-review-${preference}`);
  }
  // The design frames predate the review guide; the guide stories choose it themselves.
  localStorage.setItem('borgdock-quick-review-order', 'folders');
}

const files: PullRequestFileChange[] = [
  {
    filename: 'FSP.Application.Tests/Orders/SaveOrderHandlerTests.cs',
    status: 'added',
    sha: 'test',
    additions: 3,
    deletions: 0,
    patch:
      '@@ -0,0 +1,3 @@\n+[Fact]\n+public void Saving_does_not_approve()\n+    => Assert.False(Request().ApproveAfterSave);',
  },
  {
    filename: 'src/orders/SaveOrderRequest.cs',
    status: 'modified',
    sha: 'request',
    additions: 1,
    deletions: 0,
    patch:
      '@@ -10,3 +10,4 @@\n public sealed record SaveOrderRequest\n {\n+    public bool ApproveAfterSave { get; init; }\n }',
  },
  {
    filename: 'src/orders/SaveOrderHandler.cs',
    status: 'modified',
    sha: 'handler',
    additions: 8,
    deletions: 1,
    patch:
      '@@ -38,6 +38,13 @@\n public async Task<Result> Handle(SaveOrderRequest request)\n {\n     var order = await orders.Get(request.OrderId);\n+    if (request.ApproveAfterSave)\n+        await permissions.RequireApproval(order);\n+\n     await orders.Save(order);\n-    return Result.Success();\n+\n+    if (request.ApproveAfterSave)\n+        await approvals.Approve(order.Id);\n+\n+    return Result.Success(order.Id);\n }',
  },
  {
    filename: 'src/orders/OrderActions.test.tsx',
    status: 'added',
    sha: 'ui-tests',
    additions: 1,
    deletions: 0,
    patch: '@@ -0,0 +1 @@\n+expect(save).toHaveBeenCalledWith(true);',
  },
  {
    filename: 'docs/orders.md',
    status: 'modified',
    sha: 'docs',
    additions: 1,
    deletions: 1,
    patch:
      '@@ -1 +1 @@\n-Choose Save to store your changes.\n+Choose Save & Approve to save and approve in one step.',
  },
  {
    filename: 'src/orders/OrderActions.tsx',
    status: 'modified',
    sha: 'ui',
    additions: 4,
    deletions: 1,
    patch:
      '@@ -1,3 +1,6 @@\n return (\n-  <Button onClick={save}>Save</Button>\n+  <ActionBar>\n+    <Button onClick={() => save(false)}>Save</Button>\n+    {canApprove && <Button onClick={() => save(true)}>Save & Approve</Button>}\n+  </ActionBar>\n );',
  },
];
const pr = makePr({
  number: 3668,
  repoOwner: 'Gomocha-FSP',
  repoName: 'fsp-horizon',
  title: 'Offer Save & Approve when finishing an order',
  headSha: 'review-head',
  headRef: 'feat/order-approval',
  authorLogin: 'sander',
  changedFiles: files.length,
  body:
    '## Save and approve an order in one step\n\nDispatchers currently save an order, reopen it, and then approve it. This adds a second action alongside Save for people with approval permission.\n\n### What changed\n\n- Add an optional `ApproveAfterSave` flag.\n- Check approval permission before saving.\n- Show **Save & Approve** next to Save.\n\n### Expected behavior\n\n| Action | Result |\n| --- | --- |\n| Save | Stores changes without approving. |\n| Save & Approve | Saves and approves the order. |\n\n### Notes for reviewers\n\nPlease check what happens if approval fails after saving.\n\n' +
    Array.from(
      { length: 8 },
      (_, i) =>
        `### Validation ${i + 1}\n\nConfirm the permission boundary and that existing clients can still save.`,
    ).join('\n\n'),
});

const meta: Meta<typeof QuickReviewOverlay> = {
  title: 'Focus/Quick review',
  component: QuickReviewOverlay,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => {
      const control = getControl();
      control.githubResponses.getPRReviewDetails = { pr: pr.pullRequest, baseSha: 'review-base' };
      control.githubResponses.getPRFiles = files;
      control.githubResponses.getAllComments = [
        {
          id: 'proof',
          author: 'sander',
          body: `## Verification screenshots\n\nThe browser flow passed. This sample screenshot illustrates how proof appears in comments.\n\n![Browser verification](${window.location.origin}/whats-new/1.0.11/close-pr.png)`,
          createdAt: '2026-09-09T12:00:00Z',
          htmlUrl: `${pr.pullRequest.htmlUrl}#issuecomment-1`,
          severity: 'unknown',
        },
        {
          id: 'agent',
          author: 'review-agent[bot]',
          body: 'The handler checks permissions before saving. Please also check the failed-approval case.',
          createdAt: '2026-09-09T11:00:00Z',
          htmlUrl: pr.pullRequest.htmlUrl,
          severity: 'unknown',
          filePath: 'src/orders/SaveOrderHandler.cs',
          lineNumber: 42,
        },
      ];
      control.githubResponses.getReviews = [
        {
          id: 2,
          state: 'COMMENTED',
          body: 'The screenshot makes the two actions clear.',
          submitted_at: '2026-09-09T12:30:00Z',
          user: { login: 'koen' },
        },
      ];
      return <Story />;
    },
  ],
  beforeEach: () => {
    // The design frames show no agent at work: risk waits for a click here.
    // The Risk… stories turn it on themselves.
    const settings = useSettingsStore.getState().settings;
    resetRiskAssessments();
    useSettingsStore.setState({
      settings: { ...settings, summaries: { ...settings.summaries!, autoRiskAssessment: false } },
    });
    useQuickReviewStore.setState({ activity: {} });
    resetReviewDisplayPreferences();
    const control = getControl();
    control.githubResponses.getPRReviewDetails = { pr: pr.pullRequest, baseSha: 'review-base' };
    control.githubResponses.getPRFiles = files;
    useQuickReviewStore.setState({ documents: {} });
    useQuickReviewStore.getState().startSinglePr(pr);
    return () => {
      useQuickReviewStore.getState().endSession();
      useSettingsStore.setState({ settings });
    };
  },
};
export default meta;
type Story = StoryObj<typeof QuickReviewOverlay>;
export const Default: Story = {};
export const ReadyToApprove: Story = {
  play: async () => {
    await waitFor(() =>
      expect(
        Object.values(useQuickReviewStore.getState().documents).some(
          (doc) => doc.headSha === 'review-head',
        ),
      ).toBe(true),
    );
    for (const key of Object.keys(useQuickReviewStore.getState().documents)) {
      useQuickReviewStore
        .getState()
        .updateDocument(key, (doc) => ({ ...doc, reviewed: files.map((file) => file.filename) }));
    }
  },
};
export const AutoMergeAlreadyEnabled: Story = {
  decorators: [
    (Story) => {
      getControl().githubResponses.getPRReviewDetails = {
        pr: { ...pr.pullRequest, autoMergeEnabled: true },
        baseSha: 'review-base',
      };
      return <Story />;
    },
  ],
  play: ReadyToApprove.play,
};
export const OverviewWithProof: Story = {
  name: 'Overview with description screenshots',
  decorators: [
    (Story) => {
      const control = getControl();
      const item = {
        id: 59671,
        rev: 1,
        url: '',
        relations: [],
        htmlUrl: 'https://dev.azure.com/example/FSP/_workitems/edit/59671',
        fields: {
          'System.Title': 'Refuse a questionnaire add the replacement would not carry',
          'System.WorkItemType': 'Bug',
          'System.State': 'Active',
          'System.AssignedTo': 'Vera',
          'Microsoft.VSTS.Common.Priority': 2,
          'System.Description':
            '<p>Adding a questionnaire after replacing an order can leave the questionnaire on the cancelled activity.</p><p>The request must fail before committing when the live activity cannot carry the questionnaire.</p>',
          'Microsoft.VSTS.Common.AcceptanceCriteria':
            '<ul><li>The add rolls back when replacement cannot carry the questionnaire.</li><li>The user sees a translated warning.</li><li>Existing successful adds still work.</li></ul>',
        },
      };
      useLinkStore.getState().setWorkItem(item.id, item);
      control.workItemScenario.workItem = item;
      control.workItemScenario.states = ['New', 'Active', 'Resolved'];
      control.workItemScenario.comments = [];
      useSettingsStore.getState().updateSettings({
        azureDevOps: {
          ...useSettingsStore.getState().settings.azureDevOps,
          organization: 'example',
          project: 'FSP',
          authMethod: 'azCli',
        },
      });
      control.githubResponses.getPRReviewDetails = {
        pr: overviewPr.pullRequest,
        baseSha: 'review-base',
      };
      control.githubResponses.getPRFiles = [
        ...files,
        { filename: 'bun.lock', status: 'modified', additions: 20, deletions: 5 },
      ];
      control.githubResponses.getReviewReadiness = {
        complete: true,
        warnings: [],
        checks: [
          { name: 'API tests', state: 'success' },
          { name: 'Portal tests', state: 'success' },
          { name: 'Backend build / test', state: 'missing' },
        ],
      };
      control.githubResponses.getAllComments = [
        {
          id: 'vera-proof',
          author: 'vera_gomocha',
          severity: 'unknown',
          createdAt: new Date(Date.now() - 600_000).toISOString(),
          sourceBody:
            '## PROOF\n\nVera CLI verification. Head SHA: a1b2c3d4e5f67890123456789012345678901234',
          body: `## PROOF\n\nVera CLI verification: the add is refused before commit; the translated warning is shown. API regression tests passed.\n\n![Quick review screenshot](${window.location.origin}/whats-new/3.0.0/quick-review.png)\n\n![Browser verification](${window.location.origin}/whats-new/1.0.11/close-pr.png)`,
          htmlUrl: `${overviewPr.pullRequest.htmlUrl}#issuecomment-1`,
        },
      ];
      return <Story />;
    },
  ],
  beforeEach: () => {
    useQuickReviewStore.setState({ documents: {} });
    useQuickReviewStore.getState().startSinglePr(overviewPr);
  },
};
const overviewPr = {
  ...pr,
  passedCount: 48,
  totalCheckCount: 48,
  pullRequest: {
    ...pr.pullRequest,
    number: 4532,
    title: 'fix(orders): refuse a questionnaire add the replacement would not carry (AB#59671)',
    authorLogin: 'vera_gomocha',
    headRef: 'fix/59671-refuse-questionnaire-add',
    baseRef: 'fix/59667-add-questionnaire-follows-live-activity',
    headSha: 'a1b2c3d4e5f67890123456789012345678901234',
    changedFiles: files.length + 1,
    additions: 2517,
    deletions: 16,
    commitCount: 2,
    updatedAt: new Date(Date.now() - 60_000).toISOString(),
    mergeable: false,
    body: `## Summary\n\nAdding a questionnaire after replacing an order could leave it on the cancelled activity. The add is now refused before it commits, with a translated reason.\n\n**Stacked on #4525.** The backend build/test job does not run on this base branch. Retarget after the parent PR merges.\n\n## Changes\n\nThe handler checks the result before committing the transaction. Regression tests cover replacement with a missing or disabled setting.\n\n## Verification\n\nThe browser flow and API regression tests passed.\n\n### Before\n\n![Before: order actions](${window.location.origin}/whats-new/1.0.11/close-pr.png)\n\n### After\n\n<img alt="After: browser verification" src="${window.location.origin}/whats-new/3.0.0/quick-review.png">`,
  },
};
export const LargeDiff: Story = {
  decorators: [
    (Story) => {
      const big = [...files];
      big[2] = {
        ...big[2]!,
        additions: 650,
        deletions: 0,
        patch:
          '@@ -0,0 +1,650 @@\n' +
          Array.from({ length: 650 }, (_, i) => `+const value${i} = ${i};`).join('\n'),
      };
      getControl().githubResponses.getPRFiles = big;
      return <Story />;
    },
  ],
};
export const LoadFailure: Story = {
  decorators: [
    (Story) => {
      getControl().githubResponses.getPRFiles = () =>
        Promise.reject(new Error('Unable to load changed files.'));
      return <Story />;
    },
  ],
};

export const LongLinesWrapped: Story = {
  decorators: [
    (Story) => {
      getControl().githubResponses.getPRFiles = files.map((file) =>
        file.filename === 'src/orders/OrderActions.tsx'
          ? {
              ...file,
              patch:
                '@@ -1,3 +1,4 @@\n return (\n-  <Button onClick={save}>Save</Button>\n+  <ActionBar onSave={() => save(false)} onApprove={() => save(true)} canApprove={canApprove} disabled={saving || approving} onFailure={showApprovalFailure} orderId={order.id} customerName={order.customer.name} assignedEngineer={order.engineer.name} />\n+  <Button title="Save the order and request approval from the assigned dispatcher after validating customer permissions and all required fields">Save & Approve</Button>\n );',
            }
          : file,
      );
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = await openFiles(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /OrderActions\.tsx/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Wrap lines' }));
    await expect(canvas.getByRole('button', { name: 'Wrap lines' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

export const ImageComparison: Story = {
  decorators: [
    (Story) => {
      const control = getControl();
      control.githubResponses.getPRReviewDetails = {
        pr: { ...pr.pullRequest, title: 'Make room for every Dispatch lane' },
        baseSha: 'review-base',
      };
      control.githubResponses.getPRFiles = files.map((file, index) =>
        index === 0
          ? {
              filename: 'screenshots/dispatch.png',
              status: 'modified',
              sha: 'image-head',
              additions: 0,
              deletions: 0,
            }
          : file,
      );
      control.githubResponses.getRepositoryObject = (path) => {
        if (path.includes('/compare/')) return { merge_base_commit: { sha: 'image-base' } };
        const after = path.endsWith('/git/blobs/image-head');
        return {
          type: 'file',
          sha: after ? 'image-head' : 'image-base',
          encoding: 'base64',
          content: (after ? afterDispatch : beforeDispatch).split(',')[1],
          size: after ? 490482 : 451698,
        };
      };
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = await openFiles(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /dispatch\.png/ }));
    await canvas.findByAltText('Before: screenshots/dispatch.png');
    await canvas.findByAltText('After: screenshots/dispatch.png');
    await expect(canvas.getByRole('button', { name: 'Rich diff' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

/** Opens the file walk from the card once the files have loaded. */
async function openFiles(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const button = await canvas.findByRole('button', { name: 'Review files' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  return canvas;
}

export const InlineDraft: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openFiles(canvasElement);
    const file = await canvas.findByRole('button', { name: /SaveOrderHandler.cs/ });
    await userEvent.click(file);
    await userEvent.click(await canvas.findByRole('button', { name: 'Comment on new line 46' }));
    await userEvent.type(
      canvas.getByPlaceholderText('Describe the issue or suggest a change...'),
      'What happens if approval fails after the order has been saved?',
    );
  },
};

export const ScreenshotComments: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await openFiles(canvasElement);
    await userEvent.click(await canvas.findByRole('tab', { name: /Comments/ }));
    await userEvent.click(await canvas.findByRole('button', { name: /PR author/ }));
    await waitFor(() => expect(canvas.getByAltText('Browser verification')).toBeVisible());
  },
};

/** The iteration 2 mockup's #482: 23 files, two of them generated. */
const large = makePr({
  number: 482,
  repoOwner: 'borght-dev',
  repoName: 'BorgDock',
  title: LARGE_PR_TITLE,
  body: LARGE_PR_BODY,
  authorLogin: 'koen',
  headRef: 'feat/t3-sessions',
  headSha: 't3-head',
  additions: 1840,
  deletions: 220,
  changedFiles: LARGE_PR_FILES.length,
  commitCount: 11,
  reviewStatus: 'pending',
});
const largeWithChecks = {
  ...large,
  passedCount: 78,
  totalCheckCount: 80,
  pendingCheckNames: ['E2E (1/2)', 'E2E (2/2)'],
};
const queued = [
  largeWithChecks,
  makePr({ number: 479, title: 'Flyout: remember the last scroll position', authorLogin: 'mira' }),
  makePr({
    number: 3668,
    title: 'Offer Save & Approve when finishing an order',
    authorLogin: 'sander',
  }),
];

const largeDecorator: Decorator = (Story) => {
  const control = getControl();
  control.githubResponses.getPRReviewDetails = { pr: large.pullRequest, baseSha: 'review-base' };
  control.githubResponses.getPRFiles = LARGE_PR_FILES;
  return <Story />;
};

/** The deck: #482 on top with its files by folder and Approve disabled; two PRs peek behind. */
export const LargePrCard: Story = {
  decorators: [largeDecorator],
  beforeEach: () => {
    resetReviewDisplayPreferences();
    useQuickReviewStore.setState({ documents: {} });
    useQuickReviewStore.getState().startSession(queued);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('21 of 21 to review, 2 generated');
    await expect(canvas.getByRole('button', { name: 'Approve' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  },
};

/** "Review files": the walk with the tree, the diff and three files marked. */
export const LargePrWalk: Story = {
  decorators: [largeDecorator],
  beforeEach: LargePrCard.beforeEach,
  play: async ({ canvasElement }) => {
    const canvas = await openFiles(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Skip generated' }));
    await userEvent.keyboard('vv');
    await canvas.findByText('4 of 23 reviewed, 19 to go');
  },
};

export const LargePrWalkFullscreen: Story = {
  ...LargePrWalk,
  play: async (context) => {
    await LargePrWalk.play?.(context);
    const canvas = within(context.canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^Full screen$/ }));
    await expect(canvas.getByRole('dialog', { name: 'Quick Review' })).toHaveAttribute(
      'data-fullscreen',
      'true',
    );
  },
};

function seedNextReview() {
  resetReviewDisplayPreferences();
  const nextReview = [
    makePr({
      number: 479,
      repoOwner: 'borght-dev',
      repoName: 'BorgDock',
      title: 'Flyout: remember the last scroll position',
      authorLogin: 'mira',
    }),
  ];
  usePrStore.setState({ needsMyReview: () => nextReview });
  useQuickReviewStore.getState().startSinglePr(largeWithChecks);
  useQuickReviewStore.setState({
    state: 'complete',
    decisions: new Map([['borght-dev/BorgDock#482', 'approved']]),
  });
}

export const ReviewNext: Story = { beforeEach: seedNextReview };

export const ReviewNextPassingFirst: Story = {
  ...ReviewNext,
  beforeEach: () => {
    seedNextReview();
    const passing = usePrStore.getState().needsMyReview();
    const failing = {
      ...makePr({ number: 478, title: 'Older request with failing checks' }),
      overallStatus: 'red' as const,
      failedCheckNames: ['Tests'],
    };
    const candidates = [failing, ...passing];
    usePrStore.setState({ needsMyReview: () => candidates });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Next review' })).toHaveTextContent(
      'Flyout: remember the last scroll position',
    );
  },
};

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const HOUR = 3_600_000;
const shot = (path: string) => `${window.location.origin}/whats-new/${path}`;

/** The planboard PR of design/quick-review-v2 frames A and B. */
const planboard = {
  ...makePr({
    number: 4812,
    repoOwner: 'gomocha',
    repoName: 'FSP',
    title: 'Planboard: show saved-search filters that the organisation layout hides',
    headSha: PLANBOARD_HEAD,
    headRef: 'feature/ab60640-hidden-filters',
    baseRef: 'develop',
    authorLogin: 'mvisser',
    body: `${PLANBOARD_BODY}\n\n## Verification\n\nHead SHA: ${PLANBOARD_HEAD}\n\n![Hidden fields in use · nl](${shot('2.0.0/main-window-focus.png')})`,
    changedFiles: PLANBOARD_FILES.length,
    additions: 634,
    deletions: 66,
    commitCount: 4,
    updatedAt: ago(2 * HOUR),
    labels: ['enhancement', 'planboard', 'translations'],
    labelColors: { enhancement: 'a2eeef', planboard: '7057ff', translations: 'fbca04' },
  }),
  passedCount: 14,
  totalCheckCount: 14,
};

const planboardComments = (): ClaudeReviewComment[] => [
  {
    id: 'vera-proof-4812',
    author: 'vera',
    severity: 'unknown',
    createdAt: ago(HOUR),
    sourceBody: `## Vera proof\n\nHead SHA: ${PLANBOARD_HEAD}`,
    body: `## Vera proof\n\nSaved search with a hidden **Region** filter now shows "Hidden fields in use" with the hint. API regression tests and the Playwright planboard suite passed.\n\n![Hidden fields in use · nl](${shot('2.0.0/main-window-focus.png')})\n\n![Hint tooltip](${shot('2.0.0/pr-detail.png')})\n\n![Saved search](${shot('2.0.0/main-window-prs.png')})\n\n![Translations](${shot('2.0.0/pr-discussion.png')})`,
    htmlUrl: `${planboard.pullRequest.htmlUrl}#issuecomment-4812`,
  },
  {
    id: 'review-agent-4812',
    author: 'review-agent[bot]',
    severity: 'unknown',
    createdAt: ago(3 * HOUR),
    body: 'The hook memoises on the layout object; saved searches recreate it on every load.',
    htmlUrl: planboard.pullRequest.htmlUrl,
    filePath: 'FSP/FSP.Portal/src/hooks/planboard/usePlanboardFilterLayout.ts',
    lineNumber: 14,
  },
];

const planboardDecorator: Decorator = (Story) => {
  const control = getControl();
  control.githubResponses.getPRReviewDetails = { pr: planboard.pullRequest, baseSha: 'develop' };
  control.githubResponses.getPRFiles = PLANBOARD_FILES;
  control.githubResponses.getReviews = [];
  control.githubResponses.getAllComments = planboardComments();
  return (
    <>
      <Story />
      <ToastViewport />
    </>
  );
};

const WORKSPACE = 'FSP/FSP.Portal/src/components/planboard/AdvancedFiltersWorkspace.tsx';
const LAST_TEST = 'Tests/types/planboardFilters.test.ts';

/** Waits for the snapshot, then marks `reviewed` with `step` open and one saved draft. */
async function seedPlanboard(reviewed: string[], step: string) {
  await waitFor(() =>
    expect(
      Object.values(useQuickReviewStore.getState().documents).some(
        (doc) => doc.headSha === PLANBOARD_HEAD,
      ),
    ).toBe(true),
  );
  for (const key of Object.keys(useQuickReviewStore.getState().documents)) {
    useQuickReviewStore.getState().updateDocument(key, (doc) => ({
      ...doc,
      walked: true,
      reviewed,
      step,
      comments: [
        {
          id: 'draft-readonly',
          path: WORKSPACE,
          line: 99,
          side: 'RIGHT',
          body: "`readOnly` means a planner can't clear a hidden filter from here. Should they be able to drop it from the saved search instead?",
          saved: true,
          outdated: false,
        },
      ],
    }));
  }
}

async function continueReviewing(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const button = await canvas.findByRole('button', { name: /^Continue reviewing|Review files/ });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  return canvas;
}

/** design/quick-review-v2 frame A: the walk with the PR in view and its proof beside the diff. */
export const WalkWithProof: Story = {
  decorators: [planboardDecorator],
  beforeEach: () => {
    resetReviewDisplayPreferences();
    useQuickReviewStore.setState({ documents: {} });
    useQuickReviewStore.getState().startSinglePr(planboard);
  },
  play: async ({ canvasElement }) => {
    await seedPlanboard(
      [
        'Database/Translations/pending/ab60640-hidden-filter-fields.json',
        'FSP/FSP.Portal/src/types/planboardFilters.ts',
        'Documentation/planboard/filters.md',
        'Documentation/planboard/planboard.md',
      ],
      WORKSPACE,
    );
    const canvas = await continueReviewing(canvasElement);
    await canvas.findByRole('img', { name: 'Hidden fields in use · nl' });
  },
};

/** design/quick-review-v2 frame B: every file marked, the footer is the decision bar. */
export const AllFilesReviewed: Story = {
  decorators: [planboardDecorator],
  beforeEach: () => {
    resetReviewDisplayPreferences();
    localStorage.setItem('borgdock-quick-review-context-open', 'false');
    useQuickReviewStore.setState({ documents: {} });
    useQuickReviewStore.getState().startSinglePr(planboard);
  },
  play: async ({ canvasElement }) => {
    await seedPlanboard(
      PLANBOARD_FILES.map((file) => file.filename),
      LAST_TEST,
    );
    const canvas = await continueReviewing(canvasElement);
    await canvas.findByText(/That was the last file/);
  },
};

/** The timesheets PR of frame C, reviewed before at TIMESHEET_REVIEWED. */
const timesheets = {
  ...makePr({
    number: 4815,
    repoOwner: 'gomocha',
    repoName: 'FSP',
    title: 'Timesheets: round break minutes per shift instead of per day',
    headSha: TIMESHEET_HEAD,
    headRef: 'fix/ab60612-split-shift-breaks',
    baseRef: 'develop',
    authorLogin: 'sbakker',
    body: `${TIMESHEET_BODY}\n\n## Verification\n\nHead SHA: ${TIMESHEET_REVIEWED}\n\n![Timesheet week 43 · split shift](${shot('2.0.0/sql-results.png')})`,
    changedFiles: TIMESHEET_FILES.length,
    additions: 278,
    deletions: 24,
    commitCount: 5,
    updatedAt: ago(0.7 * HOUR),
    labels: ['bug', 'payroll', 'customer: Heras'],
    labelColors: { bug: 'd73a4a', payroll: '0e8a16', 'customer: Heras': 'e99695' },
  }),
  passedCount: 9,
  totalCheckCount: 9,
};

/** #4812 then #4815, which was reviewed before at TIMESHEET_REVIEWED. */
const sessionDecorator: Decorator = (Story) => {
  const control = getControl();
  control.githubResponses.getPRReviewDetails = ({ prNumber }) => ({
    pr: prNumber === timesheets.pullRequest.number ? timesheets.pullRequest : planboard.pullRequest,
    baseSha: 'develop',
  });
  control.githubResponses.getPRFiles = ({ prNumber }) =>
    prNumber === timesheets.pullRequest.number ? TIMESHEET_FILES : PLANBOARD_FILES;
  control.githubResponses.getRepositoryObject = (path) =>
    path.includes('/compare/') ? TIMESHEET_COMPARE : null;
  control.githubResponses.getReviews = ({ prNumber }) =>
    prNumber !== timesheets.pullRequest.number
      ? []
      : [
          {
            id: 7,
            state: 'CHANGES_REQUESTED',
            body: 'Split shifts still round once per day; a 2×7 min break becomes 15 instead of 0.',
            submitted_at: ago(48 * HOUR),
            user: { login: 'koen' },
            commit_id: TIMESHEET_REVIEWED,
          },
        ];
  control.githubResponses.getAllComments = ({ prNumber }) =>
    prNumber !== timesheets.pullRequest.number
      ? planboardComments()
      : [
          {
            id: 'reply-4815',
            author: 'sbakker',
            severity: 'unknown',
            createdAt: ago(2 * HOUR),
            body: 'Fixed in 9c1d2e0: each part rounds on its own now, test added.',
            htmlUrl: timesheets.pullRequest.htmlUrl,
          },
          {
            id: 'vera-proof-4815',
            author: 'vera',
            severity: 'unknown',
            createdAt: ago(30 * HOUR),
            sourceBody: `## Vera proof\n\nHead SHA: ${TIMESHEET_REVIEWED}`,
            body: `## Vera proof\n\nTimesheet week 43 with a split shift: breaks of 7 and 7 minutes.\n\n![Timesheet week 43 · split shift](${shot('2.0.0/sql-results.png')})`,
            htmlUrl: timesheets.pullRequest.htmlUrl,
          },
        ];
  return (
    <>
      <Story />
      <ToastViewport />
    </>
  );
};

function startPlanboardSession() {
  resetReviewDisplayPreferences();
  usePrStore.setState({ username: 'koen' });
  useQuickReviewStore.setState({ documents: {} });
  useQuickReviewStore
    .getState()
    .startSession([
      planboard,
      timesheets,
      makePr({ number: 4821, title: 'Planboard: keyboard focus on resource rows' }),
    ]);
}

/** design/quick-review-v2 frame C: approve #4812 in the walk, straight on to re-reviewing #4815. */
export const ReReviewSinceLastReview: Story = {
  decorators: [sessionDecorator],
  beforeEach: startPlanboardSession,
  play: async ({ canvasElement }) => {
    await seedPlanboard(
      PLANBOARD_FILES.map((file) => file.filename),
      LAST_TEST,
    );
    const canvas = await continueReviewing(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Approve & auto-merge' }));
    await canvas.findByText(/2 commits/);
  },
};

/** One file left on #4812 with #4815 next: the site's recording marks it and decides from the footer. */
export const LastFileThenNext: Story = {
  decorators: [sessionDecorator],
  beforeEach: () => {
    startPlanboardSession();
    localStorage.setItem('borgdock-quick-review-context-open', 'false');
  },
  play: async ({ canvasElement }) => {
    await seedPlanboard(
      PLANBOARD_FILES.map((file) => file.filename).filter((name) => name !== LAST_TEST),
      LAST_TEST,
    );
    await continueReviewing(canvasElement);
  },
};

/** The summary agent answers with PLANBOARD_GUIDE. */
const guideDecorator: Decorator = (Story) => {
  getControl().invokeResponses.run_headless_prompt = {
    text: JSON.stringify(PLANBOARD_GUIDE),
    provider: 'claude',
    model: 'sonnet',
    durationMs: 41_000,
  };
  return <Story />;
};

function startInOrder(order: 'guide' | 'folders' | 'commits', pr = planboard) {
  resetReviewDisplayPreferences();
  localStorage.setItem('borgdock-quick-review-order', order);
  useQuickReviewStore.setState({ documents: {} });
  useReviewGuideStore.setState({ entries: {} });
  useQuickReviewStore.getState().startSinglePr(pr);
}

/** The card with the review guide: what the PR does, what to watch, the chapters. */
export const GuideOnCard: Story = {
  decorators: [planboardDecorator, guideDecorator],
  beforeEach: () => startInOrder('guide'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/A saved search could fill a filter field/);
    await canvas.findByRole('button', { name: /Workspace lists them/ });
  },
};

/** The guide is still being written: the card says so and the walk starts in folders. */
export const GuideWriting: Story = {
  decorators: [
    planboardDecorator,
    (Story) => {
      getControl().invokeResponses.run_headless_prompt = () => new Promise(() => {});
      return <Story />;
    },
  ],
  beforeEach: () => startInOrder('guide'),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/Claude is reading the diff/);
  },
};

/** Guides are not written automatically (Settings → Summaries): the card offers to write one. */
export const GuideOnClick: Story = {
  decorators: [planboardDecorator, guideDecorator],
  beforeEach: () => {
    const settings = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...settings, summaries: { ...settings.summaries!, autoReviewGuide: false } },
    });
    startInOrder('guide');
    return () => useSettingsStore.setState({ settings });
  },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole('button', { name: 'Write guide' });
  },
};

/** A change of a few lines: one file of the planboard PR, on its own. */
const translations = {
  ...planboard,
  pullRequest: {
    ...planboard.pullRequest,
    number: 4840,
    title: 'Planboard: translate "Hidden fields in use"',
    headSha: '7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d',
    headRef: 'fix/ab60712-hidden-fields-translations',
    body: 'Adds the two translation rows the hidden-filters notice was missing.',
    changedFiles: 1,
    additions: 20,
    deletions: 0,
    commitCount: 1,
  },
};

/** A small change gets no guide: the card says why, and still offers to write one. */
export const GuideSkipped: Story = {
  decorators: [
    guideDecorator,
    (Story) => {
      const control = getControl();
      control.githubResponses.getPRReviewDetails = {
        pr: translations.pullRequest,
        baseSha: 'develop',
      };
      control.githubResponses.getPRFiles = PLANBOARD_FILES.slice(0, 1);
      control.githubResponses.getReviews = [];
      control.githubResponses.getAllComments = [];
      return <Story />;
    },
  ],
  beforeEach: () => startInOrder('guide', translations),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/A small change: 20 lines in 1 file/);
    await canvas.findByRole('button', { name: 'Write guide' });
  },
};

/** The walk in Guide order: chapters in the tree, the file's chapter above the diff. */
export const GuideWalk: Story = {
  decorators: [planboardDecorator, guideDecorator],
  beforeEach: () => startInOrder('guide'),
  play: async ({ canvasElement }) => {
    await seedPlanboard(
      [
        'FSP/FSP.Portal/src/types/planboardFilters.ts',
        'Tests/types/planboardFilters.test.ts',
        'FSP/FSP.Portal/src/hooks/planboard/usePlanboardFilterLayout.ts',
        'Tests/hooks/usePlanboardFilterLayout.test.ts',
      ],
      WORKSPACE,
    );
    const canvas = await continueReviewing(canvasElement);
    await canvas.findByText('Chapter 3 of 4');
  },
};

/** A refactor: the moved method, the re-indented block and the usings fold to one line each. */
const refactor = {
  ...makePr({
    number: 4830,
    repoOwner: 'gomocha',
    repoName: 'FSP',
    title: 'Timesheets: move shift rounding into its own class',
    headSha: 'f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b7c6d',
    headRef: 'refactor/shift-rounding',
    baseRef: 'develop',
    authorLogin: 'sbakker',
    body: 'Moves `RoundPerShift` into `ShiftRounding` so payroll can use it. Worked hours can no longer go below zero.',
    changedFiles: NOISE_FILES.length,
    additions: 20,
    deletions: 14,
    commitCount: 2,
    updatedAt: ago(HOUR),
  }),
  passedCount: 6,
  totalCheckCount: 6,
};

export const NoiseFolded: Story = {
  decorators: [
    (Story) => {
      const control = getControl();
      control.githubResponses.getPRReviewDetails = { pr: refactor.pullRequest, baseSha: 'develop' };
      control.githubResponses.getPRFiles = NOISE_FILES;
      control.githubResponses.getReviews = [];
      control.githubResponses.getAllComments = [];
      return <Story />;
    },
  ],
  beforeEach: () => {
    startInOrder('folders', refactor);
    localStorage.setItem('borgdock-quick-review-context-open', 'false');
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: 'Review files' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await userEvent.click(await canvas.findByRole('button', { name: /BreakRounding\.cs/ }));
    await canvas.findByRole('button', { name: /Moved to ShiftRounding\.cs/ });
  },
};

/** Commits order: the PR read commit by commit, the first one read. */
export const CommitsWalk: Story = {
  decorators: [
    planboardDecorator,
    (Story) => {
      const control = getControl();
      control.githubResponses.getPRCommits = PLANBOARD_COMMITS;
      control.githubResponses.getCommitFiles = ({ commitSha }) => planboardCommitFiles(commitSha);
      return <Story />;
    },
  ],
  beforeEach: () => startInOrder('commits'),
  play: async ({ canvasElement }) => {
    await seedPlanboard([], WORKSPACE);
    const canvas = await continueReviewing(canvasElement);
    await canvas.findByText('Find the filter fields a saved search fills but the layout hides', {
      selector: 'b',
    });
    await userEvent.keyboard('v');
    await canvas.findByText('Commit 2 of 4');
  },
};

const E2E_CHECK = 'Deploy & Test (staging-2) / E2E Shard 3/4';

function e2eReportBody(failed: Array<[file: string, test: string, error: string]>) {
  return [
    '## E2E Test Results',
    '',
    `**Environment:** https://staging-2.example.com | **Smoke:** Passed | **E2E:** ${failed.length} failed`,
    '',
    '### Failed Tests',
    '| File | Test | Error |',
    '|------|------|-------|',
    ...failed.map(([file, test, error]) => `| \`${file}\` | ${test} | \`${error}\` |`),
  ].join('\n');
}

/** Every PR's comments hold `body` as its latest E2E report. */
function e2eReportDecorator(body: string): Decorator {
  return (Story) => {
    getControl().githubResponses.getPRReviewDetails = {
      pr: redE2e.pullRequest,
      baseSha: 'review-base',
    };
    getControl().githubResponses.getRepositoryObject = (path) =>
      path.includes('/issues/')
        ? [
            {
              id: 9,
              body,
              html_url: `${pr.pullRequest.htmlUrl}#issuecomment-9`,
              created_at: '2026-11-05T05:01:17Z',
            },
          ]
        : [];
    return (
      <>
        <Story />
        <ToastViewport />
      </>
    );
  };
}

/** The PR of the meta, in a made-up repository: this story is a release hero. */
const redE2e = {
  ...pr,
  pullRequest: {
    ...pr.pullRequest,
    repoOwner: 'acme',
    repoName: 'shop',
    htmlUrl: 'https://github.com/acme/shop/pull/3668',
  },
  overallStatus: 'red' as const,
  failedCheckNames: [E2E_CHECK],
  passedCount: 41,
  totalCheckCount: 42,
};

function startRedE2e(neighbours: (typeof redE2e)[] = []) {
  useE2eStore.setState({ entries: {} });
  usePrStore.setState({ pullRequests: [redE2e, ...neighbours] });
  useQuickReviewStore.getState().startSinglePr(redE2e);
}

/**
 * Red only from an E2E test this PR doesn't touch, which fails on another PR
 * too: the card says so under Checks and offers Approve & merge (as admin).
 */
export const E2eFailureNotItsOwn: Story = {
  decorators: [
    e2eReportDecorator(
      e2eReportBody([
        [
          'planboard/drag-create-keeps-window.spec.ts',
          'Drag-created order window > keeps the dragged window when an order type is picked @AB60379',
          'Expected pattern: /^2\\s*[^0-9]+$/',
        ],
      ]),
    ),
  ],
  beforeEach: () =>
    startRedE2e([
      {
        ...redE2e,
        pullRequest: { ...redE2e.pullRequest, number: 3670, authorLogin: 'mira' },
      },
    ]),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('1 E2E test failed, all also failing on other PRs');
    await canvas.findByText('also fails on #3670');
    await canvas.findByRole('button', { name: 'Approve & merge' });
  },
};

/** The failing E2E spec is one this PR changes: no merge past it. */
export const E2eFailureItsOwn: Story = {
  decorators: [
    e2eReportDecorator(
      e2eReportBody([
        [
          'orders/OrderActions.test.tsx',
          'Save & Approve saves before approving',
          'Error: expect(save).toHaveBeenCalledWith(true)',
        ],
        ['orders/order-list.spec.ts', 'filters by status', 'Timeout 15000ms exceeded'],
      ]),
    ),
  ],
  beforeEach: () => startRedE2e(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Fails its own E2E test');
    await canvas.findByText('spec changed in this PR');
    await canvas.findByRole('button', { name: 'Approve & auto-merge' });
  },
};

function sanderPr(number: number, title: string, createdAt: string) {
  const made = makePr({
    number,
    title,
    authorLogin: 'sander',
    repoOwner: 'acme',
    repoName: 'shop',
    createdAt,
    headSha: `head-${number}`,
  });
  return made;
}

const runFirst = sanderPr(3601, 'Timesheets: keep break minutes per shift', '2026-11-01T08:00:00Z');
const runConflicted = sanderPr(
  3604,
  'Planboard: drag a resource row to reorder',
  '2026-11-02T08:00:00Z',
);
runConflicted.pullRequest.mergeable = false;
const runFailing = {
  ...sanderPr(3611, 'Orders: refuse a questionnaire the replacement drops', '2026-11-03T08:00:00Z'),
  overallStatus: 'red' as const,
  failedCheckNames: ['Build & Test API / Test API (shard 6)'],
};
const runSecond = sanderPr(3615, 'Assets: show the next inspection date', '2026-11-03T12:00:00Z');
const runThird = sanderPr(
  3620,
  'Quotes: retry a quote whose details failed',
  '2026-11-04T09:00:00Z',
);
const runLater = sanderPr(
  3629,
  'Portal: keep the selected tab after a refresh',
  '2026-11-05T09:00:00Z',
);
const runHeld: HeldPr[] = [
  { pr: runConflicted, fit: { kind: 'held', reason: 'conflicts', why: 'Has merge conflicts' } },
  {
    pr: runFailing,
    fit: { kind: 'held', reason: 'failing', why: 'Build & Test API / Test API (shard 6) fails' },
  },
];

const requestedOfMe = [makePr({ number: 3655, title: 'Requested of me', authorLogin: 'mira' })];

function seedAuthorRun() {
  resetReviewDisplayPreferences();
  usePrStore.setState({
    pullRequests: [runFirst, runConflicted, runFailing, runSecond, runThird, runLater],
    username: 'koen',
    needsMyReview: () => requestedOfMe,
  });
}

/** An author run: the author in the title bar, their next PR you can merge up next. */
export const AuthorRun: Story = {
  decorators: [
    (Story) => {
      const control = getControl();
      control.githubResponses.getPRReviewDetails = {
        pr: runFirst.pullRequest,
        baseSha: 'review-base',
      };
      return <Story />;
    },
  ],
  beforeEach: () => {
    seedAuthorRun();
    const store = useQuickReviewStore.getState();
    store.startRun('sander', runFirst);
    store.fillRun('sander', [runSecond, runThird], runHeld);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/sander · oldest first/);
    await canvas.findByTitle('Assets: show the next inspection date');
  },
};

/**
 * The run is done: what it left out and why, the author's next PR (it became
 * mergeable while you reviewed), and the PR that waits on your review.
 */
export const AuthorRunComplete: Story = {
  beforeEach: () => {
    seedAuthorRun();
    useQuickReviewStore.setState({
      state: 'complete',
      queue: [runFirst, runSecond, runThird],
      currentIndex: 2,
      run: { author: 'sander', held: runHeld, filling: false },
      decisions: new Map([
        ['acme/shop#3601', 'approved'],
        ['acme/shop#3615', 'approved'],
        ['acme/shop#3620', 'skipped'],
      ]),
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('region', { name: 'Left out of this run' });
    await canvas.findByRole('button', { name: 'Next from sander' });
  },
};

/** Long chapter notes read whole, and the tree dragged wider (kept across launches). */
export const GuideWalkWideTree: Story = {
  decorators: [
    planboardDecorator,
    (Story) => {
      const guide = structuredClone(PLANBOARD_GUIDE);
      guide.chapters[0]!.intent =
        "Turn off Kestrel's Server header once for all hosts built through the shared service defaults, so a scanner can no longer tell which server software to target. Hosts built without them set the option themselves.";
      getControl().invokeResponses.run_headless_prompt = {
        text: JSON.stringify(guide),
        provider: 'codex',
        model: 'gpt-6.1-terra',
        durationMs: 38_000,
      };
      return <Story />;
    },
  ],
  beforeEach: () => {
    startInOrder('guide');
    localStorage.setItem('borgdock-quick-review-tree-width', '420');
    return () => localStorage.removeItem('borgdock-quick-review-tree-width');
  },
  play: async ({ canvasElement }) => {
    await seedPlanboard(
      ['FSP/FSP.Portal/src/types/planboardFilters.ts'],
      'Tests/types/planboardFilters.test.ts',
    );
    const canvas = await continueReviewing(canvasElement);
    await canvas.findByRole('separator', { name: 'File list width' });
  },
};

export const AuthorRunFallback: Story = {
  beforeEach: () => {
    seedAuthorRun();
    const blocked = structuredClone(runLater);
    blocked.pullRequest.reviewStatus = 'changesRequested';
    blocked.pullRequest.title = 'Waiting for author changes';
    usePrStore.setState({
      pullRequests: [runFirst, blocked, runConflicted, runFailing, ...requestedOfMe],
    });
    useQuickReviewStore.setState({
      state: 'complete',
      queue: [runFirst],
      currentIndex: 0,
      run: null,
      decisions: new Map([['acme/shop#3601', 'approved']]),
    });
  },
};

export const SeparateReviewsComplete: Story = {
  beforeEach: () => {
    seedAuthorRun();
    useQuickReviewStore.setState({ activity: {} });
    const store = useQuickReviewStore.getState();
    store.startSinglePr(runFirst);
    store.advance('approved');
    store.endSession();
    store.startSinglePr(runSecond);
    store.advance('approved');
    store.endSession();
    store.startSinglePr(runThird);
    store.advance('approved');
  },
};

// ── Regression risk (design/risk-assessment/opus-mockup.html) ─────────────

const refunds = {
  ...makePr(refundPr({ updatedAt: ago(2 * HOUR) })),
  passedCount: 14,
  totalCheckCount: 14,
};

const bump = {
  ...makePr(
    refundPr({
      number: 4830,
      title: 'Bump money-fmt from 2.4.1 to 3.0.0',
      headSha: BUMP_HEAD,
      headRef: 'dependabot/npm_and_yarn/money-fmt-3.0.0',
      authorLogin: 'dependabot[bot]',
      body: BUMP_BODY,
      changedFiles: BUMP_FILES.length,
      additions: 4,
      deletions: 3,
      commitCount: 1,
      updatedAt: ago(5 * HOUR),
      htmlUrl: 'https://github.com/acme/shop/pull/4830',
    }),
  ),
  passedCount: 14,
  totalCheckCount: 14,
};

function headlessResult(answer: unknown, durationMs = 48_000) {
  return { text: JSON.stringify(answer), provider: 'claude', model: 'sonnet', durationMs };
}

/** GitHub's contents API for the files the answer cites outside the diff. */
function contentsOf(sources: Record<string, string>) {
  return (path: string) => {
    const match = /\/contents\/(.+)\?ref=/.exec(path);
    const file = match ? decodeURIComponent(match[1]!) : '';
    const text = sources[file];
    if (text === undefined) return Promise.reject(new Error(`No ${file} in this story`));
    return { type: 'file', size: text.length, encoding: 'base64', content: btoa(text) };
  };
}

/** The refunds PR: the agent answers a risk prompt with the assessment, any other with the guide. */
function riskDecorator(
  target: typeof refunds,
  files: PullRequestFileChange[],
  answers: { risk: unknown; guide?: unknown; sources: Record<string, string> },
): Decorator {
  return (Story) => {
    const control = getControl();
    control.githubResponses.getPRReviewDetails = { pr: target.pullRequest, baseSha: 'main' };
    control.githubResponses.getPRFiles = files;
    control.githubResponses.getReviews = [];
    control.githubResponses.getAllComments = [];
    control.githubResponses.getRepositoryObject = contentsOf(answers.sources);
    control.invokeResponses.run_headless_prompt = (args: unknown) => {
      const prompt = (args as { request: { prompt: string } }).request.prompt;
      return prompt.startsWith(RISK_PROMPT_TITLE)
        ? headlessResult(answers.risk)
        : headlessResult(answers.guide ?? {}, 31_000);
    };
    return (
      <>
        <Story />
        <ToastViewport />
      </>
    );
  };
}

/** Risk assessed automatically, with the repository checked out so it can cite outside the diff. */
function startRisk(target: typeof refunds, { auto = true } = {}) {
  resetReviewDisplayPreferences();
  localStorage.setItem('borgdock-quick-review-order', 'guide');
  localStorage.setItem('borgdock-quick-review-context-open', 'false');
  const settings = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: {
      ...settings,
      repos: [
        {
          owner: 'acme',
          name: 'shop',
          enabled: true,
          worktreeBasePath: '/repos/shop',
          worktreeSubfolder: '',
        } as RepoSettings,
      ],
      summaries: { ...settings.summaries!, autoRiskAssessment: auto },
    },
  });
  useQuickReviewStore.setState({ documents: {} });
  useReviewGuideStore.setState({ entries: {} });
  resetRiskAssessments();
  useQuickReviewStore.getState().startSinglePr(target);
  return () => useSettingsStore.setState({ settings });
}

/** The card: regression risk first, the guide under it. High, set by R1, its evidence open. */
export const RiskOnCard: Story = {
  decorators: [
    riskDecorator(refunds, REFUND_FILES, {
      risk: REFUND_ANSWER,
      guide: REFUND_GUIDE,
      sources: REFUND_SOURCES,
    }),
  ],
  beforeEach: () => startRisk(refunds),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/A refund that names a cancelled line pays it out in full/);
    await canvas.findByText('High risk');
    await canvas.findByText(/Refunds can now return part of the shipping/);
  },
};

export const RiskOnCardLight: Story = { ...RiskOnCard, globals: { theme: 'light' } };

/** "Open in walk": the cited file, R1 tagged in the tree, the reason above the diff and under its lines. */
export const RiskWalk: Story = {
  ...RiskOnCard,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chip = await canvas.findByRole('button', { name: 'calculate.ts:139–141' });
    await waitFor(() => expect(chip.closest('fieldset')).toBeEnabled());
    await userEvent.click(chip);
    await canvas.findByText('Chapter 2 of 3');
    await waitFor(() => expect(canvasElement.querySelector('.qr-risk-linemark')).not.toBeNull());
  },
};

export const RiskWalkLight: Story = { ...RiskWalk, globals: { theme: 'light' } };

/** A dependency update gets no guide; its risk comes from the release notes and the code that uses it. */
export const RiskDependencyUpdate: Story = {
  decorators: [riskDecorator(bump, BUMP_FILES, { risk: BUMP_ANSWER, sources: BUMP_SOURCES })],
  beforeEach: () => startRisk(bump),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/No guide \(a dependency update\)\. Risk is assessed anyway\./);
    await canvas.findByText('High risk');
  },
};

/** The head moved since the cached assessment: shown, marked older, with Assess head. */
export const RiskStale: Story = {
  decorators: [
    riskDecorator(
      { ...refunds, pullRequest: { ...refunds.pullRequest, headSha: REFUND_NEXT_HEAD } },
      REFUND_FILES,
      {
        risk: REFUND_ANSWER,
        guide: REFUND_GUIDE,
        sources: REFUND_SOURCES,
      },
    ),
    (Story) => {
      getControl().invokeResponses.cache_load_tab_data = (args: unknown) =>
        (args as { dataType: string }).dataType === 'riskAssessment'
          ? {
              data: refundAssessment({ minutesAgo: 95 }),
              prUpdatedAt: refundAssessment().headSha,
              cachedAt: ago(HOUR),
            }
          : null;
      return <Story />;
    },
  ],
  beforeEach: () =>
    startRisk(
      { ...refunds, pullRequest: { ...refunds.pullRequest, headSha: REFUND_NEXT_HEAD } },
      { auto: false },
    ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText('High risk · older commit');
  },
};

/** The assessment is still being written. */
export const RiskAssessing: Story = {
  decorators: [
    riskDecorator(refunds, REFUND_FILES, { risk: REFUND_ANSWER, sources: REFUND_SOURCES }),
    (Story) => {
      getControl().invokeResponses.run_headless_prompt = () => new Promise(() => {});
      return <Story />;
    },
  ],
  beforeEach: () => startRisk(refunds),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText('Assessing risk');
  },
};
