import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVersionMock = vi.fn();
vi.mock('@tauri-apps/api/app', () => ({ getVersion: getVersionMock }));

const closeMock = vi.fn();
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close: closeMock }),
}));

const setLastSeenVersion = vi.fn(async () => {});
const disableAutoOpen = vi.fn(async () => {});
const hydrate = vi.fn(async () => {});
const storeState = {
  lastSeenVersion: '1.0.9',
  autoOpenDisabled: false,
  hydrated: true,
  setLastSeenVersion,
  disableAutoOpen,
  hydrate,
};
vi.mock('@/stores/whats-new-store', () => ({
  useWhatsNewStore: Object.assign(
    (selector?: (s: typeof storeState) => unknown) => {
      if (selector) return selector(storeState);
      return storeState;
    },
    {
      getState: () => storeState,
      setState: (p: Partial<typeof storeState>) => Object.assign(storeState, p),
    },
  ),
}));

vi.mock('@/generated/changelog', () => ({
  RELEASES: [
    {
      version: '1.0.11',
      date: '2026-04-14',
      summary: 'A.',
      highlights: [{ kind: 'new', title: 'A', description: 'first', hero: null, keyboard: null }],
      alsoFixed: [],
      autoOpenEligible: true,
    },
    {
      version: '1.0.10',
      date: '2026-04-01',
      summary: '',
      highlights: [],
      alsoFixed: [],
      autoOpenEligible: false,
    },
  ],
}));

import { WhatsNewApp } from '../WhatsNewApp';

beforeEach(() => {
  getVersionMock.mockResolvedValue('1.0.11');
  setLastSeenVersion.mockClear();
  disableAutoOpen.mockClear();
  hydrate.mockClear();
  closeMock.mockClear();
  storeState.lastSeenVersion = '1.0.9';
  storeState.autoOpenDisabled = false;
  storeState.hydrated = true;
});

describe('WhatsNewApp', () => {
  it('renders release head with current version and count behind', async () => {
    render(<WhatsNewApp />);
    await waitFor(() => {
      expect(screen.getByText(/what's new in/i)).toBeTruthy();
    });
    expect(screen.getByText('1.0.11')).toBeTruthy();
    expect(screen.getByText(/1 version behind|1 versions behind/i)).toBeTruthy();
  });

  it('expands the newest release by default', async () => {
    render(<WhatsNewApp />);
    await waitFor(() => {
      expect(screen.getByText('A')).toBeTruthy();
    });
  });

  it('"Got it" writes lastSeenVersion and closes the window', async () => {
    render(<WhatsNewApp />);
    await waitFor(() => screen.getByRole('button', { name: /got it/i }));
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));
    await waitFor(() => {
      expect(setLastSeenVersion).toHaveBeenCalledWith('1.0.11');
      expect(closeMock).toHaveBeenCalled();
    });
  });

  it('"Don\'t auto-open again" writes both flags', async () => {
    render(<WhatsNewApp />);
    await waitFor(() => screen.getByLabelText(/don't auto-open/i));
    fireEvent.click(screen.getByLabelText(/don't auto-open/i));
    await waitFor(() => {
      expect(disableAutoOpen).toHaveBeenCalledWith('1.0.11');
    });
  });
});
