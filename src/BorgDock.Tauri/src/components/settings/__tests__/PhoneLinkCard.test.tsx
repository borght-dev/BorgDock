import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PHONE_LINK } from '@/types/settings';
import { LINK_POLL_MS, PhoneLinkCard } from '../PhoneLinkCard';

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  start: vi.fn(),
  poll: vi.fn(),
  unlink: vi.fn(),
  cancel: vi.fn(),
  linkChanged: undefined as (() => void) | undefined,
}));

const ok = <T,>(data: T) => Promise.resolve({ status: 'ok' as const, data });

vi.mock('@/generated/commands', () => ({
  commands: {
    phoneLinkState: mocks.state,
    phoneLinkStart: mocks.start,
    phoneLinkPoll: mocks.poll,
    phoneLinkUnlink: mocks.unlink,
    phoneLinkCancel: mocks.cancel,
  },
  events: {
    phoneLinkChanged: {
      listen: vi.fn(async (handler: () => void) => {
        mocks.linkChanged = handler;
        return () => {};
      }),
    },
  },
}));

const unlinked = { linked: false, server: null, serverName: null };
const started = {
  linkId: 'link-1',
  code: 'K7PX-42QM',
  expiresAt: '2026-10-31T10:10:00.000Z',
  link: 'borgdock://link-desktop?server=x&code=K7PX-42QM',
  qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
};

describe('PhoneLinkCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.state.mockImplementation(() => ok(unlinked));
    mocks.start.mockImplementation(() => ok(started));
    mocks.poll.mockImplementation(() => ok({ status: 'pending' }));
    mocks.unlink.mockImplementation(() => ok(null));
    mocks.cancel.mockImplementation(() => ok(null));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const flush = () => act(async () => {});

  it('links: shows the code and QR, waits, then shows the server it linked to', async () => {
    render(<PhoneLinkCard phoneLink={DEFAULT_PHONE_LINK} onChange={() => {}} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Link iPhone' }));
    await flush();

    expect(mocks.start).toHaveBeenCalledWith(DEFAULT_PHONE_LINK.serverUrl);
    expect(screen.getByText('K7PX-42QM')).toBeTruthy();
    expect(screen.getByAltText('QR code to link this desktop')).toBeTruthy();
    expect(screen.getByText('Waiting for your iPhone…')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LINK_POLL_MS);
    });
    expect(mocks.poll).toHaveBeenCalledWith('link-1');
    expect(screen.getByText('Waiting for your iPhone…')).toBeTruthy();

    mocks.poll.mockImplementation(() => ok({ status: 'approved', serverName: 'Mac mini' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LINK_POLL_MS);
    });
    expect(screen.getByText('Linked to Mac mini')).toBeTruthy();
    expect(screen.queryByText('Waiting for your iPhone…')).toBeNull();
  });

  it('waits for each poll to answer before it asks again', async () => {
    let answer: (value: {
      status: 'ok';
      data: { status: 'approved'; serverName: string };
    }) => void = () => {};
    mocks.poll.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    render(<PhoneLinkCard phoneLink={DEFAULT_PHONE_LINK} onChange={() => {}} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Link iPhone' }));
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LINK_POLL_MS * 4);
    });
    expect(mocks.poll).toHaveBeenCalledTimes(1);

    await act(async () => {
      answer({ status: 'ok', data: { status: 'approved', serverName: 'Mac mini' } });
    });
    expect(screen.getByText('Linked to Mac mini')).toBeTruthy();
  });

  it('cancels the waiting link when you cancel or close Settings', async () => {
    const { unmount } = render(
      <PhoneLinkCard phoneLink={DEFAULT_PHONE_LINK} onChange={() => {}} />,
    );
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Link iPhone' }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.cancel).toHaveBeenCalledWith('link-1');

    fireEvent.click(screen.getByRole('button', { name: 'Link iPhone' }));
    await flush();
    unmount();
    expect(mocks.cancel).toHaveBeenCalledTimes(2);
  });

  it('shows Link again when the link is cleared in the background', async () => {
    mocks.state.mockImplementation(() =>
      ok({ linked: true, server: 'https://mini/borgdock', serverName: 'Mac mini' }),
    );
    render(<PhoneLinkCard phoneLink={DEFAULT_PHONE_LINK} onChange={() => {}} />);
    await flush();
    expect(screen.getByText('Linked to Mac mini')).toBeTruthy();

    mocks.state.mockImplementation(() => ok(unlinked));
    await act(async () => {
      mocks.linkChanged?.();
    });
    expect(screen.getByRole('button', { name: 'Link iPhone' })).toBeTruthy();
    expect(screen.queryByText('Linked to Mac mini')).toBeNull();
  });

  it('says so when the code expires', async () => {
    mocks.poll.mockImplementation(() => ok({ status: 'expired' }));
    render(<PhoneLinkCard phoneLink={DEFAULT_PHONE_LINK} onChange={() => {}} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Link iPhone' }));
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LINK_POLL_MS);
    });
    expect(screen.getByRole('status').textContent).toMatch(/expired/);
    expect(screen.getByRole('button', { name: 'Link iPhone' })).toBeTruthy();
  });

  it('stores a changed server address when linking', async () => {
    const onChange = vi.fn();
    render(<PhoneLinkCard phoneLink={DEFAULT_PHONE_LINK} onChange={onChange} />);
    await flush();
    fireEvent.change(screen.getByLabelText('Server address'), {
      target: { value: 'https://other.example/borgdock' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Link iPhone' }));
    await flush();
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_PHONE_LINK,
      serverUrl: 'https://other.example/borgdock',
    });
    expect(mocks.start).toHaveBeenCalledWith('https://other.example/borgdock');
  });

  it('unlinks', async () => {
    mocks.state.mockImplementation(() =>
      ok({ linked: true, server: 'https://mini/borgdock', serverName: 'Mac mini' }),
    );
    render(<PhoneLinkCard phoneLink={DEFAULT_PHONE_LINK} onChange={() => {}} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }));
    await flush();
    expect(mocks.unlink).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Link iPhone' })).toBeTruthy();
  });

  it('turns sharing off', async () => {
    const onChange = vi.fn();
    render(<PhoneLinkCard phoneLink={DEFAULT_PHONE_LINK} onChange={onChange} />);
    await flush();
    fireEvent.click(screen.getByRole('switch', { name: "Share when I'm at my desk" }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_PHONE_LINK, shareDesk: false });
    fireEvent.click(screen.getByRole('switch', { name: "Share what I've read" }));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_PHONE_LINK, shareReads: false });
  });
});
