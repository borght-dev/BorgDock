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

    // Two ticks: let FlyoutApp's effects subscribe to the mock channels first,
    // then push state. requestAnimationFrame double-rAF is sufficient.
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
