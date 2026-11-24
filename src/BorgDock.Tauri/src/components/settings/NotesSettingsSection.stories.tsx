import type { Meta, StoryObj } from '@storybook/react-vite';
import { configuredSettings, SectionFrame, withSettings } from './__fixtures__/settings-data';
import { NotesSettingsSection } from './NotesSettingsSection';

const meta: Meta<typeof NotesSettingsSection> = {
  title: 'Settings/NotesSettingsSection',
  component: NotesSettingsSection,
  decorators: [
    (Story) => (
      <SectionFrame>
        <Story />
      </SectionFrame>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof NotesSettingsSection>;

const responses = {
  notes_list: { notes: [], folders: ['Daily', 'Projects', 'Templates'] },
  notes_folder_path: (args: unknown) => {
    const { folder } = args as { folder: string | null };
    return folder ? `${folder}/BorgDock Notes` : 'C:/Users/ada/AppData/Roaming/BorgDock/notes';
  },
};

/** The vault on this machine only. */
export const ThisMachine: Story = {
  decorators: [withSettings(configuredSettings, { invokeResponses: responses })],
  args: { settings: configuredSettings, onChange: () => {} },
};

/** The vault in a folder a sync client shares, with a folder picked for daily notes. */
export const SyncFolder: Story = {
  decorators: [withSettings(configuredSettings, { invokeResponses: responses })],
  args: {
    settings: {
      ...configuredSettings,
      notesSyncFolder: 'C:/Users/ada/OneDrive',
      dailyNoteFolder: 'Daily',
    },
    onChange: () => {},
  },
};
