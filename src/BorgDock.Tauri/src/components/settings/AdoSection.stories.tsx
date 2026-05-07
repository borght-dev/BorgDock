// src/components/settings/AdoSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdoSection } from './AdoSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import type { AzureDevOpsSettings } from '@/types/settings';

const meta: Meta<typeof AdoSection> = {
  title: 'Settings/AdoSection',
  component: AdoSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof AdoSection>;

const noConnection: AzureDevOpsSettings = {
  ...configuredSettings.azureDevOps,
  organization: '',
  project: '',
};

export const NoConnection: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { az_cli_available: true },
    }),
  ],
  args: { azureDevOps: noConnection, onChange: () => {} },
};

export const OneConnection: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { az_cli_available: true },
    }),
  ],
  args: { azureDevOps: configuredSettings.azureDevOps, onChange: () => {} },
};

export const EditorOpen: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { az_cli_available: true },
    }),
  ],
  args: { azureDevOps: configuredSettings.azureDevOps, onChange: () => {} },
  play: async () => {
    // Click the "Edit" / "Connection" button if present.
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /edit|connection/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};

export const AzCliNotAvailable: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { az_cli_available: false },
    }),
  ],
  args: { azureDevOps: noConnection, onChange: () => {} },
};
