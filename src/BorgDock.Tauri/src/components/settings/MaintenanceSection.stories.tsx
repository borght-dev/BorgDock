// src/components/settings/MaintenanceSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { MaintenanceSection } from './MaintenanceSection';
import {
  configuredSettings,
  selfTestResults,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof MaintenanceSection> = {
  title: 'Settings/MaintenanceSection',
  component: MaintenanceSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof MaintenanceSection>;

const baseInvokes = {
  get_cache_size: 1024 * 1024 * 24,
  run_self_test: selfTestResults,
  reset_all_settings: undefined,
  open_log_folder: undefined,
};

export const CacheLoaded: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        ...baseInvokes,
        clear_cache: { bytesFreed: 0 },
      },
    }),
  ],
};

export const ClearRunning: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        ...baseInvokes,
        // Never resolves — clear-cache spinner state.
        clear_cache: () => new Promise(() => {}),
      },
    }),
  ],
  play: async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /clear cache/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};

export const SelfTestCompleted: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        ...baseInvokes,
        clear_cache: { bytesFreed: 0 },
      },
    }),
  ],
  play: async () => {
    // Click "Run self test" — opens SelfTestResultsDialog after resolve.
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /self.?test/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};

export const ResetConfirmation: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        ...baseInvokes,
        clear_cache: { bytesFreed: 0 },
      },
    }),
  ],
  play: async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /reset all settings/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};
