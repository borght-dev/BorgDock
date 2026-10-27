import type { Meta, StoryObj } from '@storybook/react-vite';
import { configuredSettings, SectionFrame, withSettings } from './__fixtures__/settings-data';
import { WorkstreamsSection } from './WorkstreamsSection';

const meta: Meta<typeof WorkstreamsSection> = {
  title: 'Settings/WorkstreamsSection',
  component: WorkstreamsSection,
  decorators: [
    (Story) => (
      <SectionFrame>
        <Story />
      </SectionFrame>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof WorkstreamsSection>;

const responses = {
  workstreams_device_name: 'LAPTOP-7Q2',
  workstreams_list: [],
  workstreams_folder_path: (args: unknown) =>
    (args as { folder: string | null }).folder
      ? `${(args as { folder: string }).folder}/BorgDock Workstreams`
      : 'C:/Users/ada/AppData/Roaming/BorgDock/workstreams',
};

/** On this machine only. */
export const ThisMachine: Story = {
  decorators: [withSettings(configuredSettings, { invokeResponses: responses })],
  args: { workstreams: {}, onChange: () => {} },
};

/** In a folder a sync client shares, with a name for this machine. */
export const SyncFolder: Story = {
  decorators: [withSettings(configuredSettings, { invokeResponses: responses })],
  args: {
    workstreams: { folder: 'C:/Users/ada/OneDrive', deviceLabel: 'Laptop', notifications: true },
    onChange: () => {},
  },
};
