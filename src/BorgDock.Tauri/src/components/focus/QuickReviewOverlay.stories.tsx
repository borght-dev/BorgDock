import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useLinkStore } from '@/stores/link-store';
import { usePrStore } from '@/stores/pr-store';
import { useQuickReviewStore } from '@/stores/quick-review-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PullRequestFileChange } from '@/types';
import { getControl } from '../../../.storybook/mocks/control';
import { LARGE_PR_BODY, LARGE_PR_FILES, LARGE_PR_TITLE } from './__fixtures__/quick-review-large';
import { makePr } from './__tests__/helpers';
import { QuickReviewOverlay } from './QuickReviewOverlay';

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
    const control = getControl();
    control.githubResponses.getPRReviewDetails = { pr: pr.pullRequest, baseSha: 'review-base' };
    control.githubResponses.getPRFiles = files;
    useQuickReviewStore.setState({ documents: {} });
    useQuickReviewStore.getState().startSinglePr(pr);
    return () => useQuickReviewStore.getState().endSession();
  },
};
export default meta;
type Story = StoryObj<typeof QuickReviewOverlay>;
export const Default: Story = {};
export const OverviewWithProof: Story = {
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
    body: '## Summary\n\nAdding a questionnaire after replacing an order could leave it on the cancelled activity. The add is now refused before it commits, with a translated reason.\n\n**Stacked on #4525.** The backend build/test job does not run on this base branch. Retarget after the parent PR merges.\n\n## Changes\n\nThe handler checks the result before committing the transaction. Regression tests cover replacement with a missing or disabled setting.',
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
    await userEvent.click(await canvas.findByRole('button', { name: 'Comments' }));
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

export const ReviewNext: Story = {
  beforeEach: () => {
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
  },
};
