// src/components/settings/ConnectionEditorDialog.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConnectionEditorDialog } from './ConnectionEditorDialog';
import {
  configuredSettings,
  withSettings,
} from './__fixtures__/settings-data';

const meta: Meta<typeof ConnectionEditorDialog> = {
  title: 'Settings/Dialogs/ConnectionEditorDialog',
  component: ConnectionEditorDialog,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof ConnectionEditorDialog>;

export const New: Story = {
  decorators: [withSettings(configuredSettings)],
  args: {
    index: 'new',
    sql: configuredSettings.sql,
    onClose: () => {},
    onSave: () => {},
  },
};

export const EditExisting: Story = {
  decorators: [withSettings(configuredSettings)],
  args: {
    index: 0,
    sql: configuredSettings.sql,
    onClose: () => {},
    onSave: () => {},
  },
};
