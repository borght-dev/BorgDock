// src/components/flyout/FlyoutApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
import {
  draftPrs,
  failingPrs,
  longAuthorPrs,
  longTitlePrs,
  makeFlyoutData,
  makeFlyoutPr,
  makeToast,
  manyPrs,
  mergeConflictPrs,
  mergeReadyPrs,
  mixedPrs,
  passingPrs,
  sparsePrs,
} from './__fixtures__/flyout-data';
import { FlyoutApp } from './FlyoutApp';
import type { FlyoutData } from './FlyoutGlance';
import type { ToastPayload } from './flyout-mode';

interface FlyoutSeedPayload {
  data?: Partial<FlyoutData>;
  mode?: 'glance' | 'idle' | 'initializing';
}

interface FlyoutStoryParams {
  /** Seed pushed via window.__borgdock_test_flyout_seed once mount completes. */
  seed?: FlyoutSeedPayload;
  /** Toast payloads emitted on the 'flyout-toast' channel after mount. */
  toasts?: ToastPayload[];
  /** When set, FlyoutApp first lands in glance, then a banner is emitted. */
  bannerOnGlance?: ToastPayload;
  /** Push a 4th toast to validate FIFO trim at TOAST_MAX. */
  overflowToast?: ToastPayload;
  /** Simulate a hover on the toast queue so the auto-hide timer pauses. */
  hovered?: boolean;
}

declare global {
  interface Window {
    __borgdock_test_flyout_seed?: (payload: FlyoutSeedPayload) => void;
  }
}

function FlyoutHarness({ params }: { params: FlyoutStoryParams }) {
  useEffect(() => {
    const ctrl = getControl();
    let cancelled = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        if (params.seed && window.__borgdock_test_flyout_seed) {
          window.__borgdock_test_flyout_seed(params.seed);
        }
        if (params.bannerOnGlance) {
          ctrl.emit('flyout-toast', params.bannerOnGlance);
        }
        if (params.toasts) {
          for (const t of params.toasts) ctrl.emit('flyout-toast', t);
        }
        if (params.hovered) {
          // Allow toast container to mount, then dispatch mouseenter on it.
          // Selector: FlyoutToast.tsx tags each card with data-testid="flyout-toast-card-${id}";
          // there is no top-level "flyout-toast-container" element, and we cannot add one
          // (production code stays byte-identical). Targeting the first card is sufficient
          // because its onMouseEnter handler flips hoveredRef and clears the auto-hide timer.
          requestAnimationFrame(() => {
            const el = document.querySelector('[data-testid^="flyout-toast-card-"]');
            if (el) {
              el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            }
          });
        }
        if (params.overflowToast) {
          ctrl.emit('flyout-toast', params.overflowToast);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <div style={{ width: 460, height: 512, padding: 16 }}>
      <FlyoutApp />
    </div>
  );
}

const meta: Meta<typeof FlyoutHarness> = {
  title: 'Flyout/FlyoutApp',
  component: FlyoutHarness,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof FlyoutHarness>;

// Helper that reduces story boilerplate.
function story(params: FlyoutStoryParams): Story {
  return {
    args: { params },
  };
}

// ---------------------------------------------------------------------------
// Initializing
// ---------------------------------------------------------------------------

// No seed — FlyoutApp's reducer starts in 'initializing' and stays there
// until __borgdock_test_flyout_seed sends 'init-complete'.
export const Initializing: Story = story({});

// ---------------------------------------------------------------------------
// Glance — base data variants
// ---------------------------------------------------------------------------

export const GlanceEmpty = story({
  seed: { mode: 'glance', data: makeFlyoutData() },
});

export const GlanceAllPassing = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: passingPrs,
      passingCount: passingPrs.length,
      totalCount: passingPrs.length,
    }),
  },
});

export const GlanceAllFailing = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: failingPrs,
      failingCount: failingPrs.length,
      totalCount: failingPrs.length,
    }),
  },
});

export const GlanceMixed = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: mixedPrs,
      failingCount: 1,
      pendingCount: 1,
      passingCount: 1,
      totalCount: mixedPrs.length,
    }),
  },
});

export const GlanceFocusOnly = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: [
        makeFlyoutPr({ number: 1100, title: 'Focus PR — needs your attention' }),
        makeFlyoutPr({ number: 1101, title: 'Another focus PR' }),
      ],
      focusCount: 2,
      totalCount: 2,
    }),
  },
});

