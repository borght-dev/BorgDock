// src/components/settings/SqlSection.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { SqlSection } from './SqlSection';
import {
  configuredSettings,
  SectionFrame,
  withSettings,
} from './__fixtures__/settings-data';
import type { SqlSettings } from '@/types/settings';

const meta: Meta<typeof SqlSection> = {
  title: 'Settings/SqlSection',
  component: SqlSection,
  decorators: [(Story) => <SectionFrame><Story /></SectionFrame>],
};
export default meta;
type Story = StoryObj<typeof SqlSection>;

const noConnections: SqlSettings = { ...configuredSettings.sql, connections: [] };

const typicalSql: SqlSettings = {
  ...configuredSettings.sql,
  connections: [
    ...configuredSettings.sql.connections,
    {
      name: 'fsp-staging',
      server: 'fsp-staging.database.windows.net',
      port: 1433,
      database: 'fsp',
      authentication: 'sql',
      username: 'app',
      trustServerCertificate: false,
    },
  ],
};

export const NoConnections: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { sql: noConnections, onChange: () => {} },
};

export const Typical: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { sql: typicalSql, onChange: () => {} },
};

export const TestRunning: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        // Never resolves — spinner state.
        test_sql_connection: () => new Promise(() => {}),
      },
    }),
  ],
  args: { sql: typicalSql, onChange: () => {} },
  play: async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /test/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};

export const TestFailed: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        test_sql_connection: () => Promise.reject(
          new Error('Login failed for user "reader"')
        ),
      },
    }),
  ],
  args: { sql: typicalSql, onChange: () => {} },
  play: async () => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => /test/i.test(b.textContent ?? ''),
    );
    btn?.click();
  },
};
