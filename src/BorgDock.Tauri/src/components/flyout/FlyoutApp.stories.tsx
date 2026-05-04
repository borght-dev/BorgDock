// src/components/flyout/FlyoutApp.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { getControl } from '../../../.storybook/mocks/control';
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
