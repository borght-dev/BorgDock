import { describe, expect, it } from 'vitest';
import {
  cleanupPrompt,
  DISK_REMINDER_MS,
  DISK_TTL_MS,
  DiskAlertGate,
  diskSeverity,
  freeSpaceLabel,
  freshDisks,
  type HostDisks,
} from '../disk-space';

const GIB = 1024 ** 3;
const NOW = 1_000_000;
function host(free = 30, total = 100): HostDisks {
  return {
    id: 'mini',
    label: 'Mac mini',
    t3Host: { id: 'mini' },
    checkedAt: NOW,
    error: null,
    disks: [{ drive: '/', totalBytes: total * GIB, freeBytes: free * GIB }],
  };
}

describe('Glyphkin disk thresholds', () => {
  it.each([
    [30, 100, 0],
    [20, 100, 0],
    [19, 100, 1],
    [30, 400, 1],
    [5, 100, 1],
    [4, 100, 2],
    [30, 1000, 2],
    [0, 100, 2],
  ])('%s GiB of %s GiB has severity %s', (free, total, expected) => {
    expect(diskSeverity(host(free, total).disks[0]!)).toBe(expected);
  });
  it('does not report unknown values as a full disk', () => {
    expect(diskSeverity({ drive: '/', totalBytes: 0, freeBytes: 0 })).toBe(0);
    expect(diskSeverity({ drive: '/', totalBytes: 100, freeBytes: Number.NaN })).toBe(0);
    expect(freeSpaceLabel(host(0).disks[0]!)).toBe('0.0 GiB free');
  });
});

describe('disk alerts', () => {
  it('alerts immediately, suppresses polling repeats, escalates, and rearms after recovery', () => {
    const gate = new DiskAlertGate();
    expect(gate.notices([host(19)], NOW)).toHaveLength(1);
    expect(gate.notices([host(19)], NOW + 60_000)).toHaveLength(0);
    expect(gate.notices([host(4)], NOW + 60_000)).toHaveLength(1);
    expect(gate.notices([host(19)], NOW + 60_000)).toHaveLength(0);
    expect(gate.notices([host(4)], NOW + 60_000)).toHaveLength(1);
    expect(gate.notices([host(30)], NOW + 60_000)).toHaveLength(0);
    expect(gate.notices([host(19)], NOW + 60_000)).toHaveLength(1);
  });
  it('reminds after six hours and groups low drives into one host notification', () => {
    const gate = new DiskAlertGate();
    const low = host(4);
    low.disks.push({ ...low.disks[0]!, drive: 'D:' });
    expect(gate.notices([low], NOW)).toHaveLength(1);
    expect(
      gate.notices([{ ...low, checkedAt: NOW + DISK_REMINDER_MS }], NOW + DISK_REMINDER_MS),
    ).toHaveLength(1);
  });
  it('never alerts from failed or stale probes, and keeps alert suppression through an outage', () => {
    const gate = new DiskAlertGate();
    expect(gate.notices([{ ...host(4), error: 'offline' }], NOW)).toHaveLength(0);
    expect(gate.notices([host(4)], NOW + DISK_TTL_MS + 1)).toHaveLength(0);
    gate.notices([host(4)], NOW);
    gate.notices([{ ...host(4), disks: [], error: 'offline' }], NOW);
    expect(gate.notices([host(4)], NOW)).toHaveLength(0);
    expect(freshDisks(host(), NOW + DISK_TTL_MS + 1)).toBe(false);
  });
  it('tracks the same mount independently on separate hosts', () => {
    const gate = new DiskAlertGate();
    expect(gate.notices([host(4), { ...host(4), id: 'vera' }], NOW)).toHaveLength(2);
  });
});

it('gives the cleanup agent host and disk context plus preservation constraints', () => {
  const prompt = cleanupPrompt(host(4));
  expect(prompt).toContain('Mac mini');
  expect(prompt).toContain('/');
  expect(prompt).toContain('4 GiB free');
  expect(prompt).toContain('without a repository project');
  expect(prompt).toContain('dirty or untracked work');
  expect(prompt).toContain('before and after');
});
