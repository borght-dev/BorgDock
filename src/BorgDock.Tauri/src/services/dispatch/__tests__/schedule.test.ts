import { describe, expect, it } from 'vitest';
import { localDay, scheduleDue, scheduledSlot } from '../schedule';
import type { Slot } from '../types';

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

function slot(id: string, state: Slot['state'], available = true): Slot {
  return {
    id,
    hostId: 'local',
    hostLabel: 'This machine',
    available,
    name: id,
    workspaceRoot: null,
    state,
    itemId: null,
    running: false,
    needsYou: false,
  };
}

describe('scheduledSlot', () => {
  it('takes the last run slot when it is free', () => {
    expect(scheduledSlot([slot('W0', 'free'), slot('W3', 'free')], 'W3')?.id).toBe('W3');
  });

  it('takes the first free one otherwise', () => {
    expect(scheduledSlot([slot('W0', 'busy'), slot('W1', 'free')], 'W0')?.id).toBe('W1');
  });

  it('finds none when every slot is busy or offline', () => {
    expect(scheduledSlot([slot('W0', 'busy'), slot('W1', 'free', false)], null)).toBeNull();
  });
});