export const GlanceMany = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: manyPrs,
      totalCount: manyPrs.length,
      passingCount: manyPrs.filter((p) => p.overallStatus === 'green').length,
      failingCount: manyPrs.filter((p) => p.overallStatus === 'red').length,
      pendingCount: manyPrs.filter((p) => p.overallStatus === 'yellow').length,
    }),
  },
});

export const GlanceDraftsOnly = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: draftPrs,
      totalCount: draftPrs.length,
    }),
  },
});

export const GlanceMergeReady = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: mergeReadyPrs,
      passingCount: mergeReadyPrs.length,
      totalCount: mergeReadyPrs.length,
    }),
  },
});

export const GlanceMergeConflict = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: mergeConflictPrs,
      pendingCount: mergeConflictPrs.length,
      totalCount: mergeConflictPrs.length,
    }),
  },
});

export const GlanceLongTitles = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: longTitlePrs,
      passingCount: longTitlePrs.length,
      totalCount: longTitlePrs.length,
    }),
  },
});

export const GlanceLongAuthors = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: longAuthorPrs,
      passingCount: longAuthorPrs.length,
      totalCount: longAuthorPrs.length,
    }),
  },
});

export const GlanceSparseFields = story({
  seed: {
    mode: 'glance',
    data: makeFlyoutData({
      pullRequests: sparsePrs,
      totalCount: sparsePrs.length,
    }),
  },
});

// ---------------------------------------------------------------------------
// Glance — banner overlay
// ---------------------------------------------------------------------------

const glanceWithPassing = (overrides = {}) =>
  makeFlyoutData({
    pullRequests: passingPrs,
    passingCount: passingPrs.length,
    totalCount: passingPrs.length,
    ...overrides,
  });

export const GlanceBannerInfo = story({
  seed: { mode: 'glance', data: glanceWithPassing() },
  bannerOnGlance: makeToast({
    id: 'banner-info',
    severity: 'info',
    title: 'Heads up',
    body: 'A new release of BorgDock is available.',
  }),
});

export const GlanceBannerSuccess = story({
  seed: { mode: 'glance', data: glanceWithPassing() },
  bannerOnGlance: makeToast({
    id: 'banner-success',
    severity: 'success',
    title: 'PR merged',
    body: 'borght-dev/BorgDock#42 was merged successfully.',
  }),
});

export const GlanceBannerWarning = story({
  seed: { mode: 'glance', data: glanceWithPassing() },
  bannerOnGlance: makeToast({
    id: 'banner-warn',
    severity: 'warning',
    title: 'Approaching API rate limit',
    body: 'GitHub API requests will be throttled in ~3 minutes.',
  }),
});

export const GlanceBannerError = story({
  seed: { mode: 'glance', data: glanceWithPassing() },
  bannerOnGlance: makeToast({
    id: 'banner-err',
    severity: 'error',
    title: 'Token expired',
    body: 'Re-authenticate in Settings to resume polling.',
  }),
});

// ---------------------------------------------------------------------------
// Toast — queue size
// ---------------------------------------------------------------------------

const toastFromIdle = (toasts: ToastPayload[]): FlyoutStoryParams => ({
  seed: { mode: 'idle' },
  toasts,
});

export const Toast1Card = story(
  toastFromIdle([
    makeToast({
      id: 't1',
      title: 'Build failed',
      severity: 'error',
      body: 'ci/test failed on main.',
    }),
  ]),
);

export const Toast2Cards = story(
  toastFromIdle([
    makeToast({ id: 't2a', title: 'Build queued', severity: 'info', body: 'Waiting for runner.' }),
    makeToast({
      id: 't2b',
      title: 'Build started',
      severity: 'info',
      body: 'ci/build is running.',
    }),
  ]),
);

export const Toast3Cards = story(
  toastFromIdle([
    makeToast({ id: 't3a', title: 'PR opened', severity: 'info' }),
    makeToast({ id: 't3b', title: 'Checks running', severity: 'info' }),
    makeToast({ id: 't3c', title: 'Checks passed', severity: 'success' }),
  ]),
);

// ---------------------------------------------------------------------------
// Toast — per-severity (single card)
// ---------------------------------------------------------------------------

export const ToastSeverityInfo = story(
  toastFromIdle([makeToast({ id: 'sev-info', severity: 'info', title: 'FYI' })]),
);

export const ToastSeveritySuccess = story(
  toastFromIdle([makeToast({ id: 'sev-ok', severity: 'success', title: 'Merged' })]),
);

