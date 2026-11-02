import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEFAULT_PHONE_LINK } from '@/types/settings';
import qrSvg from './__fixtures__/phone-link-qr.svg?raw';
import { configuredSettings, SectionFrame, withSettings } from './__fixtures__/settings-data';
import { PhoneLinkCard } from './PhoneLinkCard';

const meta: Meta<typeof PhoneLinkCard> = {
  title: 'Settings/PhoneLinkCard',
  component: PhoneLinkCard,
  decorators: [
    (Story) => (
      <SectionFrame>
        <Story />
      </SectionFrame>
    ),
  ],
  args: { phoneLink: DEFAULT_PHONE_LINK, onChange: () => {} },
};
export default meta;
type Story = StoryObj<typeof PhoneLinkCard>;

const unlinked = { linked: false, server: null, serverName: null };

export const Unlinked: Story = {
  decorators: [
    withSettings(configuredSettings, { invokeResponses: { phone_link_state: unlinked } }),
  ],
};

/** After Link iPhone: the QR, the code and the wait for the phone. */
export const WaitingForIPhone: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        phone_link_state: unlinked,
        phone_link_start: {
          linkId: 'link-1',
          code: 'K7PX-42QM',
          expiresAt: '2026-10-31T10:10:00.000Z',
          link: 'borgdock://link-desktop?server=https%3A%2F%2Fgomocha-mac-mini-nl.tail5e171a.ts.net%2Fborgdock&code=K7PX-42QM',
          qrSvg,
        },
        phone_link_poll: { status: 'pending' },
      },
    }),
  ],
  play: async () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const button = Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent === 'Link iPhone' && !b.disabled,
      );
      if (button) {
        button.click();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  },
};

export const Linked: Story = {
  decorators: [
    withSettings(configuredSettings, {
      invokeResponses: {
        phone_link_state: {
          linked: true,
          server: 'https://gomocha-mac-mini-nl.tail5e171a.ts.net/borgdock',
          serverName: 'Mac mini',
        },
      },
    }),
  ],
};

/** Linked, with presence shared but reads kept to this desktop. */
export const LinkedReadsOff: Story = {
  ...Linked,
  args: { phoneLink: { ...DEFAULT_PHONE_LINK, shareReads: false }, onChange: () => {} },
};
