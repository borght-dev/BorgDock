import type { Meta, StoryObj } from '@storybook/react-vite';
import type { T3HostSettings } from '@/types/settings';
import { configuredSettings, SectionFrame, withSettings } from './__fixtures__/settings-data';
import { T3HostsCard } from './T3HostsCard';

const meta: Meta<typeof T3HostsCard> = {
  title: 'Settings/T3HostsCard',
  component: T3HostsCard,
  decorators: [
    (Story) => (
      <SectionFrame>
        <Story />
      </SectionFrame>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof T3HostsCard>;

const hosts: T3HostSettings[] = [
  { id: 'mac', label: 'Mac mini', baseUrl: 'http://mac-mini:3773' },
  { id: 'vm', label: 'Build VM', baseUrl: 'http://build-vm:3773' },
  { id: 'old', label: 'Old laptop', baseUrl: 'http://old-laptop:3773' },
];

const PROBES: Record<string, { running: boolean; paired: boolean }> = {
  mac: { running: true, paired: true },
  vm: { running: true, paired: false },
  old: { running: false, paired: false },
};

const probe = (args: unknown) => PROBES[(args as { host: { id: string } }).host.id];

export const NoHosts: Story = {
  decorators: [withSettings(configuredSettings)],
  args: { hosts: [], onChange: () => {} },
};

export const ThreeHosts: Story = {
  decorators: [withSettings(configuredSettings, { invokeResponses: { t3_probe: probe } })],
  args: { hosts, onChange: () => {} },
};
