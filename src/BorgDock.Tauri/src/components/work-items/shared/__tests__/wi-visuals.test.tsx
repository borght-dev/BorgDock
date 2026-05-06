import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  MiniAvatar,
  PrioBars,
  StatePill,
  TypeGlyph,
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

describe('TypeGlyph', () => {
  it('renders the type glyph with title attribute', () => {
    render(<TypeGlyph type="Bug" />);
    const el = screen.getByTitle('Bug');
    expect(el.textContent).toBe('●');
  });

  it('falls back for unknown types', () => {
    render(<TypeGlyph type="Mystery" />);
    expect(screen.getByTitle('Mystery').textContent).toBe('▢');
  });
});

describe('PrioBars', () => {
  it('lights 4 bars for P1', () => {
    const { container } = render(<PrioBars prio={1} />);
    const lit = container.querySelectorAll('[data-lit="true"]');
    expect(lit).toHaveLength(4);
  });

  it('lights 1 bar for P4', () => {
    const { container } = render(<PrioBars prio={4} />);
    expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(1);
  });

  it('falls back to P3 for unknown priority', () => {
    const { container } = render(<PrioBars prio={undefined} />);
    expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(2);
  });
});

describe('StatePill', () => {
  it('renders the state label', () => {
    render(<StatePill state="Testing Failed" />);
    expect(screen.getByText('Testing Failed')).toBeInTheDocument();
  });

  it('uses warning tone for Testing Failed', () => {
    render(<StatePill state="Testing Failed" />);
    expect(
      screen.getByText('Testing Failed').closest('.bd-pill'),
    ).toHaveClass('bd-pill--warning');
  });
});

describe('MiniAvatar', () => {
  it('renders initials', () => {
    render(<MiniAvatar initials="KV" />);
    expect(screen.getByText('KV')).toBeInTheDocument();
  });
});
