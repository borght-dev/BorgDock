// src/App.hero.stories.tsx
//
// Screenshot-targeted hero stories + cross-window animation stories for the
// main window.
//
// Meta uses no shared decorator because the stories split between multiple
// frame types. Per-story decorators keep the meta-level decorator out of the
// picture so each story fully controls its own frame.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { userEvent, within } from 'storybook/test';
import { animation, screenshot } from '../.storybook/screenshot';
import App from './App';
import {
  CHECKS_FOR_REF,
  CrossWindowShell,
  freezeAnimations,
  HeroCompositionFrame,
  MainWindowFrame,
  PRS_CANONICAL,
  PRS_FOCUS_DEMO,
  reposSettings,
  SETTINGS_BASELINE,
  WORK_ITEMS_CANONICAL,
  withMainWindow,
} from './components/main/__fixtures__/main-window-data';
import { PrDetailApp } from './components/pr-detail/PRDetailApp';
import {
  connBorgDockDev,
  makeSettings,
  resultSmallSelect,
  sampleSelectQuery,
  schemaSmall,
} from './components/sql/__fixtures__/sql-data';
import { SqlApp } from './components/sql/SqlApp';

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// SQL localStorage keys — cleared before the SQL cross-window story mounts
// so SqlApp starts from a clean slate (no leftover rail / position / query).
const SQL_LOCALSTORAGE_KEYS = [
  'borgdock-sql-position',
  'borgdock-sql-last-query',
  'borgdock.sql.railWidth',
  'borgdock.sql.railCollapsed',
  'borgdock.sql.editorHeight',
  'borgdock.sql.activeSnippet',
  'borgdock.sql.snippets',
];

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
      pullRequests: PRS_FOCUS_DEMO,
      settings: {
        ...reposSettings(),
        gitHub: { username: 'borght-dev' },
      },
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

// ── Hero_GalleryMainPrs ───────────────────────────────────────
//
// Wider PRs-section shot for the marketing site gallery. Same data as
// Hero_DocPrsList but at a width where the filter pills sit on a single
// row instead of wrapping. Output goes directly into site/public/, so
// the gallery page can <img src="/screenshots/main-prs.png"> without a
// separate copy step.

