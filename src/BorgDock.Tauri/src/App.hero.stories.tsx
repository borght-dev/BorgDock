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
import { screenshot } from '../.storybook/screenshot';
import App from './App';
import {
  CHECKS_FOR_REF,
  freezeAnimations,
  HeroCompositionFrame,
  MainWindowFrame,
  PRS_CANONICAL,
  reposSettings,
  SETTINGS_BASELINE,
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
//   - getCheckRunsForRef returns CHECKS_FOR_REF.default (a non-empty
//     CheckRun[]) so the PR Detail panel renders visible CI status. The
//     wrapped PR_42.checks array is empty in BASE_PR_WITH_CHECKS, which
//     would leave the right column thin.
//   - load_settings invoke is seeded with SETTINGS_BASELINE — PrDetailApp's
//     hydration calls invoke('load_settings') directly and immediately
//     reads settings.ui?.theme. Without a real settings shape, that throws
//     TypeError and the panel surfaces "Failed to load pull request"
//     instead of the intended detail view (mirrors PRDetailApp.stories.tsx).
//   - window_ready is registered as a no-op invoke stub so PrDetailApp's
//     reveal effect resolves silently.

export const Hero_ReadmeMain: Story = {
  parameters: screenshot({
    output: 'docs/hero/readme-main.png',
    width: 1600,
    height: 1000,
  }),
  decorators: [
    freezeAnimations,
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
      invokeResponses: {
        load_settings: SETTINGS_BASELINE,
        window_ready: undefined,
      },
      githubResponses: {
        getOpenPRs: PRS_CANONICAL.map((p) => p.pullRequest),
        getCheckRunsForRef: CHECKS_FOR_REF.default,
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
  parameters: screenshot({
    output: 'docs/hero/doc-focus-list.png',
    width: 480,
    height: 800,
  }),
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
  parameters: screenshot({
    output: 'docs/hero/doc-prs-list.png',
    width: 480,
    height: 800,
  }),
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
  parameters: screenshot({
    output: 'docs/hero/doc-work-items.png',
    width: 480,
    height: 800,
  }),
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
