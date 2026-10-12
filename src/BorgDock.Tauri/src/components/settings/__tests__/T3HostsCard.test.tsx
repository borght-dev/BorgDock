import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import type { T3HostSettings } from '@/types/settings';
import { T3HostsCard } from '../T3HostsCard';

const MAC: T3HostSettings = { id: 'mac', label: 'Mac mini', baseUrl: 'http://mac-mini:3773' };
const MAC_REF = { id: 'mac', baseUrl: 'http://mac-mini:3773' };

/** Answers `t3_probe` with `probe`; every other command succeeds. */
function answerProbe(probe: { running: boolean; paired: boolean }) {
  invoke.mockImplementation((command: string) =>
    Promise.resolve(command === 't3_probe' ? probe : undefined),
  );
}

describe('T3HostsCard', () => {
  beforeEach(() => {
    invoke.mockReset();
    answerProbe({ running: true, paired: false });
  });

  it('adds a host with a random id and a trimmed address', () => {
    const onChange = vi.fn();
    render(<T3HostsCard hosts={[]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Name of the T3 host'), {
      target: { value: ' Mac mini ' },
    });
    fireEvent.change(screen.getByLabelText('Address of the T3 host'), {
      target: { value: ' http://mac-mini:3773/ ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add host' }));

    expect(onChange).toHaveBeenCalledWith([
      { id: expect.any(String), label: 'Mac mini', baseUrl: 'http://mac-mini:3773' },
    ]);
    expect(onChange.mock.calls[0]?.[0][0].id).not.toBe('');
  });

  it('refuses an address without a scheme and says why', () => {
    const onChange = vi.fn();
    render(<T3HostsCard hosts={[]} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Address of the T3 host'), {
      target: { value: 'mac-mini:3773' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add host' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Start the address with http:// or https://.')).toBeInTheDocument();
  });

  it.each([
    [{ running: true, paired: true }, 'Paired'],
    [{ running: true, paired: false }, 'Not paired'],
    [{ running: false, paired: false }, 'Not reachable'],
  ])('shows a host that answers %o as "%s"', async (probe, status) => {
    answerProbe(probe);
    render(<T3HostsCard hosts={[MAC]} onChange={vi.fn()} />);

    expect(await screen.findByText(status)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('t3_probe', { host: MAC_REF });
  });

  it('pairs a host with the pasted link and checks it again', async () => {
    render(<T3HostsCard hosts={[MAC]} onChange={vi.fn()} />);
    await screen.findByText('Not paired');
    answerProbe({ running: true, paired: true });

    fireEvent.change(screen.getByLabelText('Pairing link for Mac mini'), {
      target: { value: 'http://mac-mini:3773/pair#token=abc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pair' }));

    expect(await screen.findByText('Paired')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('t3_pair', {
      pairingCredential: 'http://mac-mini:3773/pair#token=abc',
      host: MAC_REF,
    });
    expect(screen.getByLabelText('Pairing link for Mac mini')).toHaveValue('');
  });

  it('shows why pairing failed', async () => {
    invoke.mockImplementation((command: string) =>
      command === 't3_pair'
        ? Promise.reject('Pairing exchange returned 401')
        : Promise.resolve({ running: true, paired: false }),
    );
    render(<T3HostsCard hosts={[MAC]} onChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Pairing link for Mac mini'), {
      target: { value: 'stale' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pair' }));

    expect(await screen.findByText('Pairing exchange returned 401')).toBeInTheDocument();
  });

  it('removing a host deletes its token first', async () => {
    const onChange = vi.fn();
    render(<T3HostsCard hosts={[MAC]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove T3 host Mac mini' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
    expect(invoke).toHaveBeenCalledWith('t3_unpair', { host: MAC_REF });
  });
});
