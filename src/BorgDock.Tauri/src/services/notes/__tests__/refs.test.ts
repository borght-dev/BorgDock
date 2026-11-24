import { describe, expect, it } from 'vitest';
import { refKey } from '../refs';

describe('refKey', () => {
  it('keeps the same pull request number in two repositories apart', () => {
    const a = refKey({ kind: 'github-pr', owner: 'acme', repo: 'shop', number: 12 });
    const b = refKey({ kind: 'github-pr', owner: 'acme', repo: 'warehouse', number: 12 });
    expect(a).not.toBe(b);
  });

  it('ignores the case GitHub ignores', () => {
    const a = refKey({ kind: 'github-pr', owner: 'Acme', repo: 'Shop', number: 12 });
    expect(a).toBe('gh:github.com/acme/shop#12');
  });

  it('keeps one item id in two organizations apart', () => {
    const a = refKey({ kind: 'ado-item', organization: 'acme', project: 'Shop', id: 5 });
    const b = refKey({ kind: 'ado-item', organization: 'globex', project: 'Shop', id: 5 });
    expect(a).not.toBe(b);
  });

  it('is the same item whichever project it was linked from', () => {
    const a = refKey({ kind: 'ado-item', organization: 'acme', project: 'Shop', id: 5 });
    const b = refKey({ kind: 'ado-item', organization: 'ACME', project: 'Other', id: 5 });
    expect(a).toBe(b);
  });

  it('keeps one raw thread id on two T3 installs apart', () => {
    const laptop = refKey({ kind: 't3-thread', environmentId: 'env-laptop', threadId: 't1' });
    const mini = refKey({ kind: 't3-thread', environmentId: 'env-mini', threadId: 't1' });
    expect(laptop).toBe('t3:env-laptop/t1');
    expect(mini).not.toBe(laptop);
  });
});
