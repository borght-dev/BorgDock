// src/App.hero.stories.tsx
//
// Screenshot-targeted hero stories for the main window. These story bodies
// are the Phase 12 deliverable; parameters.screenshot annotations land in
// the separate screenshot-pipeline PR that follows.
//
// Meta uses no shared decorator because the four stories split between two
// frame types (HeroCompositionFrame for Hero_ReadmeMain, MainWindowFrame for
// the three Hero_Doc* single-window shots). Per-story decorators keep the
// meta-level decorator out of the picture so each story fully controls its
// own frame.

import type { Meta, StoryObj } from '@storybook/react-vite';
import App from './App';
import {
  freezeAnimations,
  HeroCompositionFrame,
  MainWindowFrame,
  PRS_CANONICAL,
  reposSettings,
  WORK_ITEMS_CANONICAL,
  withMainWindow,
} from './components/main/__fixtures__/main-window-data';
import { PrDetailApp } from './components/pr-detail/PRDetailApp';

const meta: Meta<typeof App> = {
  title: 'Main Window/App/Screenshots',
  component: App,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof App>;

// ── Hero_ReadmeMain ───────────────────────────────────────────
//
// Composed scene: sidebar (App) + PR Detail (PrDetailApp) side-by-side in
// HeroCompositionFrame. Both windows share the same Zustand stores because
// they render in the same JS context (a single Storybook iframe). The seed
// must be coherent across both:
//
//   - usePrStore.pullRequests includes PR #42 (the PR that PrDetailApp will
//     hydrate via getOpenPRs).
//   - window.__BORGDOCK_PR_DETAIL__ is set to { owner, repo, number: 42 }
//     so PrDetailApp reads the correct params on mount.
//   - githubResponses.getOpenPRs returns the bare PullRequest[] that
//     PrDetailApp fetches (PRS_CANONICAL contains PullRequestWithChecks[];
//     extracting .pullRequest gives the bare shape getOpenPRs expects).
//   - getCheckRunsForRef returns the checks for PR #42's headRef so the
//     PR Detail panel renders CI status correctly.
//   - window_ready is registered as an invoke stub so PrDetailApp's
//     reveal effect resolves silently (DEFAULT_INVOKES covers load_settings
//     and cache_init; window_ready is specific to PrDetailApp).

const PR_42 = PRS_CANONICAL.find((p) => p.pullRequest.number === 42)!;

export const Hero_ReadmeMain: Story = {
  decorators: [
    freezeAnimations,
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
      invokeResponses: {
        window_ready: undefined,
      },
      githubResponses: {
        getOpenPRs: PRS_CANONICAL.map((p) => p.pullRequest),
        getCheckRunsForRef: PR_42.checks,
      },
    }),
    (Story) => {
      (window as unknown as Record<string, unknown>).__BORGDOCK_PR_DETAIL__ = {
        owner: 'borght-dev',
        repo: 'BorgDock',
        number: 42,
      };
      return (
        <HeroCompositionFrame>
          <Story />
          <PrDetailApp />
        </HeroCompositionFrame>
      );
    },
  ],
};

// ── Hero_DocFocusList ─────────────────────────────────────────
//
// Single-window shot of the focus section — the priority-ranked list that
// surfaces the PRs the user should act on first. Drives usePrStore with
// PRS_CANONICAL so usePriorities has PRs to sort.

export const Hero_DocFocusList: Story = {
  decorators: [
    freezeAnimations,
    withMainWindow({
      ui: { activeSection: 'focus' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
    }),
    (Story) => (
      <MainWindowFrame>
        <Story />
      </MainWindowFrame>
    ),
  ],
};

// ── Hero_DocPrsList ───────────────────────────────────────────
//
// Single-window shot of the PRs section — the grouped, sortable PR list.
// Same PRS_CANONICAL seed as the focus section so the list is populated.

export const Hero_DocPrsList: Story = {
  decorators: [
    freezeAnimations,
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
    }),
    (Story) => (
      <MainWindowFrame>
        <Story />
      </MainWindowFrame>
    ),
  ],
};

// ── Hero_DocWorkItems ─────────────────────────────────────────
//
// Single-window shot of the work items section. Drives useWorkItemsStore
// with WORK_ITEMS_CANONICAL (three ADO tasks spanning Active / New / Resolved).

export const Hero_DocWorkItems: Story = {
  decorators: [
    freezeAnimations,
    withMainWindow({
      ui: { activeSection: 'workitems' },
      workItems: WORK_ITEMS_CANONICAL,
      settings: reposSettings(),
    }),
    (Story) => (
      <MainWindowFrame>
        <Story />
      </MainWindowFrame>
    ),
  ],
};
