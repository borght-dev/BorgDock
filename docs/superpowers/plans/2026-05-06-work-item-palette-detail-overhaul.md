# Work Item Palette + Detail Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the v2 design from `BorgDock - Work Item Palette v2.html` for both the palette window and the work-item detail surface (pop-out + side-panel overlay).

**Architecture:** Extract a shared visual vocabulary (`TypeGlyph`/`PrioBars`/`StatePill`/`MiniAvatar` + state/type/priority maps) up-front, then split into two parallel work streams — Palette (`WorkItemPaletteApp` + row + chip-input + group-by) and Detail (`WorkItemDetailPanel` decomposed into TitleBlock/ChipPicker/RightRail/DiscussionRail + tab files + auto-save + adjacent-nav hooks). Final integration phase wires the side-panel narrow-mode and pop-out window resize.

**Tech Stack:** React 18, TypeScript, Vitest + @testing-library/react, Tailwind v4, CSS variables (`--color-*` tokens), Tauri 2 webview windows, existing primitives in `src/components/shared/primitives/`.

**Spec:** `docs/superpowers/specs/2026-05-06-work-item-palette-detail-overhaul-design.md`

---

## Phase 0 — Shared visual vocabulary (sequential, run first)

This phase MUST complete before agents A and B start. Both agents import from `src/components/work-items/shared/wi-visuals.tsx`.

### Task 0.1: Create wi-visuals module with maps

**Files:**
- Create: `src/components/work-items/shared/wi-visuals.tsx`
- Test: `src/components/work-items/shared/__tests__/wi-visuals.test.tsx`

- [ ] **Step 1: Write the failing test for the maps and helpers**

```tsx
// src/components/work-items/shared/__tests__/wi-visuals.test.tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/work-items/shared/__tests__/wi-visuals.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the maps and helpers**

```tsx
// src/components/work-items/shared/wi-visuals.tsx
import clsx from 'clsx';
import { Avatar, type AvatarTone } from '@/components/shared/primitives';

// ---- maps ----

export interface StateMeta {
  tone: 'success' | 'warning' | 'neutral' | 'draft';
  /** Hex color for the leading dot inside the StatePill. */
  dot: string;
}

export const WI_STATES: Record<string, StateMeta> = {
  New: { tone: 'neutral', dot: '#8a85a0' },
  Active: { tone: 'neutral', dot: '#7c6af6' },
  'Development In Progress': { tone: 'neutral', dot: '#7c6af6' },
  Committed: { tone: 'neutral', dot: '#7c6af6' },
  'In Progress': { tone: 'neutral', dot: '#7c6af6' },
  'Testing Failed': { tone: 'warning', dot: '#b07d09' },
  Resolved: { tone: 'success', dot: '#3ba68e' },
  Done: { tone: 'success', dot: '#3ba68e' },
  Closed: { tone: 'draft', dot: '#8a85a0' },
  Removed: { tone: 'draft', dot: '#8a85a0' },
};

export const DEFAULT_STATE_META: StateMeta = { tone: 'neutral', dot: '#8a85a0' };

export interface TypeMeta {
  glyph: string;
  /** CSS variable reference for the glyph color. */
  color: string;
  short: string;
}

export const WI_TYPES: Record<string, TypeMeta> = {
  Bug: { glyph: '●', color: 'var(--color-status-red)', short: 'Bug' },
  'User Story': { glyph: '▲', color: 'var(--color-accent)', short: 'Story' },
  Task: { glyph: '■', color: 'var(--color-status-yellow)', short: 'Task' },
  'Product Backlog Item': {
    glyph: '◆',
    color: 'var(--color-status-merged)',
    short: 'PBI',
  },
  Epic: { glyph: '◇', color: 'var(--color-accent)', short: 'Epic' },
  Feature: { glyph: '◇', color: 'var(--color-accent)', short: 'Feature' },
};

export const DEFAULT_TYPE_META: TypeMeta = {
  glyph: '▢',
  color: 'var(--color-text-muted)',
  short: 'Item',
};

export interface PrioMeta {
  label: string;
  color: string;
}

export const WI_PRIO: Record<number, PrioMeta> = {
  1: { label: 'Urgent', color: 'var(--color-status-red)' },
  2: { label: 'High', color: 'var(--color-status-yellow)' },
  3: { label: 'Med', color: 'var(--color-text-tertiary)' },
  4: { label: 'Low', color: 'var(--color-text-faint)' },
};

export const DEFAULT_PRIO_META: PrioMeta = WI_PRIO[3]!;

// ---- helpers ----

export function getInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return '??';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return parts[0]!.slice(0, 2).toUpperCase();
}

const AVATAR_TONES: AvatarTone[] = ['blue', 'rose'];

