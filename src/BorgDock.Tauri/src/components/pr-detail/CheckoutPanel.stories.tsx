import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckoutPanel } from './CheckoutPanel';
import {
  approvedPr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';

const meta: Meta<typeof CheckoutPanel> = {
  title: 'PR Detail/CheckoutPanel',
  component: CheckoutPanel,
  decorators: [(Story) => <PanelFrame><Story /></PanelFrame>],
};
export default meta;
type Story = StoryObj<typeof CheckoutPanel>;

const PR_BRANCH = 'feature/storybook-phase11-pr-detail';

// Bare entries returned by list_worktrees_bare (fast path)
const bareMain = { path: '/work/repo.git', branchName: 'main', isMainWorktree: true };
const bareWtA = { path: '/work/wt/feature-a', branchName: 'feature-a', isMainWorktree: false };
const bareWtB = { path: '/work/wt/feature-b', branchName: 'feature-b', isMainWorktree: false };
const bareWtC = { path: '/work/wt/feature-c', branchName: 'feature-c', isMainWorktree: false };
const bareWtBranch = {
  path: '/work/wt/feature-storybook-phase11-pr-detail',
  branchName: PR_BRANCH,
  isMainWorktree: false,
};

// Full entries returned by list_worktrees (slow path — adds status/ahead/behind)
const fullWtA = { ...bareWtA, status: 'clean' as const, uncommittedCount: 0, ahead: 0, behind: 0, commitSha: 'abc1234' };
const fullWtB = { ...bareWtB, status: 'dirty' as const, uncommittedCount: 3, ahead: 1, behind: 0, commitSha: 'def5678' };
const fullWtC = { ...bareWtC, status: 'conflict' as const, uncommittedCount: 0, ahead: 0, behind: 2, commitSha: 'ghi9012' };
const fullWtBranch = { ...bareWtBranch, status: 'clean' as const, uncommittedCount: 0, ahead: 2, behind: 0, commitSha: 'jkl3456' };

const baseProps = {
  branchName: PR_BRANCH,
  repoBasePath: '/work/repo.git',
  worktreeSubfolder: '.worktrees',
  onDismiss: () => {},
};

// ─── Stories ───────────────────────────────────────────────────────────────

/**
 * No worktrees configured — user sees the picker with only "create new" option
 * and no existing rows.
 */
export const NoWorktrees: Story = {
  decorators: [
    withPrDetail(approvedPr, {
      invokeResponses: {
        list_worktrees_bare: [],
        list_worktrees: [],
      },
    }),
  ],
  args: baseProps,
};

/**
 * One bare-repo entry (the main worktree) is present but no feature worktrees.
 * Picker shows the "create new" path as the only option.
 */
export const OnlyMainWorktree: Story = {
  decorators: [
    withPrDetail(approvedPr, {
      invokeResponses: {
        list_worktrees_bare: [bareMain],
        list_worktrees: [{ ...bareMain, status: 'clean' as const, uncommittedCount: 0, ahead: 0, behind: 0, commitSha: 'a1b2c3' }],
      },
    }),
  ],
  args: baseProps,
};

/**
 * The PR's branch is already checked out in a worktree — panel skips the
 * picker and lands on the "ready" surface with launch buttons.
 */
export const ExistingWorktreeForBranch: Story = {
  decorators: [
    withPrDetail(approvedPr, {
      invokeResponses: {
        list_worktrees_bare: [bareMain, bareWtBranch],
        list_worktrees: [
          { ...bareMain, status: 'clean' as const, uncommittedCount: 0, ahead: 0, behind: 0, commitSha: 'a1b2c3' },
          fullWtBranch,
        ],
      },
    }),
  ],
  args: baseProps,
};

/**
 * Multiple unrelated worktrees exist — picker shows existing rows and
 * the "create new" option. Status badges (clean/dirty/conflict) are all
 * visible.
 */
export const MultipleWorktreesPickByPath: Story = {
  decorators: [
    withPrDetail(approvedPr, {
      invokeResponses: {
        list_worktrees_bare: [bareMain, bareWtA, bareWtB, bareWtC],
        list_worktrees: [
          { ...bareMain, status: 'clean' as const, uncommittedCount: 0, ahead: 0, behind: 0, commitSha: 'a1b2c3' },
          fullWtA,
          fullWtB,
          fullWtC,
        ],
      },
    }),
  ],
  args: baseProps,
};

/**
 * checkout_pr succeeds — panel transitions to the "success" stage showing
 * the new worktree path and git step log.
 */
export const CheckoutSuccess: Story = {
  decorators: [
    withPrDetail(approvedPr, {
      invokeResponses: {
        list_worktrees_bare: [bareMain],
        list_worktrees: [],
        checkout_pr: {
          worktreePath: '/work/wt/feature-storybook-phase11-pr-detail',
          steps: [
            { cmd: 'git worktree add', cwd: '/work/repo.git', output: 'Preparing worktree (new branch)', exitCode: 0, ok: true },
            { cmd: 'git fetch origin', cwd: '/work/repo.git', output: 'From github.com:borght-dev/BorgDock\n * branch feature/storybook-phase11-pr-detail -> FETCH_HEAD', exitCode: 0, ok: true },
          ],
        },
      },
    }),
  ],
  args: baseProps,
};

/**
 * checkout_pr throws — panel transitions to the "error" stage showing the
 * error message. Exercises the git-conflict / permission-denied failure path.
 */
export const CheckoutFailureGitConflict: Story = {
  decorators: [
    withPrDetail(approvedPr, {
      invokeResponses: {
        list_worktrees_bare: [bareMain],
        list_worktrees: [],
        checkout_pr: '__throw__',
      },
    }),
  ],
  args: baseProps,
};

/**
 * list_worktrees_bare throws on mount — panel shows the configuration error
 * state ("No worktree base path is configured…" or the raw error string).
 */
export const ListWorktreesError: Story = {
  decorators: [
    withPrDetail(approvedPr, {
      invokeResponses: {
        list_worktrees_bare: '__throw__',
        list_worktrees: '__throw__',
      },
    }),
  ],
  args: baseProps,
};
