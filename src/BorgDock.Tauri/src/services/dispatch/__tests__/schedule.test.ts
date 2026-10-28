import { describe, expect, it } from 'vitest';
import { localDay, scheduleDue, scheduledTarget } from '../schedule';
import type { AgentProject } from '../types';

const MON_TO_THU = { enabled: true, time: '08:30', weekdays: [1, 2, 3, 4] };
/** Tuesday 13 October 2026, local time. */
const tuesday = (hours: number, minutes = 0) => new Date(2026, 9, 13, hours, minutes);

describe('scheduleDue', () => {
  it('is due once its time came on a chosen weekday', () => {
    expect(scheduleDue(MON_TO_THU, null, tuesday(8, 30))).toBe(true);
  });

  it('waits for its time', () => {
    expect(scheduleDue(MON_TO_THU, null, tuesday(8, 29))).toBe(false);
  });

  it('runs once a day', () => {
    expect(scheduleDue(MON_TO_THU, localDay(tuesday(8, 31)), tuesday(15))).toBe(false);
  });

  it('catches up the same day when BorgDock opens late', () => {
    expect(scheduleDue(MON_TO_THU, '2026-10-12', tuesday(15))).toBe(true);
  });

  it('skips the weekdays left out', () => {
    expect(scheduleDue(MON_TO_THU, null, new Date(2026, 9, 16, 9))).toBe(false);
  });

  it('never runs while switched off or without a time', () => {
    expect(scheduleDue({ ...MON_TO_THU, enabled: false }, null, tuesday(9))).toBe(false);
    expect(scheduleDue({ ...MON_TO_THU, time: '' }, null, tuesday(9))).toBe(false);
    expect(scheduleDue(undefined, null, tuesday(9))).toBe(false);
  });
});

describe('localDay', () => {
  it('names the day in local time', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

function project(id: string, root: string, available = true): AgentProject {
  return {
    id,
    hostId: 'local',
    hostLabel: 'This machine',
    available,
    title: id,
    workspaceRoot: root,
    repository: {
      key: 'github.com/acme/shop',
      displayName: 'acme/shop',
      owner: 'acme',
      name: 'shop',
    },
  };
}

describe('scheduledTarget', () => {
  const last = { hostId: 'local', repository: 'github.com/acme/shop' };

  it("starts a new worktree of the last run's repository from its own checkout", () => {
    const target = scheduledTarget(
      [project('W3', 'D:/Shop/.worktrees/three'), project('W0', 'D:/Shop')],
      last,
    );
    expect(target).toMatchObject({ kind: 'worktree', hostId: 'local', baseRef: null });
    expect(target?.project.id).toBe('W0');
  });

  it('finds none before a run was started by hand, or when the repository is gone', () => {
    expect(scheduledTarget([project('W0', 'D:/Shop')], null)).toBeNull();
    expect(scheduledTarget([project('W0', 'D:/Shop', false)], last)).toBeNull();
  });
});