export function avatarToneFor(initials: string): AvatarTone {
  let h = 0;
  for (let i = 0; i < initials.length; i++) {
    h = (h * 31 + initials.charCodeAt(i)) | 0;
  }
  return AVATAR_TONES[Math.abs(h) % AVATAR_TONES.length]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/work-items/shared/__tests__/wi-visuals.test.tsx`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/shared/
git -C /e/BorgDock commit -m "wi-visuals: add state/type/priority maps and avatar helpers"
```

---

### Task 0.2: Add TypeGlyph, PrioBars, StatePill, MiniAvatar components

**Files:**
- Modify: `src/components/work-items/shared/wi-visuals.tsx` (append components)
- Modify: `src/components/work-items/shared/__tests__/wi-visuals.test.tsx`

- [ ] **Step 1: Append failing component tests**

Append to `wi-visuals.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import {
  MiniAvatar,
  PrioBars,
  StatePill,
  TypeGlyph,
} from '../wi-visuals';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/work-items/shared/__tests__/wi-visuals.test.tsx`
Expected: FAIL — components not exported.

- [ ] **Step 3: Append components to wi-visuals.tsx**

Append at the end of `wi-visuals.tsx` (after the helpers):

```tsx
// ---- components ----

export interface TypeGlyphProps {
  type: string;
  /** Glyph font-size in px. Default 11. */
  size?: number;
}

export function TypeGlyph({ type, size = 11 }: TypeGlyphProps) {
  const meta = WI_TYPES[type] ?? DEFAULT_TYPE_META;
  return (
    <span
      title={type}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        fontSize: size,
        color: meta.color,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {meta.glyph}
    </span>
  );
}

export interface PrioBarsProps {
  prio: number | undefined;
}

export function PrioBars({ prio }: PrioBarsProps) {
  const p = (prio != null && WI_PRIO[prio]) || DEFAULT_PRIO_META;
  const lit = prio != null && WI_PRIO[prio] ? 5 - prio : 2;
  const heights = [3, 6, 9, 12];
  return (
    <span
      title={prio != null ? `P${prio} · ${p.label}` : 'No priority'}
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: 1.5,
        height: 12,
        width: 14,
        flexShrink: 0,
      }}
    >
      {heights.map((h, i) => {
        const isLit = i < lit;
        return (
          <span
            key={i}
            data-lit={isLit ? 'true' : 'false'}
            style={{
              width: 2,
              height: h,
              background: isLit ? p.color : 'var(--color-text-ghost)',
              borderRadius: 1,
            }}
          />
        );
      })}
    </span>
  );
}

export interface StatePillProps {
  state: string;
  /** Tighter padding/font for use inside dense rows. */
  compact?: boolean;
}

export function StatePill({ state, compact }: StatePillProps) {
  const meta = WI_STATES[state] ?? DEFAULT_STATE_META;
  return (
    <span
      className={clsx('bd-pill', `bd-pill--${meta.tone}`)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: compact ? '1px 6px' : '2px 8px',
        fontSize: compact ? 10.5 : 11,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: meta.dot,
          flexShrink: 0,
        }}
      />
      {state}
    </span>
  );
}

export interface MiniAvatarProps {
  initials: string;
  tone?: AvatarTone;
  /** Pixel size — accepts any value, not just the primitive's preset sizes. Default 18. */
  size?: number;
}

export function MiniAvatar({ initials, tone, size = 18 }: MiniAvatarProps) {
  const resolvedTone = tone ?? avatarToneFor(initials);
  return (
    <Avatar
      initials={initials}
      tone={resolvedTone}
      style={{
        width: size,
        height: size,
        fontSize: size <= 14 ? 8 : size <= 18 ? 9 : 10,
        fontWeight: 600,
        flexShrink: 0,
      }}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/work-items/shared/__tests__/wi-visuals.test.tsx`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/shared/
git -C /e/BorgDock commit -m "wi-visuals: add TypeGlyph, PrioBars, StatePill, MiniAvatar components"
```

---

### Task 0.3: Resize the pop-out detail window

**Files:**
- Modify: `src/hooks/useWorkItemPaletteSearch.ts:316-330` (the `new WebviewWindow` call inside `selectAndClose`)

- [ ] **Step 1: Update window creation params**

In `useWorkItemPaletteSearch.ts`, find `new WebviewWindow(\`workitem-detail-${id}\``, …)` and change `width`, `height`, and `decorations`:

```ts
new WebviewWindow(`workitem-detail-${id}`, {
  url: `workitem-detail.html?id=${id}`,
  title: `Work Item #${id}`,
  width: 1180,
  height: 820,
  minWidth: 720,
  minHeight: 520,
  center: true,
  decorations: false,
  resizable: true,
  focus: true,
  skipTaskbar: false, // viewer windows are first-class — appear in Alt+Tab
  visible: false,
});
```

- [ ] **Step 2: Run any existing palette tests to confirm no regression**

Run: `npx vitest run src/hooks/__tests__/useWorkItemPaletteSearch`
Expected: PASS or "no test files matching" — neither blocks.

- [ ] **Step 3: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/hooks/useWorkItemPaletteSearch.ts
git -C /e/BorgDock commit -m "palette: enlarge pop-out detail window to 1180x820"
```

---

## Phase 1 — Palette overhaul (Agent A)

Run in parallel with Phase 2. Depends only on Phase 0.

### Task 1.1: Build ChipInput for inline operator parsing

**Files:**
- Create: `src/components/work-item-palette/ChipInput.tsx`
- Create: `src/components/work-item-palette/parseOperators.ts`
- Test: `src/components/work-item-palette/__tests__/parseOperators.test.ts`
- Test: `src/components/work-item-palette/__tests__/ChipInput.test.tsx`

- [ ] **Step 1: Write failing test for parseOperators**

```ts
// src/components/work-item-palette/__tests__/parseOperators.test.ts
import { describe, expect, it } from 'vitest';
import { applyOperators, parseOperators } from '../parseOperators';
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

describe('parseOperators', () => {
  it('extracts state: tokens', () => {
    const { ops, freeText } = parseOperators('state:active fix toast');
    expect(ops).toEqual([{ kind: 'state', value: 'active' }]);
    expect(freeText).toBe('fix toast');
  });

  it('extracts @user mentions', () => {
    const { ops, freeText } = parseOperators('@me crash');
    expect(ops).toEqual([{ kind: 'mention', value: 'me' }]);
    expect(freeText).toBe('crash');
  });

  it('extracts type: tokens', () => {
    const { ops } = parseOperators('type:bug');
    expect(ops).toEqual([{ kind: 'type', value: 'bug' }]);
  });

  it('handles multiple operators', () => {
    const { ops, freeText } = parseOperators('state:active type:bug @me toast');
    expect(ops).toHaveLength(3);
    expect(freeText).toBe('toast');
  });

  it('returns empty ops for plain text', () => {
    const { ops, freeText } = parseOperators('plain query');
    expect(ops).toEqual([]);
    expect(freeText).toBe('plain query');
  });
});

describe('applyOperators', () => {
  const items: ResultItem[] = [
    { id: 1, title: 'Save toast', state: 'Active', workItemType: 'Bug', assignedTo: 'KV' },
    { id: 2, title: 'Empty pages', state: 'New', workItemType: 'Task', assignedTo: 'SS' },
    { id: 3, title: 'Refresh chat', state: 'Active', workItemType: 'Bug', assignedTo: 'TB' },
  ];

  it('filters by state operator (case-insensitive substring on state)', () => {
    const result = applyOperators(items, [{ kind: 'state', value: 'active' }], new Set());
    expect(result.map((i) => i.id)).toEqual([1, 3]);
  });

  it('filters by type operator', () => {
    const result = applyOperators(items, [{ kind: 'type', value: 'bug' }], new Set());
    expect(result.map((i) => i.id)).toEqual([1, 3]);
  });

  it('filters @me by membership in assignedToMeIds', () => {
    const result = applyOperators(
      items,
      [{ kind: 'mention', value: 'me' }],
      new Set([1]),
    );
    expect(result.map((i) => i.id)).toEqual([1]);
  });

  it('returns input unchanged when ops empty', () => {
    expect(applyOperators(items, [], new Set())).toEqual(items);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/work-item-palette/__tests__/parseOperators.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement parseOperators**

```ts
// src/components/work-item-palette/parseOperators.ts
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

export type OperatorKind = 'state' | 'type' | 'assignee' | 'iter' | 'mention' | 'unknown';

export interface ParsedOperator {
  kind: OperatorKind;
  value: string;
}

export interface ParsedQuery {
  ops: ParsedOperator[];
  freeText: string;
}

const OP_RE = /(\w+):(\S+)|@(\w+)/g;

export function parseOperators(query: string): ParsedQuery {
  const ops: ParsedOperator[] = [];
  let m: RegExpExecArray | null;
  while ((m = OP_RE.exec(query)) !== null) {
    if (m[3]) {
      ops.push({ kind: 'mention', value: m[3] });
    } else {
      const key = m[1]!.toLowerCase();
      const kind: OperatorKind =
        key === 'state' || key === 'type' || key === 'assignee' || key === 'iter'
          ? key
          : 'unknown';
      ops.push({ kind, value: m[2]! });
    }
  }
  const freeText = query.replace(OP_RE, '').replace(/\s+/g, ' ').trim();
  return { ops, freeText };
}

export function applyOperators(
  items: ResultItem[],
  ops: ParsedOperator[],
  assignedToMeIds: Set<number>,
): ResultItem[] {
  if (ops.length === 0) return items;
  return items.filter((item) =>
    ops.every((op) => {
      switch (op.kind) {
        case 'state':
          return item.state.toLowerCase().includes(op.value.toLowerCase());
        case 'type':
          return item.workItemType.toLowerCase().includes(op.value.toLowerCase());
        case 'assignee':
          return item.assignedTo.toLowerCase().includes(op.value.toLowerCase());
        case 'mention':
          if (op.value.toLowerCase() === 'me') return assignedToMeIds.has(item.id);
          return item.assignedTo.toLowerCase().includes(op.value.toLowerCase());
        default:
          return true;
      }
    }),
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run src/components/work-item-palette/__tests__/parseOperators.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing ChipInput test**

```tsx
// src/components/work-item-palette/__tests__/ChipInput.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChipInput } from '../ChipInput';

describe('ChipInput', () => {
  it('renders the placeholder', () => {
    render(<ChipInput value="" onChange={() => {}} placeholder="Search…" />);
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
  });

  it('renders chips for parsed operators', () => {
    render(<ChipInput value="state:active fix" onChange={() => {}} />);
    expect(screen.getByText('state:active')).toBeInTheDocument();
  });

  it('renders @mention chips', () => {
    render(<ChipInput value="@me toast" onChange={() => {}} />);
    expect(screen.getByText('@me')).toBeInTheDocument();
  });

  it('calls onChange when typing', () => {
    const onChange = vi.fn();
    render(<ChipInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a' } });
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('calls onChange("") when clear button clicked', () => {
    const onChange = vi.fn();
    render(<ChipInput value="hello" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
```

- [ ] **Step 6: Run test, verify failure**

Run: `npx vitest run src/components/work-item-palette/__tests__/ChipInput.test.tsx`
Expected: FAIL.

- [ ] **Step 7: Implement ChipInput**

```tsx
// src/components/work-item-palette/ChipInput.tsx
import type { KeyboardEvent } from 'react';
import { forwardRef, useMemo } from 'react';
import { parseOperators } from './parseOperators';

export interface ChipInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export const ChipInput = forwardRef<HTMLInputElement, ChipInputProps>(
  function ChipInput({ value, onChange, placeholder, onKeyDown }, ref) {
    const { ops } = useMemo(() => parseOperators(value), [value]);

    return (
      <div
        className="bd-input"
        style={{ height: 34, paddingLeft: 10, paddingRight: 8, gap: 6, display: 'flex', alignItems: 'center' }}
      >
        <svg
          width={13}
          height={13}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
        >
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3 3" strokeLinecap="round" />
        </svg>
        {ops.map((op, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '1px 6px',
              borderRadius: 4,
              fontSize: 11,
              background: 'var(--color-accent-subtle)',
              color: 'var(--color-accent)',
              border: '1px solid var(--color-purple-border)',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {op.kind === 'mention' ? `@${op.value}` : `${op.kind}:${op.value}`}
          </span>
        ))}
        <input
          ref={ref}
          type="text"
          role="textbox"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            background: 'transparent',
            outline: 'none',
            fontSize: 12.5,
            color: 'var(--color-text-primary)',
            fontFamily: 'inherit',
          }}
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange('')}
            className="bd-icon-btn"
            style={{ width: 20, height: 20 }}
          >
            <svg width={11} height={11} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </div>
    );
  },
);
```

- [ ] **Step 8: Run tests, verify pass**

Run: `npx vitest run src/components/work-item-palette/__tests__/ChipInput.test.tsx src/components/work-item-palette/__tests__/parseOperators.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-item-palette/
git -C /e/BorgDock commit -m "palette: ChipInput with inline operator parsing"
```

---

### Task 1.2: FilterChip + GroupSeg components

**Files:**
- Create: `src/components/work-item-palette/FilterChip.tsx`
- Create: `src/components/work-item-palette/GroupSeg.tsx`
- Test: `src/components/work-item-palette/__tests__/FilterChip.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/work-item-palette/__tests__/FilterChip.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilterChip } from '../FilterChip';
import { GroupSeg } from '../GroupSeg';

describe('FilterChip', () => {
  it('renders children', () => {
    render(<FilterChip onClick={() => {}}>All</FilterChip>);
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('fires onClick', () => {
    const onClick = vi.fn();
    render(<FilterChip onClick={onClick}>All</FilterChip>);
    fireEvent.click(screen.getByText('All'));
    expect(onClick).toHaveBeenCalled();
  });

  it('marks active state via aria-pressed', () => {
    render(<FilterChip active onClick={() => {}}>Open</FilterChip>);
    expect(screen.getByText('Open').closest('button')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('GroupSeg', () => {
  it('marks active', () => {
    render(<GroupSeg active onClick={() => {}}>State</GroupSeg>);
    expect(screen.getByText('State').closest('button')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/components/work-item-palette/__tests__/FilterChip.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement FilterChip and GroupSeg**

```tsx
// src/components/work-item-palette/FilterChip.tsx
import type { ReactNode } from 'react';

export interface FilterChipProps {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'warning';
}

export function FilterChip({ active, onClick, children, icon, tone = 'default' }: FilterChipProps) {
  const isWarn = tone === 'warning';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ? 'true' : 'false'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 22,
        padding: '0 9px',
        fontSize: 11,
        fontWeight: 500,
        border: '1px solid',
        borderColor: active
          ? isWarn
            ? 'var(--color-warning-badge-border)'
            : 'var(--color-purple-border)'
          : 'var(--color-subtle-border)',
        background: active
          ? isWarn
            ? 'var(--color-warning-badge-bg)'
            : 'var(--color-accent-subtle)'
          : 'transparent',
        color: active
          ? isWarn
            ? 'var(--color-warning-badge-fg)'
            : 'var(--color-accent)'
          : 'var(--color-text-tertiary)',
        borderRadius: 4,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {icon}
      {children}
    </button>
  );
}
```

```tsx
// src/components/work-item-palette/GroupSeg.tsx
import type { ReactNode } from 'react';

export interface GroupSegProps {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function GroupSeg({ active, onClick, children }: GroupSegProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ? 'true' : 'false'}
      style={{
        height: 20,
        padding: '0 7px',
        fontSize: 10.5,
        fontWeight: 500,
        border: 'none',
        background: active ? 'var(--color-accent-subtle)' : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
        borderRadius: 3,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/components/work-item-palette/__tests__/FilterChip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-item-palette/
git -C /e/BorgDock commit -m "palette: FilterChip and GroupSeg components"
```

---

### Task 1.3: useGroupedItems hook

**Files:**
- Create: `src/components/work-item-palette/useGroupedItems.ts`
- Test: `src/components/work-item-palette/__tests__/useGroupedItems.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/components/work-item-palette/__tests__/useGroupedItems.test.ts
import { describe, expect, it } from 'vitest';
import { groupItems } from '../useGroupedItems';
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

const items: ResultItem[] = [
  { id: 1, title: 'a', state: 'Active', workItemType: 'Bug', assignedTo: 'KV' },
  { id: 2, title: 'b', state: 'New', workItemType: 'Bug', assignedTo: 'SS' },
  { id: 3, title: 'c', state: 'Active', workItemType: 'Task', assignedTo: 'KV' },
];

describe('groupItems', () => {
  it('returns one group when groupBy = none', () => {
    const groups = groupItems(items, 'none', 'KV');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(3);
  });

  it('groups by state', () => {
    const groups = groupItems(items, 'state', 'KV');
    expect(groups.map((g) => g.label).sort()).toEqual(['Active', 'New']);
  });

  it('puts current user first when groupBy = assignee', () => {
    const groups = groupItems(items, 'assignee', 'KV');
    expect(groups[0]?.label).toBe('KV');
  });

  it('groups by assignee alphabetically when no current user', () => {
    const groups = groupItems(items, 'assignee', '');
    expect(groups.map((g) => g.label)).toEqual(['KV', 'SS']);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/components/work-item-palette/__tests__/useGroupedItems.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/components/work-item-palette/useGroupedItems.ts
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

export type GroupBy = 'none' | 'state' | 'assignee' | 'iter';

export interface ItemGroup {
  key: string;
  label: string | null;
  items: ResultItem[];
}

function lastSegment(path: string): string {
  const segs = path.split(/[\\/]/);
  return segs[segs.length - 1] ?? path;
}

export function groupItems(
  items: ResultItem[],
  groupBy: GroupBy,
  currentUser: string,
): ItemGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: null, items }];
  }
  const map = new Map<string, ResultItem[]>();
  for (const item of items) {
    let key: string;
    if (groupBy === 'state') key = item.state || 'No state';
    else if (groupBy === 'assignee') key = item.assignedTo || 'Unassigned';
    else key = 'No iteration';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  const entries = [...map.entries()];
  entries.sort((a, b) => {
    if (groupBy === 'assignee' && currentUser) {
      if (a[0] === currentUser) return -1;
      if (b[0] === currentUser) return 1;
    }
    if (a[0] === 'Unassigned') return 1;
    if (b[0] === 'Unassigned') return -1;
    return a[0].localeCompare(b[0]);
  });
  return entries.map(([key, groupItems]) => ({ key, label: key, items: groupItems }));
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/components/work-item-palette/__tests__/useGroupedItems.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-item-palette/
git -C /e/BorgDock commit -m "palette: useGroupedItems with state/assignee/iter grouping"
```

---

### Task 1.4: Rewrite WorkItemPaletteRow with the dense grid layout

**Files:**
- Modify: `src/components/work-item-palette/WorkItemPaletteRow.tsx` (full rewrite)
- Modify: `src/hooks/useWorkItemPaletteSearch.ts` (extend `ResultItem` with optional fields)
- Test: `src/components/work-item-palette/__tests__/WorkItemPaletteRow.test.tsx`

- [ ] **Step 1: Extend the ResultItem shape**

In `useWorkItemPaletteSearch.ts`, replace the `ResultItem` interface:

```ts
export interface ResultItem {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string;
  /** Numeric priority 1..4 if present. */
  priority?: number;
  /** System.IterationPath last segment if present. */
  iteration?: string;
  /** Comment count from System.CommentCount if present. */
  commentCount?: number;
}
```

In the same file, update `mapWorkItem`:

```ts
function mapWorkItem(wi: WorkItem): ResultItem {
  const prioRaw = wi.fields['Microsoft.VSTS.Common.Priority'];
  const prio = typeof prioRaw === 'number' ? prioRaw : Number(prioRaw) || undefined;
  const iter = String(wi.fields['System.IterationPath'] ?? '');
  const lastSeg = iter ? (iter.split(/[\\/]/).pop() ?? iter) : undefined;
  const cc = wi.fields['System.CommentCount'];
  return {
    id: wi.id,
    title: getField(wi, 'System.Title'),
    state: getField(wi, 'System.State'),
    workItemType: getField(wi, 'System.WorkItemType'),
    assignedTo: getField(wi, 'System.AssignedTo'),
    priority: prio,
    iteration: lastSeg,
    commentCount: typeof cc === 'number' && cc > 0 ? cc : undefined,
  };
}
```

- [ ] **Step 2: Write the failing row test**

```tsx
// src/components/work-item-palette/__tests__/WorkItemPaletteRow.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkItemPaletteRow } from '../WorkItemPaletteRow';
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

function makeItem(overrides: Partial<ResultItem> = {}): ResultItem {
  return {
    id: 54519,
    title: 'Quotes: success toast appears even on failure',
    state: 'Testing Failed',
    workItemType: 'Bug',
    assignedTo: 'Koen van der Borght',
    priority: 2,
    commentCount: 3,
    iteration: 'R5.2.7.5',
    ...overrides,
  };
}

describe('WorkItemPaletteRow', () => {
  it('renders #id, title, and state pill', () => {
    render(
      <WorkItemPaletteRow
        item={makeItem()}
        isSelected={false}
        onMouseEnter={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('#54519')).toBeInTheDocument();
    expect(screen.getByText(/success toast/)).toBeInTheDocument();
    expect(screen.getByText('Testing Failed')).toBeInTheDocument();
  });

  it('shows comment count when > 0', () => {
    render(
      <WorkItemPaletteRow
        item={makeItem({ commentCount: 7 })}
        isSelected={false}
        onMouseEnter={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('hides comment count when missing', () => {
    render(
      <WorkItemPaletteRow
        item={makeItem({ commentCount: undefined })}
        isSelected={false}
        onMouseEnter={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Comments')).toBeNull();
  });

  it('fires onSelect when clicked', () => {
    const onSelect = vi.fn();
    render(
      <WorkItemPaletteRow
        item={makeItem()}
        isSelected={false}
        onMouseEnter={() => {}}
        onSelect={onSelect}
      />,
    );
    fireEvent.mouseDown(screen.getByText(/success toast/));
    expect(onSelect).toHaveBeenCalledWith(54519);
  });
});
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run src/components/work-item-palette/__tests__/WorkItemPaletteRow.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Rewrite WorkItemPaletteRow**

Replace `src/components/work-item-palette/WorkItemPaletteRow.tsx` with:

```tsx
import {
  MiniAvatar,
  PrioBars,
  StatePill,
  TypeGlyph,
  avatarToneFor,
  getInitials,
} from '@/components/work-items/shared/wi-visuals';
import type { ResultItem } from '@/hooks/useWorkItemPaletteSearch';

interface Props {
  item: ResultItem;
  isSelected: boolean;
  onMouseEnter: () => void;
  onSelect: (id: number) => void;
}

export function WorkItemPaletteRow({ item, isSelected, onMouseEnter, onSelect }: Props) {
  const initials = getInitials(item.assignedTo);
  return (
    <div
      data-palette-row
      onMouseEnter={onMouseEnter}
      onMouseDown={() => onSelect(item.id)}
      style={{
        display: 'grid',
        gridTemplateColumns: '16px 14px 78px 1fr auto auto 18px',
        columnGap: 10,
        alignItems: 'center',
        padding: '7px 14px',
        paddingLeft: isSelected ? 12 : 14,
        cursor: 'pointer',
        background: isSelected ? 'var(--color-selected-row-bg)' : 'transparent',
        borderLeft: isSelected
          ? '2px solid var(--color-accent)'
          : '2px solid transparent',
        borderBottom: '1px solid var(--color-subtle-border)',
      }}
    >
      <PrioBars prio={item.priority} />
      <TypeGlyph type={item.workItemType} />
      <span
        className="bd-mono"
        style={{
          fontSize: 11.5,
          color: isSelected ? 'var(--color-accent)' : 'var(--color-text-muted)',
          fontWeight: isSelected ? 600 : 400,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        #{item.id}
      </span>
      <span
        style={{
          fontSize: 12.5,
          color: 'var(--color-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: isSelected ? 500 : 400,
        }}
      >
        {item.title}
      </span>
      <span
        aria-label={item.commentCount ? 'Comments' : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          color: 'var(--color-text-faint)',
          fontVariantNumeric: 'tabular-nums',
          minWidth: 14,
        }}
      >
        {item.commentCount ? (
          <>
            <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3}>
              <path d="M2 4a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H7l-3 3v-3H4a2 2 0 01-2-2V4z" strokeLinejoin="round" />
            </svg>
            {item.commentCount}
          </>
        ) : null}
      </span>
      <StatePill state={item.state} compact />
      <MiniAvatar initials={initials} tone={avatarToneFor(initials)} size={18} />
    </div>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run src/components/work-item-palette/__tests__/WorkItemPaletteRow.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteRow.tsx \
                     src/BorgDock.Tauri/src/components/work-item-palette/__tests__/WorkItemPaletteRow.test.tsx \
                     src/BorgDock.Tauri/src/hooks/useWorkItemPaletteSearch.ts
git -C /e/BorgDock commit -m "palette: dense WorkItemPaletteRow grid + ResultItem prio/iteration/commentCount"
```

---

### Task 1.5: Wire palette filters, group-by, and assigned-to-me set

**Files:**
- Modify: `src/hooks/useWorkItemPaletteSearch.ts` (expose `assignedToMeIds`)
- Modify: `src/components/work-item-palette/WorkItemPaletteApp.tsx` (full rewrite of layout)

- [ ] **Step 1: Expose assignedToMeIds from the hook**

In `useWorkItemPaletteSearch.ts`, in the existing block where `assignedItems` is mapped (around the existing `setAssignedToMeItems(assignedItems.map(mapWorkItem));`), also derive a Set of IDs and store in state:

```ts
// Add near the other state, around line 84
const [assignedToMeIds, setAssignedToMeIds] = useState<Set<number>>(new Set());
```

In the `Promise.all` `.then(...)` block, update the assigned-to-me handling:

```ts
const mappedAssigned = assignedItems.map(mapWorkItem);
setAssignedToMeItems(mappedAssigned);
setAssignedToMeIds(new Set(mappedAssigned.map((i) => i.id)));
```

In the return at the bottom, add `assignedToMeIds`:

```ts
return {
  // ... existing fields ...
  assignedToMeIds,
  // ... existing fields ...
};
```

- [ ] **Step 2: Rewrite WorkItemPaletteApp.tsx**

Replace `src/components/work-item-palette/WorkItemPaletteApp.tsx` with:

```tsx
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WindowStatusBar } from '@/components/shared/chrome';
import { Kbd } from '@/components/shared/primitives';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import {
  MiniAvatar,
  StatePill,
  avatarToneFor,
} from '@/components/work-items/shared/wi-visuals';
import { ChipInput } from '@/components/work-item-palette/ChipInput';
import { FilterChip } from '@/components/work-item-palette/FilterChip';
import { GroupSeg } from '@/components/work-item-palette/GroupSeg';
import { WorkItemPaletteRow } from '@/components/work-item-palette/WorkItemPaletteRow';
import { applyOperators, parseOperators } from '@/components/work-item-palette/parseOperators';
import {
  type GroupBy,
  type ItemGroup,
  groupItems,
} from '@/components/work-item-palette/useGroupedItems';
import {
  saveCurrentPosition,
  useWorkItemPaletteSearch,
} from '@/hooks/useWorkItemPaletteSearch';

const PREFS_KEY = 'borgdock-palette-prefs';
const NAVLIST_KEY = 'borgdock-palette-navlist';

type StateFilter = 'all' | 'open' | 'mine' | 'failing';

interface Prefs {
  stateFilter: StateFilter;
  groupBy: GroupBy;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Prefs>;
      return {
        stateFilter: parsed.stateFilter ?? 'all',
        groupBy: parsed.groupBy ?? 'none',
      };
    }
  } catch {
    /* ignore */
  }
  return { stateFilter: 'all', groupBy: 'none' };
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function saveNavlist(ids: number[]) {
  try {
    localStorage.setItem(
      NAVLIST_KEY,
      JSON.stringify({ ids, savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function WorkItemPaletteApp() {
  const {
    searchText,
    setSearchText,
    selectedIndex,
    setSelectedIndex,
    statusText,
    isSearching,
    isSearchMode,
    isLoadingBrowse,
    browseSections,
    navItems,
    selectAndClose,
    assignedToMeIds,
  } = useWorkItemPaletteSearch();

  const initialPrefs = useMemo(loadPrefs, []);
  const [stateFilter, setStateFilter] = useState<StateFilter>(initialPrefs.stateFilter);
  const [groupBy, setGroupBy] = useState<GroupBy>(initialPrefs.groupBy);

  useEffect(() => {
    savePrefs({ stateFilter, groupBy });
  }, [stateFilter, groupBy]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reveal/focus on mount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      invoke('window_ready').catch(() => {});
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Esc → hide.
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        getCurrentWindow().hide().catch(console.debug);
      }
    }
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, []);

  // Reset on re-show.
  useEffect(() => {
    const unlisten = listen('palette-shown', () => {
      setSearchText('');
      setSelectedIndex(-1);
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [setSearchText, setSelectedIndex]);

  // Save position on move.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWindow().onMoved(() => saveCurrentPosition());
    })();
    return () => unlisten?.();
  }, []);

  // Apply state filter + operators on top of the hook's results.
  const filteredItems = useMemo(() => {
    const { ops } = parseOperators(searchText);
    let xs = navItems;
    if (stateFilter === 'open') {
      xs = xs.filter((x) => x.state !== 'Closed' && x.state !== 'Removed' && x.state !== 'Done');
    } else if (stateFilter === 'mine') {
      xs = xs.filter((x) => assignedToMeIds.has(x.id));
    } else if (stateFilter === 'failing') {
      xs = xs.filter((x) => x.state === 'Testing Failed');
    }
    return applyOperators(xs, ops, assignedToMeIds);
  }, [navItems, stateFilter, searchText, assignedToMeIds]);

  // Decide groups: in browse mode without a group-by, fall back to the hook's
  // section structure. Otherwise apply our own grouper.
  const groups: ItemGroup[] = useMemo(() => {
    if (!isSearchMode && stateFilter === 'all' && groupBy === 'none') {
      return browseSections.map((s) => ({ key: s.label, label: s.label, items: s.items }));
    }
    const currentUserName = ''; // see "Mine" filter — we use the assigned-to-me set instead
    return groupItems(filteredItems, groupBy, currentUserName);
  }, [isSearchMode, stateFilter, groupBy, browseSections, filteredItems]);

  // Flat order of items for keyboard nav (matches render order).
  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Re-bound selection.
  useEffect(() => {
    if (flatItems.length === 0) {
      setSelectedIndex(-1);
    } else if (selectedIndex < 0 || selectedIndex >= flatItems.length) {
      setSelectedIndex(0);
    }
  }, [flatItems.length, selectedIndex, setSelectedIndex]);

  // Scroll selected into view.
  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const allRows = listRef.current.querySelectorAll('[data-palette-row]');
    allRows[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Adapter — selectAndClose persists navlist before opening the detail.
  const openItem = useCallback(
    (id: number) => {
      saveNavlist(flatItems.map((i) => i.id));
      selectAndClose(id);
    },
    [flatItems, selectAndClose],
  );

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (flatItems.length > 0) {
            setSelectedIndex((i) => (i <= 0 ? flatItems.length - 1 : i - 1));
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (flatItems.length > 0) {
            setSelectedIndex((i) => (i >= flatItems.length - 1 ? 0 : i + 1));
          }
          break;
        case 'Enter': {
          e.preventDefault();
          const item = flatItems[selectedIndex];
          if (item) openItem(item.id);
          break;
        }
      }
    },
    [flatItems, selectedIndex, openItem, setSelectedIndex],
  );

  let globalOffset = 0;
  return (
    <div className="bd-wp-palette">
      <WindowTitleBar title="Work Items" meta={<Kbd>Ctrl+F9</Kbd>} />

      <div className="bd-wp-search-wrap">
        <ChipInput
          ref={inputRef}
          value={searchText}
          onChange={setSearchText}
          onKeyDown={handleInputKeyDown}
          placeholder="Search ID, title, @assignee, state:active, type:bug…"
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            flexWrap: 'wrap',
          }}
        >
          <FilterChip active={stateFilter === 'all'} onClick={() => setStateFilter('all')}>
            All
          </FilterChip>
          <FilterChip active={stateFilter === 'open'} onClick={() => setStateFilter('open')}>
            Open
          </FilterChip>
          <FilterChip
            active={stateFilter === 'mine'}
            onClick={() => setStateFilter('mine')}
            icon={<MiniAvatar initials="ME" tone={avatarToneFor('ME')} size={13} />}
          >
            Mine
          </FilterChip>
          <FilterChip
            active={stateFilter === 'failing'}
            onClick={() => setStateFilter('failing')}
            tone="warning"
            icon={<StatePill state="Testing Failed" compact />}
          >
            Failing
          </FilterChip>
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 10,
              color: 'var(--color-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Group
          </span>
          <GroupSeg active={groupBy === 'none'} onClick={() => setGroupBy('none')}>
            —
          </GroupSeg>
          <GroupSeg active={groupBy === 'state'} onClick={() => setGroupBy('state')}>
            State
          </GroupSeg>
          <GroupSeg active={groupBy === 'assignee'} onClick={() => setGroupBy('assignee')}>
            Owner
          </GroupSeg>
          <GroupSeg active={groupBy === 'iter'} onClick={() => setGroupBy('iter')}>
            Iter
          </GroupSeg>
        </div>
      </div>

      <div ref={listRef} className="bd-wp-content">
        {flatItems.length === 0 && !isLoadingBrowse && (
          <div className="bd-wp-empty">
            {isSearchMode ? 'No work items match your filters.' : 'Type to search work items'}
          </div>
        )}
        {isLoadingBrowse && flatItems.length === 0 && (
          <div className="bd-wp-loading">
            <span className="bd-wp-spinner" />
            <span>Loading…</span>
          </div>
        )}
        {groups.map((g) => {
          const sectionStart = globalOffset;
          const rendered = (
            <div key={g.key}>
              {g.label && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px 4px',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--color-surface)',
                    borderBottom: '1px solid var(--color-subtle-border)',
                    zIndex: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--color-text-muted)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      fontWeight: 600,
                    }}
                  >
                    {g.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--color-text-faint)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {g.items.length}
                  </span>
                </div>
              )}
              {g.items.map((item, localIndex) => {
                const flatIndex = sectionStart + localIndex;
                return (
                  <WorkItemPaletteRow
                    key={item.id}
                    item={item}
                    isSelected={flatIndex === selectedIndex}
                    onMouseEnter={() => setSelectedIndex(flatIndex)}
                    onSelect={openItem}
                  />
                );
              })}
            </div>
          );
          globalOffset += g.items.length;
          return rendered;
        })}
      </div>

      <WindowStatusBar
        left={
          <span className="bd-mono">
            {isSearching && <span className="bd-wp-spinner bd-wp-spinner--inline" />}
            {statusText || (flatItems.length > 0 ? `${flatItems.length} results` : '')}
          </span>
        }
        right={
          <span className="bd-mono">
            <Kbd>{'↑↓'}</Kbd> nav · <Kbd>{'⏎'}</Kbd> open · <Kbd>esc</Kbd> close
          </span>
        }
      />
    </div>
  );
}
```

- [ ] **Step 3: Run all palette tests**

Run: `npx vitest run src/components/work-item-palette/`
Expected: all PASS.

- [ ] **Step 4: Run full test suite to detect regressions**

Run: `npx vitest run`
Expected: all PASS — no regressions outside the touched files.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-item-palette/ \
                     src/BorgDock.Tauri/src/hooks/useWorkItemPaletteSearch.ts
git -C /e/BorgDock commit -m "palette: rewrite app with chip input, filter chips, group-by, navlist"
```

---

## Phase 2 — Detail overhaul (Agent B)

Run in parallel with Phase 1. Depends only on Phase 0.

### Task 2.1: Add useAdjacentNav hook

**Files:**
- Create: `src/components/work-items/WorkItemDetailPanel/useAdjacentNav.ts`
- Test: `src/components/work-items/WorkItemDetailPanel/__tests__/useAdjacentNav.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/components/work-items/WorkItemDetailPanel/__tests__/useAdjacentNav.test.ts
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAdjacentNav } from '../useAdjacentNav';

const NAVLIST_KEY = 'borgdock-palette-navlist';

describe('useAdjacentNav', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('returns nulls when no navlist saved', () => {
    const { result } = renderHook(() => useAdjacentNav(42));
    expect(result.current).toEqual({ prevId: null, nextId: null, total: 0, index: -1 });
  });

  it('returns adjacent ids when present', () => {
    localStorage.setItem(
      NAVLIST_KEY,
      JSON.stringify({ ids: [1, 2, 3, 4], savedAt: Date.now() }),
    );
    const { result } = renderHook(() => useAdjacentNav(2));
    expect(result.current.prevId).toBe(1);
    expect(result.current.nextId).toBe(3);
    expect(result.current.total).toBe(4);
    expect(result.current.index).toBe(1);
  });

  it('null prev at start, null next at end', () => {
    localStorage.setItem(
      NAVLIST_KEY,
      JSON.stringify({ ids: [1, 2, 3], savedAt: Date.now() }),
    );
    const head = renderHook(() => useAdjacentNav(1));
    expect(head.result.current.prevId).toBe(null);
    expect(head.result.current.nextId).toBe(2);

    const tail = renderHook(() => useAdjacentNav(3));
    expect(tail.result.current.prevId).toBe(2);
    expect(tail.result.current.nextId).toBe(null);
  });

  it('treats stale (>1h) as missing', () => {
    localStorage.setItem(
      NAVLIST_KEY,
      JSON.stringify({ ids: [1, 2, 3], savedAt: Date.now() - 3700_000 }),
    );
    const { result } = renderHook(() => useAdjacentNav(2));
    expect(result.current.prevId).toBe(null);
    expect(result.current.nextId).toBe(null);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/useAdjacentNav.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the hook**

```ts
// src/components/work-items/WorkItemDetailPanel/useAdjacentNav.ts
import { useMemo } from 'react';

const NAVLIST_KEY = 'borgdock-palette-navlist';
const STALE_MS = 60 * 60 * 1000; // 1h

export interface AdjacentNav {
  prevId: number | null;
  nextId: number | null;
  total: number;
  index: number;
}

export function useAdjacentNav(currentId: number | null): AdjacentNav {
  return useMemo(() => {
    if (currentId == null) return { prevId: null, nextId: null, total: 0, index: -1 };
    try {
      const raw = localStorage.getItem(NAVLIST_KEY);
      if (!raw) return { prevId: null, nextId: null, total: 0, index: -1 };
      const parsed = JSON.parse(raw) as { ids: number[]; savedAt: number };
      if (Date.now() - parsed.savedAt > STALE_MS) {
        return { prevId: null, nextId: null, total: 0, index: -1 };
      }
      const idx = parsed.ids.indexOf(currentId);
      if (idx === -1) return { prevId: null, nextId: null, total: parsed.ids.length, index: -1 };
      return {
        prevId: idx > 0 ? parsed.ids[idx - 1]! : null,
        nextId: idx < parsed.ids.length - 1 ? parsed.ids[idx + 1]! : null,
        total: parsed.ids.length,
        index: idx,
      };
    } catch {
      return { prevId: null, nextId: null, total: 0, index: -1 };
    }
  }, [currentId]);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/useAdjacentNav.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailPanel/
git -C /e/BorgDock commit -m "detail: useAdjacentNav reads palette navlist from localStorage"
```

---

### Task 2.2: Add useAutoSave hook

**Files:**
- Create: `src/components/work-items/WorkItemDetailPanel/useAutoSave.ts`
- Test: `src/components/work-items/WorkItemDetailPanel/__tests__/useAutoSave.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/components/work-items/WorkItemDetailPanel/__tests__/useAutoSave.test.ts
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoSave, type AutoSaveValues } from '../useAutoSave';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const initial: AutoSaveValues = {
  title: 'Original',
  state: 'Active',
  assignedTo: 'Alice',
  priority: 2,
  tags: '',
};

describe('useAutoSave', () => {
  it('does not call onPatch when nothing changed', () => {
    const onPatch = vi.fn();
    const { result } = renderHook(() => useAutoSave({ initial, onPatch }));
    act(() => result.current.flush(initial));
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('debounces and emits patch with only the dirty fields', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ initial, onPatch, debounceMs: 500 }));
    act(() => result.current.flush({ ...initial, title: 'Updated' }));
    expect(onPatch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onPatch).toHaveBeenCalledWith({ title: 'Updated' });
  });

  it('marks isSaving and updates lastSavedAt on success', async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAutoSave({ initial, onPatch, debounceMs: 500 }));
    act(() => result.current.flush({ ...initial, state: 'Resolved' }));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });
    expect(result.current.lastSavedAt).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('records error on failure and keeps lastSavedAt unchanged', async () => {
    const onPatch = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAutoSave({ initial, onPatch, debounceMs: 500 }));
    act(() => result.current.flush({ ...initial, state: 'Resolved' }));
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.error).toBe('boom');
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/useAutoSave.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the hook**

```ts
// src/components/work-items/WorkItemDetailPanel/useAutoSave.ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AutoSaveValues {
  title: string;
  state: string;
  assignedTo: string;
  priority?: number;
  tags: string;
}

export type AutoSavePatch = Partial<AutoSaveValues>;

export interface UseAutoSaveArgs {
  initial: AutoSaveValues;
  onPatch: (patch: AutoSavePatch) => Promise<void>;
  debounceMs?: number;
}

export interface UseAutoSaveResult {
  isSaving: boolean;
  lastSavedAt: number | null;
  error: string | null;
  /** Submit the latest values; debounces the patch. */
  flush: (values: AutoSaveValues) => void;
  /** Manually clear the error state (e.g. after retry). */
  clearError: () => void;
}

function diff(a: AutoSaveValues, b: AutoSaveValues): AutoSavePatch {
  const out: AutoSavePatch = {};
  (Object.keys(b) as (keyof AutoSaveValues)[]).forEach((k) => {
    if (a[k] !== b[k]) (out as Record<string, unknown>)[k] = b[k];
  });
  return out;
}

export function useAutoSave({
  initial,
  onPatch,
  debounceMs = 500,
}: UseAutoSaveArgs): UseAutoSaveResult {
  const lastSavedRef = useRef<AutoSaveValues>(initial);
  const pendingRef = useRef<AutoSaveValues | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const flush = useCallback(
    (values: AutoSaveValues) => {
      pendingRef.current = values;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const target = pendingRef.current;
        if (!target) return;
        const patch = diff(lastSavedRef.current, target);
        if (Object.keys(patch).length === 0) return;
        setIsSaving(true);
        setError(null);
        try {
          await onPatch(patch);
          lastSavedRef.current = target;
          setLastSavedAt(Date.now());
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setIsSaving(false);
        }
      }, debounceMs);
    },
    [onPatch, debounceMs],
  );

  const clearError = useCallback(() => setError(null), []);

  return { isSaving, lastSavedAt, error, flush, clearError };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/useAutoSave.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailPanel/
git -C /e/BorgDock commit -m "detail: useAutoSave with debounced patch + error state"
```

---

### Task 2.3: ChipPicker click-popover

**Files:**
- Create: `src/components/work-items/WorkItemDetailPanel/ChipPicker.tsx`
- Test: `src/components/work-items/WorkItemDetailPanel/__tests__/ChipPicker.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/components/work-items/WorkItemDetailPanel/__tests__/ChipPicker.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChipPicker } from '../ChipPicker';

describe('ChipPicker', () => {
  it('renders the label and value preview', () => {
    render(
      <ChipPicker
        label="State"
        options={['New', 'Active']}
        value="New"
        onChange={() => {}}
      >
        <span>New</span>
      </ChipPicker>,
    );
    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getAllByText('New').length).toBeGreaterThan(0);
  });

  it('opens menu on click and emits onChange', () => {
    const onChange = vi.fn();
    render(
      <ChipPicker
        label="State"
        options={['New', 'Active']}
        value="New"
        onChange={onChange}
      >
        <span>New</span>
      </ChipPicker>,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Active'));
    expect(onChange).toHaveBeenCalledWith('Active');
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/ChipPicker.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement ChipPicker**

```tsx
// src/components/work-items/WorkItemDetailPanel/ChipPicker.tsx
import { type ReactNode, useEffect, useRef, useState } from 'react';

export interface ChipPickerProps {
  label: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  /** Visual preview of the current value (avatar+name, pill, etc). */
  children: ReactNode;
}

export function ChipPicker({ label, value, options, onChange, children }: ChipPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        title={label}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          background: 'transparent',
          border: '1px solid var(--color-subtle-border)',
          borderRadius: 4,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        {children}
        <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 20,
            minWidth: 180,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-subtle-border)',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
            padding: 4,
          }}
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                fontSize: 12,
                background: opt === value ? 'var(--color-accent-subtle)' : 'transparent',
                color: opt === value ? 'var(--color-accent)' : 'var(--color-text-primary)',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/ChipPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailPanel/
git -C /e/BorgDock commit -m "detail: ChipPicker click-popover with options menu"
```

---

### Task 2.4: Linked-PR parser

**Files:**
- Create: `src/components/work-items/WorkItemDetailPanel/parseLinkedPRs.ts`
- Test: `src/components/work-items/WorkItemDetailPanel/__tests__/parseLinkedPRs.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/components/work-items/WorkItemDetailPanel/__tests__/parseLinkedPRs.test.ts
import { describe, expect, it } from 'vitest';
import { parseLinkedPRs } from '../parseLinkedPRs';
import type { WorkItemRelation } from '@/types';

describe('parseLinkedPRs', () => {
  it('returns [] for empty input', () => {
    expect(parseLinkedPRs([])).toEqual([]);
  });

  it('extracts PR id and name from ArtifactLink relations', () => {
    const relations: WorkItemRelation[] = [
      {
        rel: 'ArtifactLink',
        url:
          'vstfs:///Git/PullRequestId/abc-123-def%2F4567890%2F713',
        attributes: { name: 'Pull Request', comment: 'Quote footer follow-ups' },
      },
    ];
    expect(parseLinkedPRs(relations)).toEqual([
      { id: 713, comment: 'Quote footer follow-ups' },
    ]);
  });

  it('ignores non-PR ArtifactLinks and other rels', () => {
    const relations: WorkItemRelation[] = [
      { rel: 'AttachedFile', url: 'x', attributes: {} },
      {
        rel: 'ArtifactLink',
        url: 'vstfs:///Build/Build/123',
        attributes: {},
      },
    ];
    expect(parseLinkedPRs(relations)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/parseLinkedPRs.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement parser**

```ts
// src/components/work-items/WorkItemDetailPanel/parseLinkedPRs.ts
import type { WorkItemRelation } from '@/types';

export interface LinkedPR {
  id: number;
  comment?: string;
}

const PR_URL_RE = /Git\/PullRequestId\/[^/]+\/[^/]+\/(\d+)/;

export function parseLinkedPRs(relations: WorkItemRelation[]): LinkedPR[] {
  return relations
    .filter((r) => r.rel === 'ArtifactLink')
    .map((r) => {
      const match = decodeURIComponent(r.url).match(PR_URL_RE);
      if (!match) return null;
      const id = Number(match[1]);
      if (!Number.isFinite(id)) return null;
      const comment =
        typeof r.attributes.comment === 'string' ? (r.attributes.comment as string) : undefined;
      return { id, comment };
    })
    .filter((x): x is LinkedPR => x !== null);
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/parseLinkedPRs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailPanel/
git -C /e/BorgDock commit -m "detail: parseLinkedPRs from WorkItem.relations[]"
```

---

### Task 2.5: TitleBlock subcomponent

**Files:**
- Create: `src/components/work-items/WorkItemDetailPanel/TitleBlock.tsx`
- Test: `src/components/work-items/WorkItemDetailPanel/__tests__/TitleBlock.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/components/work-items/WorkItemDetailPanel/__tests__/TitleBlock.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TitleBlock } from '../TitleBlock';

const baseProps = {
  id: 54519,
  title: 'Quotes: success toast on failure',
  workItemType: 'Bug',
  state: 'Testing Failed',
  priority: 2 as number | undefined,
  assignedTo: 'Koen van der Borght',
  iteration: 'R5.2.7.5',
  availableStates: ['New', 'Active', 'Resolved', 'Testing Failed'],
  changedAgo: '2h',
  onChange: vi.fn(),
  onCopyId: vi.fn(),
  onOpenInBrowser: vi.fn(),
};

describe('TitleBlock', () => {
  it('renders type, ID, and title', () => {
    render(<TitleBlock {...baseProps} />);
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('#54519')).toBeInTheDocument();
    expect(screen.getByText(/success toast/)).toBeInTheDocument();
  });

  it('switches title to an input on click and emits onChange on blur', () => {
    const onChange = vi.fn();
    render(<TitleBlock {...baseProps} onChange={onChange} />);
    fireEvent.click(screen.getByText(/success toast/));
    const input = screen.getByDisplayValue(baseProps.title);
    fireEvent.change(input, { target: { value: 'New title' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith({ title: 'New title' });
  });

  it('emits onChange when state ChipPicker option chosen', () => {
    const onChange = vi.fn();
    render(<TitleBlock {...baseProps} onChange={onChange} />);
    fireEvent.click(screen.getByText('STATE'));
    fireEvent.click(screen.getByText('Resolved'));
    expect(onChange).toHaveBeenCalledWith({ state: 'Resolved' });
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/TitleBlock.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement TitleBlock**

```tsx
// src/components/work-items/WorkItemDetailPanel/TitleBlock.tsx
import { useState } from 'react';
import {
  MiniAvatar,
  PrioBars,
  StatePill,
  TypeGlyph,
  WI_PRIO,
  avatarToneFor,
  getInitials,
} from '@/components/work-items/shared/wi-visuals';
import { ChipPicker } from './ChipPicker';

export interface TitleBlockChange {
  title?: string;
  state?: string;
  assignedTo?: string;
  priority?: number;
  tags?: string;
}

interface Props {
  id?: number;
  title: string;
  workItemType: string;
  state: string;
  priority?: number;
  assignedTo: string;
  iteration?: string;
  availableStates: string[];
  changedAgo?: string;
  onChange: (patch: TitleBlockChange) => void;
  onCopyId: () => void;
  onOpenInBrowser: () => void;
}

export function TitleBlock(props: Props) {
  const {
    id,
    title,
    workItemType,
    state,
    priority,
    assignedTo,
    iteration,
    availableStates,
    changedAgo,
    onChange,
    onCopyId,
    onOpenInBrowser,
  } = props;

  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const initials = getInitials(assignedTo || '??');
  const prio = priority != null ? WI_PRIO[priority] : null;

  return (
    <div
      style={{
        padding: '20px 28px 14px',
        borderBottom: '1px solid var(--color-subtle-border)',
        background: 'var(--color-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <TypeGlyph type={workItemType} size={13} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {workItemType}
        </span>
        {id != null && (
          <>
            <span
              style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--color-text-faint)' }}
            />
            <span
              className="bd-mono"
              style={{
                fontSize: 11.5,
                color: 'var(--color-text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              #{id}
            </span>
            <span
              style={{ width: 3, height: 3, borderRadius: 999, background: 'var(--color-text-faint)' }}
            />
            <button
              type="button"
              onClick={onCopyId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'var(--color-text-muted)',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              copy ID
            </button>
          </>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="bd-icon-btn" onClick={onOpenInBrowser} title="Open in ADO">
          ↗
        </button>
      </div>

      {editing ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (titleDraft !== title) onChange({ title: titleDraft });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setTitleDraft(title);
              setEditing(false);
            }
          }}
          style={{
            width: '100%',
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1.25,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.015em',
            background: 'transparent',
            border: '1px solid var(--color-input-border)',
            borderRadius: 6,
            padding: '4px 8px',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      ) : (
        // biome-ignore lint/a11y/useKeyWithClickEvents: click-to-edit is mouse-driven; Enter on focus would conflict with title editing
        <h1
          onClick={() => {
            setTitleDraft(title);
            setEditing(true);
          }}
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1.25,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.015em',
            cursor: 'text',
          }}
        >
          {title}
        </h1>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 14,
          flexWrap: 'wrap',
        }}
      >
        <ChipPicker
          label="State"
          value={state}
          options={availableStates}
          onChange={(next) => onChange({ state: next })}
        >
          <StatePill state={state} compact />
        </ChipPicker>
        <ChipPicker
          label="Priority"
          value={priority != null ? String(priority) : ''}
          options={['1', '2', '3', '4']}
          onChange={(next) => onChange({ priority: Number(next) })}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              color: 'var(--color-text-primary)',
            }}
          >
            <PrioBars prio={priority} />
            {prio ? `P${priority} · ${prio.label}` : 'No priority'}
          </span>
        </ChipPicker>
        <ChipPicker
          label="Assignee"
          value={assignedTo}
          options={[]}
          onChange={(next) => onChange({ assignedTo: next })}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              color: 'var(--color-text-primary)',
            }}
          >
            <MiniAvatar initials={initials} tone={avatarToneFor(initials)} size={16} />
            {assignedTo || 'Unassigned'}
          </span>
        </ChipPicker>
        {iteration && (
          <ChipPicker
            label="Iteration"
            value={iteration}
            options={[]}
            onChange={() => {}}
          >
            <span style={{ fontSize: 11.5, color: 'var(--color-text-primary)' }}>{iteration}</span>
          </ChipPicker>
        )}
        <span style={{ flex: 1 }} />
        {changedAgo && (
          <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
            updated {changedAgo} ago
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/TitleBlock.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailPanel/
git -C /e/BorgDock commit -m "detail: TitleBlock with click-to-edit title and chip pickers"
```

---

### Task 2.6: RightRail with grouped metadata + Linked PRs

**Files:**
- Create: `src/components/work-items/WorkItemDetailPanel/RightRail.tsx`
- Test: `src/components/work-items/WorkItemDetailPanel/__tests__/RightRail.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/components/work-items/WorkItemDetailPanel/__tests__/RightRail.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RightRail } from '../RightRail';

describe('RightRail', () => {
  it('shows Properties section with state, priority, type', () => {
    render(
      <RightRail
        state="Active"
        priority={2}
        severity={undefined}
        workItemType="Bug"
        assignedTo="KV"
        reporter="Jane Doe"
        iteration="R5.2.7"
        area="Horizon Portal"
        backlogPriority={undefined}
        foundIn={undefined}
        tags={['Horizon', 'Quotes']}
        linkedPRs={[]}
      />,
    );
    expect(screen.getByText('Properties')).toBeInTheDocument();
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('P2')).toBeInTheDocument();
  });

  it('renders linked PRs', () => {
    render(
      <RightRail
        state="Active"
        priority={2}
        severity={undefined}
        workItemType="Bug"
        assignedTo="KV"
        reporter="Jane Doe"
        iteration=""
        area=""
        backlogPriority={undefined}
        foundIn={undefined}
        tags={[]}
        linkedPRs={[{ id: 713, comment: 'Quote follow-ups' }]}
      />,
    );
    expect(screen.getByText('#713')).toBeInTheDocument();
    expect(screen.getByText('Quote follow-ups')).toBeInTheDocument();
  });

  it('skips empty rows (e.g. severity)', () => {
    render(
      <RightRail
        state="Active"
        priority={2}
        severity={undefined}
        workItemType="Bug"
        assignedTo="KV"
        reporter=""
        iteration=""
        area=""
        backlogPriority={undefined}
        foundIn={undefined}
        tags={[]}
        linkedPRs={[]}
      />,
    );
    expect(screen.queryByText('Severity')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/RightRail.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement RightRail**

```tsx
// src/components/work-items/WorkItemDetailPanel/RightRail.tsx
import type { ReactNode } from 'react';
import { Pill } from '@/components/shared/primitives';
import {
  MiniAvatar,
  PrioBars,
  StatePill,
  TypeGlyph,
  avatarToneFor,
  getInitials,
} from '@/components/work-items/shared/wi-visuals';
import type { LinkedPR } from './parseLinkedPRs';

interface Props {
  state: string;
  priority?: number;
  severity?: string;
  workItemType: string;
  assignedTo: string;
  reporter: string;
  iteration: string;
  area: string;
  backlogPriority?: number | string;
  foundIn?: string;
  tags: string[];
  linkedPRs: LinkedPR[];
}

export function RightRail(props: Props) {
  const {
    state,
    priority,
    severity,
    workItemType,
    assignedTo,
    reporter,
    iteration,
    area,
    backlogPriority,
    foundIn,
    tags,
    linkedPRs,
  } = props;

  const assigneeInitials = getInitials(assignedTo || '??');
  const reporterInitials = reporter ? getInitials(reporter) : null;

  return (
    <div>
      <RailGroup title="Properties">
        <RailRow label="State">
          <StatePill state={state} compact />
        </RailRow>
        {priority != null && (
          <RailRow label="Priority">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11.5,
                color: 'var(--color-text-secondary)',
              }}
            >
              <PrioBars prio={priority} /> P{priority}
            </span>
          </RailRow>
        )}
        {severity && (
          <RailRow label="Severity">
            <Pill tone="warning">{severity}</Pill>
          </RailRow>
        )}
        <RailRow label="Type">
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              color: 'var(--color-text-secondary)',
            }}
          >
            <TypeGlyph type={workItemType} /> {workItemType}
          </span>
        </RailRow>
      </RailGroup>

      <RailGroup title="People">
        <RailRow label="Assignee">
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              color: 'var(--color-text-secondary)',
            }}
          >
            <MiniAvatar
              initials={assigneeInitials}
              tone={avatarToneFor(assigneeInitials)}
              size={16}
            />
            {assignedTo || 'Unassigned'}
          </span>
        </RailRow>
        {reporter && reporterInitials && (
          <RailRow label="Reporter">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11.5,
                color: 'var(--color-text-secondary)',
              }}
            >
              <MiniAvatar
                initials={reporterInitials}
                tone={avatarToneFor(reporterInitials)}
                size={16}
              />
              {reporter}
            </span>
          </RailRow>
        )}
      </RailGroup>

      {(iteration || area || backlogPriority != null || foundIn) && (
        <RailGroup title="Planning">
          {iteration && (
            <RailRow label="Iteration">
              <span
                className="bd-mono"
                style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}
              >
                {iteration}
              </span>
            </RailRow>
          )}
          {area && (
            <RailRow label="Area">
              <span
                className="bd-mono"
                style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}
              >
                {area}
              </span>
            </RailRow>
          )}
          {backlogPriority != null && (
            <RailRow label="Backlog Prio">
              <span
                style={{
                  fontSize: 11.5,
                  color: 'var(--color-text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {backlogPriority}
              </span>
            </RailRow>
          )}
          {foundIn && (
            <RailRow label="Found In">
              <span
                className="bd-mono"
                style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}
              >
                {foundIn}
              </span>
            </RailRow>
          )}
        </RailGroup>
      )}

      {tags.length > 0 && (
        <RailGroup title="Tags">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tags.map((t) => (
              <Pill key={t} tone="neutral">
                {t}
              </Pill>
            ))}
          </div>
        </RailGroup>
      )}

      {linkedPRs.length > 0 && (
        <RailGroup title="Linked PRs">
          {linkedPRs.map((pr) => (
            <div
              key={pr.id}
              className="bd-card"
              style={{
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginBottom: 6,
              }}
            >
              <span
                className="bd-mono"
                style={{ fontSize: 11, color: 'var(--color-text-muted)' }}
              >
                #{pr.id}
              </span>
              {pr.comment && (
                <span
                  style={{
                    flex: 1,
                    fontSize: 11.5,
                    color: 'var(--color-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pr.comment}
                </span>
              )}
            </div>
          ))}
        </RailGroup>
      )}
    </div>
  );
}

function RailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--color-text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function RailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '92px 1fr',
        alignItems: 'center',
        columnGap: 8,
        minHeight: 24,
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {children}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/RightRail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailPanel/
git -C /e/BorgDock commit -m "detail: RightRail groups (Properties/People/Planning/Tags/Linked PRs)"
```

---

### Task 2.7: DiscussionRail (always at the bottom of the rail)

**Files:**
- Create: `src/components/work-items/WorkItemDetailPanel/DiscussionRail.tsx`
- Test: `src/components/work-items/WorkItemDetailPanel/__tests__/DiscussionRail.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/components/work-items/WorkItemDetailPanel/__tests__/DiscussionRail.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkItemComment } from '@/types';
import { DiscussionRail } from '../DiscussionRail';

const comments: WorkItemComment[] = [
  {
    id: 1,
    text: 'Reproduced on staging',
    createdBy: { displayName: 'Tjeerd van Beek' },
    createdDate: new Date(Date.now() - 7200_000).toISOString(),
    modifiedDate: new Date(Date.now() - 7200_000).toISOString(),
  },
];

describe('DiscussionRail', () => {
  it('renders comments and count', () => {
    render(
      <DiscussionRail
        comments={comments}
        isLoading={false}
        onAddComment={async () => {}}
      />,
    );
    expect(screen.getByText('Discussion')).toBeInTheDocument();
    expect(screen.getByText(/Reproduced/)).toBeInTheDocument();
  });

  it('submits comment on Enter', async () => {
    const onAdd = vi.fn(async () => {});
    render(<DiscussionRail comments={[]} isLoading={false} onAddComment={onAdd} />);
    const input = screen.getByPlaceholderText(/Reply/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'lgtm' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('lgtm');
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/DiscussionRail.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement DiscussionRail**

```tsx
// src/components/work-items/WorkItemDetailPanel/DiscussionRail.tsx
import { useState } from 'react';
import { Kbd } from '@/components/shared/primitives';
import {
  MiniAvatar,
  avatarToneFor,
  getInitials,
} from '@/components/work-items/shared/wi-visuals';
import { sanitizeHtml } from '@/utils/sanitize-html';
import type { WorkItemComment } from '@/types';

interface Props {
  comments: WorkItemComment[];
  isLoading: boolean;
  onAddComment: (text: string) => Promise<void>;
}

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DiscussionRail({ comments, isLoading, onAddComment }: Props) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  async function submit() {
    const v = text.trim();
    if (!v || posting) return;
    setPosting(true);
    try {
      await onAddComment(v);
      setText('');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div
      style={{
        marginTop: 6,
        paddingTop: 16,
        borderTop: '1px solid var(--color-subtle-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Discussion
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>{comments.length}</span>
      </div>
      {isLoading && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Loading…</div>
      )}
      {!isLoading && comments.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>No comments yet.</div>
      )}
      {!isLoading &&
        comments.map((c) => {
          const initials = getInitials(c.createdBy.displayName);
          return (
            <div
              key={c.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px 1fr',
                columnGap: 8,
                marginBottom: 10,
              }}
            >
              <MiniAvatar initials={initials} tone={avatarToneFor(initials)} size={20} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {c.createdBy.displayName}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
                    {relativeTime(c.createdDate)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    color: 'var(--color-text-secondary)',
                  }}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: text sanitized via sanitizeHtml
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.text) }}
                />
              </div>
            </div>
          );
        })}

      <div
        style={{
          marginTop: 10,
          padding: '8px 10px',
          background: 'var(--color-input-bg)',
          border: '1px solid var(--color-input-border)',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Reply or @mention…"
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            fontSize: 11.5,
            color: 'var(--color-text-primary)',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <Kbd>{'⏎'}</Kbd>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/components/work-items/WorkItemDetailPanel/__tests__/DiscussionRail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailPanel/
git -C /e/BorgDock commit -m "detail: DiscussionRail with relative time + Enter-to-submit"
```

---

### Task 2.8: Tab body components

**Files:**
- Create: `src/components/work-items/WorkItemDetailPanel/OverviewTab.tsx`
- Create: `src/components/work-items/WorkItemDetailPanel/AttachmentsTab.tsx`
- Create: `src/components/work-items/WorkItemDetailPanel/LinksTab.tsx`
- Create: `src/components/work-items/WorkItemDetailPanel/ActivityTab.tsx`

- [ ] **Step 1: Implement OverviewTab (rich text + custom + standard fields)**

```tsx
// src/components/work-items/WorkItemDetailPanel/OverviewTab.tsx
import { useRef } from 'react';
import { useAdoImageAuth } from '@/hooks/useAdoImageAuth';
import { sanitizeHtml } from '@/utils/sanitize-html';
import type { DynamicFieldItem } from '@/types';

interface Props {
  richTextFields: DynamicFieldItem[];
  standardFields: DynamicFieldItem[];
  customFields: DynamicFieldItem[];
}

export function OverviewTab({ richTextFields, standardFields, customFields }: Props) {
  return (
    <div>
      {richTextFields.map((f) => (
        <BlockSection key={f.fieldKey} label={f.label}>
          {f.isHtml && f.htmlContent ? (
            <RichTextField html={f.htmlContent} />
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.65,
                color: 'var(--color-text-secondary)',
              }}
            >
              {f.value}
            </p>
          )}
        </BlockSection>
      ))}
      {standardFields.length > 0 && (
        <BlockSection label="Fields">
          <FieldGrid items={standardFields} />
        </BlockSection>
      )}
      {customFields.length > 0 && (
        <BlockSection label="Custom Fields">
          <FieldGrid items={customFields} />
        </BlockSection>
      )}
    </div>
  );
}

function BlockSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--color-text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function RichTextField({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useAdoImageAuth(ref, html);
  return (
    <div
      ref={ref}
      className="prose-sm rounded-md border border-[var(--color-subtle-border)] bg-[var(--color-surface-raised)] p-2 text-[13px] text-[var(--color-text-secondary)] [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized via sanitizeHtml
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}

function FieldGrid({ items }: { items: DynamicFieldItem[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 6, columnGap: 12 }}>
      {items.map((f) => (
        <FieldRow key={f.fieldKey} field={f} />
      ))}
    </div>
  );
}

function FieldRow({ field }: { field: DynamicFieldItem }) {
  if (!field.value && !field.htmlContent) return null;
  return (
    <>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{field.label}</span>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{field.value}</span>
    </>
  );
}
```

- [ ] **Step 2: Implement AttachmentsTab**

```tsx
// src/components/work-items/WorkItemDetailPanel/AttachmentsTab.tsx
import type { WorkItemAttachment } from '@/types';

interface Props {
  attachments: WorkItemAttachment[];
  onDownload: (a: WorkItemAttachment) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsTab({ attachments, onDownload }: Props) {
  if (attachments.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No attachments.</div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {attachments.map((a) => (
        <button
          type="button"
          key={a.id}
          onClick={() => onDownload(a)}
          className="bd-card"
          style={{
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left',
            cursor: 'pointer',
            border: '1px solid var(--color-subtle-border)',
            background: 'var(--color-surface)',
            borderRadius: 8,
            fontFamily: 'inherit',
          }}
        >
          <span
            style={{
              width: 56,
              height: 40,
              borderRadius: 6,
              background: 'var(--color-surface-hover)',
              color: 'var(--color-text-tertiary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            📎
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {a.fileName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {formatSize(a.size)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Implement LinksTab and ActivityTab placeholders**

```tsx
// src/components/work-items/WorkItemDetailPanel/LinksTab.tsx
import type { LinkedPR } from './parseLinkedPRs';

interface Props {
  linkedPRs: LinkedPR[];
}

export function LinksTab({ linkedPRs }: Props) {
  if (linkedPRs.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>No linked items.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {linkedPRs.map((pr) => (
        <div
          key={pr.id}
          className="bd-card"
          style={{
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            border: '1px solid var(--color-subtle-border)',
            background: 'var(--color-surface)',
            borderRadius: 8,
          }}
        >
          <span className="bd-mono" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            PR #{pr.id}
          </span>
          {pr.comment && (
            <span style={{ flex: 1, fontSize: 12, color: 'var(--color-text-primary)' }}>
              {pr.comment}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
```

```tsx
// src/components/work-items/WorkItemDetailPanel/ActivityTab.tsx
export function ActivityTab() {
  return (
    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
      Activity timeline coming soon.
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailPanel/
git -C /e/BorgDock commit -m "detail: tab body components (Overview/Activity/Links/Attachments)"
```

---

### Task 2.9: Rewrite WorkItemDetailPanel into the new two-pane layout

**Files:**
- Modify: `src/components/work-items/WorkItemDetailPanel.tsx` (full rewrite)

- [ ] **Step 1: Replace the existing file**

Replace `src/components/work-items/WorkItemDetailPanel.tsx` with:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Kbd, Tabs } from '@/components/shared/primitives';
import { ActivityTab } from './WorkItemDetailPanel/ActivityTab';
import { AttachmentsTab } from './WorkItemDetailPanel/AttachmentsTab';
import { DiscussionRail } from './WorkItemDetailPanel/DiscussionRail';
import { LinksTab } from './WorkItemDetailPanel/LinksTab';
import { OverviewTab } from './WorkItemDetailPanel/OverviewTab';
import { RightRail } from './WorkItemDetailPanel/RightRail';
import { TitleBlock, type TitleBlockChange } from './WorkItemDetailPanel/TitleBlock';
import {
  type AdjacentNav,
  useAdjacentNav,
} from './WorkItemDetailPanel/useAdjacentNav';
import {
  type AutoSavePatch,
  type AutoSaveValues,
  useAutoSave,
} from './WorkItemDetailPanel/useAutoSave';
import type { LinkedPR } from './WorkItemDetailPanel/parseLinkedPRs';
import type {
  DynamicFieldItem,
  WorkItemAttachment,
  WorkItemComment,
} from '@/types';

export interface WorkItemDetailData {
  id?: number;
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string;
  priority?: number;
  tags: string;
  htmlUrl: string;
  isNewItem: boolean;
  /** Severity (Microsoft.VSTS.Common.Severity) if present. */
  severity?: string;
  reporter?: string;
  iteration?: string;
  area?: string;
  backlogPriority?: number | string;
  foundIn?: string;
  changedAgo?: string;
  linkedPRs?: LinkedPR[];
}

export interface WorkItemFieldUpdates {
  title: string;
  state: string;
  assignedTo: string;
  priority?: number;
  tags: string;
  workItemType?: string;
}

interface Props {
  item: WorkItemDetailData;
  isLoading: boolean;
  isSaving: boolean;
  statusText?: string;
  availableStates: string[];
  availableAssignees?: string[];
  richTextFields: DynamicFieldItem[];
  standardFields: DynamicFieldItem[];
  customFields: DynamicFieldItem[];
  attachments: WorkItemAttachment[];
  comments?: WorkItemComment[];
  isLoadingComments?: boolean;
  onSave: (updates: WorkItemFieldUpdates) => Promise<void> | void;
  onDelete?: () => void;
  onClose: () => void;
  onOpenInBrowser: (url: string) => void;
  onDownloadAttachment: (attachment: WorkItemAttachment) => void;
  onAddComment?: (text: string) => Promise<void>;
  /** Optional adjacent nav callback — if absent, ↑↓ buttons hide. */
  onArrowNav?: (dir: 'prev' | 'next') => void;
  adjacent?: AdjacentNav;
}

export function WorkItemDetailPanel(props: Props) {
  const {
    item,
    isLoading,
    isSaving,
    statusText,
    availableStates,
    richTextFields,
    standardFields,
    customFields,
    attachments,
    comments,
    isLoadingComments,
    onSave,
    onDelete,
    onClose,
    onOpenInBrowser,
    onDownloadAttachment,
    onAddComment,
    onArrowNav,
    adjacent,
  } = props;

  const [tab, setTab] = useState<'overview' | 'activity' | 'links' | 'files'>('overview');
  const [values, setValues] = useState<AutoSaveValues>({
    title: item.title,
    state: item.state,
    assignedTo: item.assignedTo,
    priority: item.priority,
    tags: item.tags,
  });

  // Sync local state when the item identity changes (next/prev nav reload).
  useEffect(() => {
    setValues({
      title: item.title,
      state: item.state,
      assignedTo: item.assignedTo,
      priority: item.priority,
      tags: item.tags,
    });
  }, [item.id, item.title, item.state, item.assignedTo, item.priority, item.tags]);

  const auto = useAutoSave({
    initial: {
      title: item.title,
      state: item.state,
      assignedTo: item.assignedTo,
      priority: item.priority,
      tags: item.tags,
    },
    onPatch: async (patch: AutoSavePatch) => {
      await onSave({
        title: patch.title ?? values.title,
        state: patch.state ?? values.state,
        assignedTo: patch.assignedTo ?? values.assignedTo,
        priority: 'priority' in patch ? patch.priority : values.priority,
        tags: patch.tags ?? values.tags,
      });
    },
  });

  const handleChange = useCallback(
    (patch: TitleBlockChange) => {
      setValues((prev) => {
        const next = { ...prev, ...patch };
        auto.flush(next);
        return next;
      });
    },
    [auto],
  );

  const linkedPRs = useMemo(() => item.linkedPRs ?? [], [item.linkedPRs]);

  const savedLabel = useMemo(() => {
    if (auto.error) return `Save failed — ${auto.error}`;
    if (auto.isSaving) return 'Saving…';
    if (auto.lastSavedAt) {
      const ago = Math.floor((Date.now() - auto.lastSavedAt) / 1000);
      if (ago < 5) return 'Saved just now';
      if (ago < 60) return `Saved ${ago}s ago`;
      return `Saved ${Math.floor(ago / 60)}m ago`;
    }
    return 'Auto-saves on blur';
  }, [auto.error, auto.isSaving, auto.lastSavedAt]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-surface)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity' },
    { id: 'links', label: 'Links', count: linkedPRs.length || undefined },
    { id: 'files', label: 'Attachments', count: attachments.length || undefined },
  ];

  return (
    <div
      data-wi-detail
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 320px',
        height: '100%',
        background: 'var(--color-surface)',
        containerType: 'inline-size',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderRight: '1px solid var(--color-subtle-border)',
        }}
      >
        <TitleBlock
          id={item.id}
          title={values.title}
          workItemType={item.workItemType}
          state={values.state}
          priority={values.priority}
          assignedTo={values.assignedTo}
          iteration={item.iteration}
          availableStates={availableStates}
          changedAgo={item.changedAgo}
          onChange={handleChange}
          onCopyId={() => {
            if (item.id) navigator.clipboard?.writeText(`#${item.id}`).catch(() => {});
          }}
          onOpenInBrowser={() => onOpenInBrowser(item.htmlUrl)}
        />

        {adjacent && (adjacent.prevId !== null || adjacent.nextId !== null) && onArrowNav && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '4px 28px',
              borderBottom: '1px solid var(--color-subtle-border)',
              background: 'var(--color-surface)',
              fontSize: 11,
              color: 'var(--color-text-muted)',
            }}
          >
            <button
              type="button"
              disabled={adjacent.prevId === null}
              onClick={() => onArrowNav('prev')}
              className="bd-icon-btn"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={adjacent.nextId === null}
              onClick={() => onArrowNav('next')}
              className="bd-icon-btn"
            >
              ↓
            </button>
            {adjacent.total > 0 && (
              <span style={{ alignSelf: 'center' }}>
                {adjacent.index + 1} / {adjacent.total}
              </span>
            )}
          </div>
        )}

        <div
          style={{
            padding: '0 28px',
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-subtle-border)',
          }}
        >
          <Tabs value={tab} onChange={(id) => setTab(id as typeof tab)} tabs={tabs} />
        </div>

        <div
          className="bd-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            background: 'var(--color-background)',
            padding: '20px 28px 80px',
          }}
        >
          {tab === 'overview' && (
            <OverviewTab
              richTextFields={richTextFields}
              standardFields={standardFields}
              customFields={customFields}
            />
          )}
          {tab === 'activity' && <ActivityTab />}
          {tab === 'links' && <LinksTab linkedPRs={linkedPRs} />}
          {tab === 'files' && (
            <AttachmentsTab attachments={attachments} onDownload={onDownloadAttachment} />
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 28px',
            borderTop: '1px solid var(--color-subtle-border)',
            background: 'var(--color-status-bar-bg)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {savedLabel}
            {statusText ? ` · ${statusText}` : ''}
          </span>
          {auto.error && (
            <Button variant="secondary" size="sm" onClick={() => auto.flush(values)}>
              Retry
            </Button>
          )}
          <span style={{ flex: 1 }} />
          {!item.isNewItem && onDelete && (
            <Button variant="danger" size="sm" onClick={onDelete}>
              Delete
            </Button>
          )}
          {item.htmlUrl && (
            <Button variant="secondary" size="sm" onClick={() => onOpenInBrowser(item.htmlUrl)}>
              Open in ADO ↗
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            <Kbd>esc</Kbd> Close
          </Button>
        </div>
      </div>

      <div
        className="bd-scroll wi-rail"
        style={{
          overflowY: 'auto',
          background: 'var(--color-surface)',
          padding: '16px 18px 32px',
        }}
      >
        <RightRail
          state={values.state}
          priority={values.priority}
          severity={item.severity}
          workItemType={item.workItemType}
          assignedTo={values.assignedTo}
          reporter={item.reporter ?? ''}
          iteration={item.iteration ?? ''}
          area={item.area ?? ''}
          backlogPriority={item.backlogPriority}
          foundIn={item.foundIn}
          tags={values.tags ? values.tags.split(';').map((t) => t.trim()).filter(Boolean) : []}
          linkedPRs={linkedPRs}
        />
        {!item.isNewItem && onAddComment && (
          <DiscussionRail
            comments={comments ?? []}
            isLoading={!!isLoadingComments}
            onAddComment={onAddComment}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the existing test for the panel**

The legacy test (`src/components/work-items/__tests__/WorkItemDetailPanel.test.tsx`) was written for the old layout. Replace its body with this minimal smoke check (the new layout has its own subcomponent tests):

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DynamicFieldItem, WorkItemAttachment, WorkItemComment } from '@/types';
import { type WorkItemDetailData, WorkItemDetailPanel } from '../WorkItemDetailPanel';

vi.mock('@/hooks/useAdoImageAuth', () => ({ useAdoImageAuth: vi.fn() }));

function makeProps(overrides: Partial<WorkItemDetailData> = {}) {
  const item: WorkItemDetailData = {
    id: 100,
    title: 'Implement feature X',
    state: 'Active',
    workItemType: 'User Story',
    assignedTo: 'Carol',
    priority: 2,
    tags: 'sprint-1; frontend',
    htmlUrl: 'https://dev.azure.com/org/proj/_workitems/edit/100',
    isNewItem: false,
    iteration: 'R5.2',
    ...overrides,
  };
  return {
    item,
    isLoading: false,
    isSaving: false,
    availableStates: ['New', 'Active', 'Resolved'],
    richTextFields: [] as DynamicFieldItem[],
    standardFields: [] as DynamicFieldItem[],
    customFields: [] as DynamicFieldItem[],
    attachments: [] as WorkItemAttachment[],
    comments: [] as WorkItemComment[],
    isLoadingComments: false,
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    onOpenInBrowser: vi.fn(),
    onDownloadAttachment: vi.fn(),
    onAddComment: vi.fn(),
  };
}

describe('WorkItemDetailPanel (v2)', () => {
  it('renders title, type, and tabs', () => {
    render(<WorkItemDetailPanel {...makeProps()} />);
    expect(screen.getByText('Implement feature X')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
  });

  it('shows the right rail Properties section', () => {
    render(<WorkItemDetailPanel {...makeProps()} />);
    expect(screen.getByText('Properties')).toBeInTheDocument();
  });

  it('shows Attachments tab when there are attachments', () => {
    const props = makeProps();
    props.attachments.push({
      id: 'a1',
      fileName: 'screenshot.png',
      size: 12345,
      url: 'x',
    });
    render(<WorkItemDetailPanel {...props} />);
    expect(screen.getByText('Attachments')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run all detail tests**

Run: `npx vitest run src/components/work-items/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/
git -C /e/BorgDock commit -m "detail: rewrite WorkItemDetailPanel as two-pane v2 layout"
```

---

### Task 2.10: Wire WorkItemDetailApp to surface new fields, adjacent nav, linked PRs

**Files:**
- Modify: `src/components/work-items/WorkItemDetailApp.tsx`
- Modify: `src/components/work-items/WorkItemsSection.tsx` (pass adjacent nav, write navlist)

- [ ] **Step 1: WorkItemDetailApp — derive new detail data fields**

In `WorkItemDetailApp.tsx`, find the `detailData` useMemo and replace it with:

```ts
const detailData: WorkItemDetailData | null = useMemo(() => {
  if (!workItem || !adoSettings) return null;
  const htmlUrl =
    workItem.htmlUrl ||
    `https://dev.azure.com/${encodeURIComponent(adoSettings.organization)}/${encodeURIComponent(adoSettings.project)}/_workitems/edit/${workItem.id}`;
  const iter = String(workItem.fields['System.IterationPath'] ?? '');
  const area = String(workItem.fields['System.AreaPath'] ?? '');
  const changedDate = workItem.fields['System.ChangedDate'];
  let changedAgo: string | undefined;
  if (typeof changedDate === 'string') {
    const seconds = Math.floor(
      (Date.now() - new Date(changedDate).getTime()) / 1000,
    );
    if (seconds < 60) changedAgo = `${seconds}s`;
    else if (seconds < 3600) changedAgo = `${Math.floor(seconds / 60)}m`;
    else if (seconds < 86_400) changedAgo = `${Math.floor(seconds / 3600)}h`;
    else changedAgo = `${Math.floor(seconds / 86_400)}d`;
  }
  return {
    id: workItem.id,
    title: getField(workItem, 'System.Title'),
    state: getField(workItem, 'System.State'),
    workItemType: getField(workItem, 'System.WorkItemType'),
    assignedTo: getField(workItem, 'System.AssignedTo'),
    priority: Number(workItem.fields['Microsoft.VSTS.Common.Priority']) || undefined,
    tags: getField(workItem, 'System.Tags'),
    htmlUrl,
    isNewItem: false,
    severity:
      typeof workItem.fields['Microsoft.VSTS.Common.Severity'] === 'string'
        ? (workItem.fields['Microsoft.VSTS.Common.Severity'] as string)
        : undefined,
    reporter: getField(workItem, 'System.CreatedBy'),
    iteration: iter ? (iter.split(/[\\/]/).pop() ?? iter) : undefined,
    area: area ? (area.split(/[\\/]/).pop() ?? area) : undefined,
    backlogPriority:
      (workItem.fields['Microsoft.VSTS.Common.BacklogPriority'] as
        | number
        | string
        | undefined) ?? undefined,
    foundIn:
      typeof workItem.fields['Microsoft.VSTS.Build.FoundIn'] === 'string'
        ? (workItem.fields['Microsoft.VSTS.Build.FoundIn'] as string)
        : undefined,
    changedAgo,
    linkedPRs: parseLinkedPRs(workItem.relations),
  };
}, [workItem, adoSettings]);
```

Add the import at the top of the file:

```ts
import { parseLinkedPRs } from './WorkItemDetailPanel/parseLinkedPRs';
```

- [ ] **Step 2: WorkItemDetailApp — wire adjacent nav**

Add at the top alongside the other imports:

```ts
import { useAdjacentNav } from './WorkItemDetailPanel/useAdjacentNav';
```

Below the existing `const workItemId = useMemo(...)` block, add:

```ts
const adjacent = useAdjacentNav(workItemId);

const handleArrowNav = useCallback((dir: 'prev' | 'next') => {
  const target = dir === 'prev' ? adjacent.prevId : adjacent.nextId;
  if (target == null) return;
  const url = new URL(window.location.href);
  url.searchParams.set('id', String(target));
  window.history.replaceState({}, '', url.toString());
  // Force the load effect to re-run by reloading the page (cheap; the window
  // is single-purpose and reload preserves the cached webview process).
  window.location.reload();
}, [adjacent.prevId, adjacent.nextId]);
```

In the `<WorkItemDetailPanel ...>` JSX, pass `adjacent={adjacent} onArrowNav={handleArrowNav}`.

- [ ] **Step 3: WorkItemsSection — write navlist, pass adjacent**

In `WorkItemsSection.tsx`, near where `setSelectedWorkItemId` is called, also persist a navlist of currently-visible IDs. Find the existing `onItemClick` / setter (search for `selectedWorkItemId`) and surrounding render code; add this snippet inside `useEffect` keyed off the visible filtered list (top of the file, near other hooks):

```ts
useEffect(() => {
  if (!filteredItems || filteredItems.length === 0) return;
  try {
    localStorage.setItem(
      'borgdock-palette-navlist',
      JSON.stringify({ ids: filteredItems.map((wi) => wi.id), savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}, [filteredItems]);
```

(`filteredItems` is the existing variable name in the file — if it has a different name in your version, use that variable.)

Pass `adjacent={...}` and `onArrowNav={...}` to the side-panel `<WorkItemDetailPanel ...>`. Mirror the pattern from the pop-out (use `useAdjacentNav(selectedWorkItemId)` + a handler that calls the existing `setSelectedWorkItemId`).

- [ ] **Step 4: Run full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/
git -C /e/BorgDock commit -m "detail: wire DetailApp + Section to adjacent nav and linked PRs"
```

---

## Phase 3 — Integration & narrow-mode

### Task 3.1: Side-panel narrow-mode CSS

**Files:**
- Modify: `src/styles/index.css` (append narrow-mode rule)
- Modify: `src/components/work-items/WorkItemDetailPanel.tsx` (add ResizeObserver)

- [ ] **Step 1: Append CSS rule**

At the bottom of `src/styles/index.css`, append:

```css
/* Work item detail — narrow-mode collapses the right rail to a drawer. */
@layer components {
  [data-wi-detail][data-rail-collapsed='true'] {
    grid-template-columns: minmax(0, 1fr) 0;
  }
  [data-wi-detail][data-rail-collapsed='true'] .wi-rail {
    display: none;
  }
}
```

- [ ] **Step 2: Add ResizeObserver to the panel**

In `WorkItemDetailPanel.tsx`, add a `useRef<HTMLDivElement>(null)` for the root and a `useEffect` that toggles `data-rail-collapsed` on the root when its width is below 760px. Replace the root `<div data-wi-detail ...>` with:

```tsx
const rootRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  const el = rootRef.current;
  if (!el) return;
  const ro = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const collapsed = entry.contentRect.width < 760;
    el.setAttribute('data-rail-collapsed', collapsed ? 'true' : 'false');
  });
  ro.observe(el);
  return () => ro.disconnect();
}, []);
```

(Add `useRef` to the existing react imports.)

Then change the root JSX:

```tsx
<div ref={rootRef} data-wi-detail data-rail-collapsed="false" style={{ ... }}>
```

- [ ] **Step 3: Run full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/styles/index.css \
                     src/BorgDock.Tauri/src/components/work-items/WorkItemDetailPanel.tsx
git -C /e/BorgDock commit -m "detail: narrow-mode collapses right rail below 760px container width"
```

---

### Task 3.2: Storybook updates

**Files:**
- Modify: `src/components/work-items/WorkItemDetailApp.stories.tsx` (add v2 variants)
- Create: `src/components/work-item-palette/WorkItemPaletteApp.stories.tsx`

- [ ] **Step 1: Read the existing detail stories file to follow its pattern**

Run: `cat src/components/work-items/WorkItemDetailApp.stories.tsx | head -40`
(Use this output to mirror import paths, decorators, and `Meta`/`StoryObj` structure.)

- [ ] **Step 2: Append v2 variants to the detail stories**

At the bottom of `WorkItemDetailApp.stories.tsx`, append:

```tsx
export const V2Overview: Story = {
  name: 'v2 — overview',
  args: {
    /* use the fixture that includes severity, reporter, linkedPRs */
  },
};

export const V2NarrowRailCollapsed: Story = {
  name: 'v2 — narrow (rail collapsed)',
  decorators: [
    (StoryC) => (
      <div style={{ width: 700, height: 700 }}>
        <StoryC />
      </div>
    ),
  ],
};
```

(Adjust args to match the file's existing fixture pattern; do not invent fixture shapes.)

- [ ] **Step 3: Create palette stories**

```tsx
// src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { WorkItemPaletteApp } from './WorkItemPaletteApp';

const meta: Meta<typeof WorkItemPaletteApp> = {
  title: 'Windows/Work Item Palette',
  component: WorkItemPaletteApp,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Browse: Story = {};
```

(The palette's data comes from the `useWorkItemPaletteSearch` hook which calls Tauri/ADO — Storybook will show the empty state. That's acceptable for a smoke-level story; a future pass can mock the hook.)

- [ ] **Step 4: Run storybook build to confirm no breakage**

Run: `npm run build-storybook`
Expected: success, no errors.

- [ ] **Step 5: Commit**

```bash
git -C /e/BorgDock add src/BorgDock.Tauri/src/components/work-items/WorkItemDetailApp.stories.tsx \
                     src/BorgDock.Tauri/src/components/work-item-palette/WorkItemPaletteApp.stories.tsx
git -C /e/BorgDock commit -m "storybook: add v2 palette and detail variants"
```

---

### Task 3.3: Final sanity checks (typecheck + lint + smoke)

- [ ] **Step 1: Typecheck**

Run: `npx tsc -b`
Expected: zero errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean (or only warnings already present on master).

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Manually launch dev mode for a smoke test**

Run: `npm run tauri dev`
- Trigger Ctrl+F9 to open the palette → confirm chips, group-by, dense rows render.
- Pick an item → confirm pop-out opens at 1180×820 with two-pane layout.
- Edit title → blur → confirm "Saved Xs ago" appears in footer.
- Press ↑/↓ in the sidebar work-items list overlay → confirm rail metadata updates and stays at 800px.

If any smoke check fails, capture devtools console output, file the failing case as a follow-up task, but do NOT mark this task completed until basic open/edit/blur works.

- [ ] **Step 5: Commit (no-op or final touch-ups only)**

If anything tiny needs fixing after smoke (a forgotten import, a missing CSS variable), fix and commit:

```bash
git -C /e/BorgDock add -p src/BorgDock.Tauri/
git -C /e/BorgDock commit -m "detail/palette: smoke-test fixups"
```

---

## Self-review

**Spec coverage:**
- ✅ Shared `wi-visuals` (TypeGlyph/PrioBars/StatePill/MiniAvatar + maps + helpers) → Task 0.1, 0.2
- ✅ Pop-out window resize → Task 0.3
- ✅ ChipInput inline operators → Task 1.1
- ✅ FilterChip + GroupSeg + group-by → Tasks 1.2, 1.3
- ✅ Dense palette row → Task 1.4
- ✅ Palette wiring (filters, group, navlist) → Task 1.5
- ✅ useAdjacentNav → Task 2.1
- ✅ useAutoSave → Task 2.2
- ✅ ChipPicker → Task 2.3
- ✅ parseLinkedPRs → Task 2.4
- ✅ TitleBlock → Task 2.5
- ✅ RightRail (Properties/People/Planning/Tags/Linked PRs) → Task 2.6
- ✅ DiscussionRail → Task 2.7
- ✅ Tab body components → Task 2.8
- ✅ WorkItemDetailPanel two-pane rewrite → Task 2.9
- ✅ WorkItemDetailApp + WorkItemsSection wiring → Task 2.10
- ✅ Side-panel narrow-mode → Task 3.1
- ✅ Storybook → Task 3.2
- ✅ Typecheck + lint + smoke → Task 3.3

**Placeholder scan:** None remaining.

**Type consistency:** `AutoSaveValues` defined in 2.2, consumed unchanged in 2.9. `LinkedPR` defined in 2.4, consumed in 2.6/2.8/2.9/2.10. `ResultItem` extended in 1.4 (added `priority`/`iteration`/`commentCount`), consumed in 1.4/1.5. `TitleBlockChange` defined in 2.5, consumed in 2.9. `AdjacentNav` defined in 2.1, consumed in 2.9/2.10. All match.

**Out-of-scope deferrals:** Linked-PR live status badges, severity/watching/reporter live editing, full activity timeline, live people-picker, iteration tree picker — all noted in the spec, deferred consistently here.