export const Hero_GalleryMainPrs: Story = {
  parameters: screenshot({
    output: 'site/public/screenshots/main-prs.png',
    width: 720,
    height: 900,
  }),
  decorators: [
    freezeAnimations,
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
    }),
    (Story) => (
      <MainWindowFrame width={720} height={900}>
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

// ── Anim_OpenPrDetailWindow ───────────────────────────────────
//
// Cross-window composition: sidebar (App, PRs section) + PR Detail panel.
// PR Detail starts off-screen; when the user clicks PR card #42, the
// production invoke('open_pr_detail_window') path fires. The decorator
// intercepts that invoke and calls window.__BORGDOCK_SLIDE_OPEN__() which
// flips the CrossWindowShell state → slide-in transition plays.
//
// Store seeding mirrors Hero_ReadmeMain so the PR Detail panel has coherent
// data. The invokeResponse handler is installed AFTER withMainWindow seeds
// the default invokes so it wins over the DEFAULT_INVOKES no-op.

// Slide-open invoke callback: reads window.__BORGDOCK_SLIDE_OPEN__ at
// call time (not setup time) so CrossWindowShell's useEffect has already
// registered it by the time the PR card click fires. Defined at module
// scope so it can be passed by reference into invokeResponses (which is
// evaluated at decorator setup time inside withMainWindow).
function slideOpenInvokeResponse() {
  const fn = (window as unknown as Record<string, unknown>).__BORGDOCK_SLIDE_OPEN__;
  if (typeof fn === 'function') (fn as () => void)();
  return undefined;
}

export const Anim_OpenPrDetailWindow: Story = {
  parameters: animation({
    output: 'site/public/anim/cross-pr-detail-open.gif',
    width: 1600,
    height: 1000,
    fps: 12,
    duration: 6500,
  }),
  decorators: [
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_CANONICAL,
      settings: reposSettings(),
      invokeResponses: {
        load_settings: SETTINGS_BASELINE,
        window_ready: undefined,
        // Intercept the production open_pr_detail_window invoke and trigger
        // the slide-in animation. The callback is late-bound via
        // window.__BORGDOCK_SLIDE_OPEN__ so CrossWindowShell's useEffect has
        // already registered it by the time the PR card click fires.
        open_pr_detail_window: slideOpenInvokeResponse,
      },
      githubResponses: {
        getOpenPRs: PRS_CANONICAL.map((p) => p.pullRequest),
        getCheckRunsForRef: CHECKS_FOR_REF.default,
      },
    }),
    (Story) => {
      // Set the PR Detail params so PrDetailApp hydrates PR #42 on mount.
      (window as unknown as Record<string, unknown>).__BORGDOCK_PR_DETAIL__ = {
        owner: 'borght-dev',
        repo: 'BorgDock',
        number: 42,
      };

      return (
        <CrossWindowShell
          left={<Story />}
          right={<PrDetailApp />}
          leftWidth={480}
          height={1000}
          totalWidth={1600}
        />
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await pause(1000);
    // Click the PR #42 card by its title text
    const card = await c.findByText(/storybook phase 12/i);
    await userEvent.click(card);
    await pause(2800);
  },
};

// ── Anim_OpenSqlWindowHotkey ──────────────────────────────────
//
// Cross-window composition: sidebar (App, PRs section) + SQL window.
// In production, Ctrl+F10 is a system hotkey handled by Tauri's hotkey
// module — it doesn't propagate to the browser/Storybook layer. Here we
// drive the slide directly from the play function via the
// window.__BORGDOCK_SLIDE_OPEN__ escape hatch, which visually represents
// "the SQL window just appeared" without needing the OS hotkey path.
//
// SqlApp is seeded with one connection (connBorgDockDev) + a small schema
// so the right column renders a real SQL editor rather than an empty state.

export const Anim_OpenSqlWindowHotkey: Story = {
  parameters: animation({
    output: 'site/public/anim/cross-sql-hotkey.gif',
    width: 1600,
    height: 950,
    fps: 12,
    duration: 5500,
  }),
  decorators: [
    // All invokes go through withMainWindow so the clear+assign cycle is the
    // single source of truth. SQL localStorage is cleaned in the frame decorator
    // via useMemo BEFORE withMainWindow reruns — that's fine because localStorage
    // is not wiped by withMainWindow.
    withMainWindow({
      ui: { activeSection: 'prs' },
      pullRequests: PRS_CANONICAL,
      // load_settings must satisfy BOTH App (needs repos/gitHub/ui) AND SqlApp
      // (needs sql.connections). makeSettings includes all required App fields.
      settings: reposSettings(),
      invokeResponses: {
        // SqlApp invoke responses — all passed here so withMainWindow's single
        // clear+assign cycle seats them correctly before any component mounts.
        load_settings: makeSettings([connBorgDockDev]),
        window_ready: undefined,
        fetch_sql_schema: schemaSmall,
        cache_load_sql_schema: null,
        cache_save_sql_schema: undefined,
        execute_sql_query: resultSmallSelect,
        sql_snippets_list: [],
        sql_snippets_save: undefined,
        sql_snippets_delete: undefined,
      },
    }),
    (Story) => {
      // Clear SqlApp localStorage before mount so the editor starts clean.
      // useMemo here is fine — localStorage is unaffected by withMainWindow.
      useMemo(() => {
        for (const key of SQL_LOCALSTORAGE_KEYS) {
          try {
            localStorage.removeItem(key);
          } catch {
            /* ignore */
          }
        }
        // Pre-populate a query so the editor looks active on first render
        try {
          localStorage.setItem('borgdock-sql-last-query', sampleSelectQuery);
        } catch {
          /* ignore */
        }
      }, []);

      return (
        <CrossWindowShell
          left={<Story />}
          right={<SqlApp />}
          leftWidth={480}
          height={950}
          totalWidth={1600}
        />
      );
    },
  ],
  play: async () => {
    // Wait for both sides to render, then trigger the slide-in directly.
    // (Ctrl+F10 is a system hotkey and won't propagate through Storybook.)
    await pause(1200);
    const fn = (window as unknown as Record<string, unknown>).__BORGDOCK_SLIDE_OPEN__;
    if (typeof fn === 'function') (fn as () => void)();
    await pause(2500);
  },
};
