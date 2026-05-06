import { describe, expect, it } from 'vitest';
import {
  WI_PRIO,
  WI_STATES,
  WI_TYPES,
  avatarToneFor,
  getInitials,
} from '../wi-visuals';

describe('wi-visuals maps', () => {
  it('has tone for known states', () => {
    expect(WI_STATES['Testing Failed']?.tone).toBe('warning');
    expect(WI_STATES.Resolved?.tone).toBe('success');
    expect(WI_STATES.New?.tone).toBe('neutral');
  });

  it('has glyph for known types', () => {
    expect(WI_TYPES.Bug?.glyph).toBe('●');
    expect(WI_TYPES['User Story']?.glyph).toBe('▲');
    expect(WI_TYPES.Task?.glyph).toBe('■');
  });

  it('has priority labels for 1..4', () => {
    expect(WI_PRIO[1]?.label).toBe('Urgent');
    expect(WI_PRIO[4]?.label).toBe('Low');
  });
});

describe('getInitials', () => {
  it('uses first+last initials of two-word names', () => {
    expect(getInitials('Koen van der Borght')).toBe('KB');
    expect(getInitials('Jane Doe')).toBe('JD');
  });

  it('falls back to first 2 chars for single-word names', () => {
    expect(getInitials('Alice')).toBe('AL');
  });

  it('returns ?? for empty input', () => {
    expect(getInitials('')).toBe('??');
  });
});

describe('avatarToneFor', () => {
  it('returns one of the supported tones', () => {
    expect(['blue', 'rose']).toContain(avatarToneFor('KV'));
  });

  it('is deterministic', () => {
    expect(avatarToneFor('KV')).toBe(avatarToneFor('KV'));
  });
});
