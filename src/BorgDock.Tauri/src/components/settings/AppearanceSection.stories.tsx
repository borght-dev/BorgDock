// src/components/settings/AppearanceSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { BothThemes } from '@/test-support/story-themes';
import { configuredSettings, SectionFrame, withSettings } from './__fixtures__/settings-data';
import { AppearanceSection } from './AppearanceSection';

const meta: Meta<typeof AppearanceSection> = {
  title: 'Settings/AppearanceSection',
  component: AppearanceSection,
  decorators: [
    (Story) => (
      <SectionFrame>
        <Story />
      </SectionFrame>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AppearanceSection>;

export const Default: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { ui: configuredSettings.ui, onChange: () => {} },
};

export const HotkeyRecording: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { ui: configuredSettings.ui, onChange: () => {} },
  play: async () => {
    // Click the first HotkeyRecorder to put it into capture state. If the
    // recorder uses a button to start capture, this should toggle it.
    const recorder = document.querySelector<HTMLButtonElement>('#field-global-hotkey button');
    recorder?.click();
  },
};

export const AutostartFailure: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: { 'autostart.enable': '__throw__' },
    }),
  ],
  args: { ui: configuredSettings.ui, onChange: () => {} },
  play: async () => {
    // Click the "Run at startup" toggle. If currently off, this calls
    // enable() — which the mock rejects, exercising production's catch.
    const toggle = document.querySelector<HTMLElement>('#field-run-at-startup [role="switch"]');
    toggle?.click();
  },
};

/** Theme, motion and layout in one panel, porcelain and graphite side by side. */
export const BothThemesSideBySide: Story = {
  decorators: [withSettings(configuredSettings)],
  globals: { theme: 'light' },
  args: { ui: configuredSettings.ui, onChange: () => {} },
  render: (args) => <BothThemes>{() => <AppearanceSection {...args} />}</BothThemes>,
};