export const ToastSeverityWarning = story(
  toastFromIdle([makeToast({ id: 'sev-warn', severity: 'warning', title: 'Heads up' })]),
);

export const ToastSeverityError = story(
  toastFromIdle([makeToast({ id: 'sev-err', severity: 'error', title: 'Build failed' })]),
);

// ---------------------------------------------------------------------------
// Toast — per-action variant
// ---------------------------------------------------------------------------

export const ToastActionOpenPr = story(
  toastFromIdle([
    makeToast({
      id: 'act-open',
      title: 'PR ready for review',
      severity: 'info',
      prOwner: 'borght-dev',
      prRepo: 'BorgDock',
      prNumber: 42,
      actions: [{ label: 'Open PR', action: 'open-pr' }],
    }),
  ]),
);

export const ToastActionFixPr = story(
  toastFromIdle([
    makeToast({
      id: 'act-fix',
      title: 'CI failing',
      severity: 'error',
      prOwner: 'borght-dev',
      prRepo: 'BorgDock',
      prNumber: 43,
      actions: [{ label: 'Fix with Claude', action: 'fix-pr' }],
    }),
  ]),
);

export const ToastActionMonitorPr = story(
  toastFromIdle([
    makeToast({
      id: 'act-mon',
      title: 'Long-running build',
      severity: 'warning',
      prOwner: 'borght-dev',
      prRepo: 'BorgDock',
      prNumber: 44,
      actions: [{ label: 'Monitor', action: 'monitor-pr' }],
    }),
  ]),
);

export const ToastActionOpenUrl = story(
  toastFromIdle([
    makeToast({
      id: 'act-url',
      title: 'Release notes',
      severity: 'info',
      actions: [
        {
          label: 'Read',
          action: 'open-url',
          url: 'https://github.com/borght-dev/BorgDock/releases',
        },
      ],
    }),
  ]),
);

export const ToastActionMergePr = story(
  toastFromIdle([
    makeToast({
      id: 'act-merge',
      title: 'Mergeable',
      severity: 'success',
      prOwner: 'borght-dev',
      prRepo: 'BorgDock',
      prNumber: 45,
      actions: [
        {
          label: 'Merge',
          action: 'merge-pr',
          url: 'https://github.com/borght-dev/BorgDock/pull/45',
        },
      ],
    }),
  ]),
);

export const ToastActionStartReview = story(
  toastFromIdle([
    makeToast({
      id: 'act-rev',
      title: 'Awaiting your review',
      severity: 'info',
      prOwner: 'borght-dev',
      prRepo: 'BorgDock',
      prNumber: 46,
      actions: [
        {
          label: 'Start review',
          action: 'start-review',
          url: 'https://github.com/borght-dev/BorgDock/pull/46',
        },
      ],
    }),
  ]),
);

// ---------------------------------------------------------------------------
// Toast — interaction states + overflow
// ---------------------------------------------------------------------------

export const ToastHovered = story({
  ...toastFromIdle([
    makeToast({ id: 'hov-1', title: 'Build started', severity: 'info' }),
    makeToast({ id: 'hov-2', title: 'Tests running', severity: 'info' }),
    makeToast({ id: 'hov-3', title: 'Lint failed', severity: 'error' }),
  ]),
  hovered: true,
});

export const ToastNoActions = story(
  toastFromIdle([
    makeToast({
      id: 'noact',
      title: 'Background sync complete',
      severity: 'success',
      actions: [],
    }),
  ]),
);

export const ToastLongBody = story(
  toastFromIdle([
    makeToast({
      id: 'long',
      title: 'A title that is itself fairly long but reasonable',
      severity: 'warning',
      body:
        'This body is intentionally written to exceed the comfortable single-card height so we ' +
        'can verify wrap, truncate, and clip behavior at the 340x~160px card budget defined in ' +
        'FlyoutApp.tsx around line 250. It should never overflow the window edge.',
    }),
  ]),
);

export const ToastOverflow = story({
  ...toastFromIdle([
    makeToast({ id: 'ovf-1', title: 'Toast 1', severity: 'info' }),
    makeToast({ id: 'ovf-2', title: 'Toast 2', severity: 'info' }),
    makeToast({ id: 'ovf-3', title: 'Toast 3', severity: 'info' }),
  ]),
  overflowToast: makeToast({
    id: 'ovf-4',
    title: 'Toast 4 (oldest is dropped)',
    severity: 'success',
  }),
});
