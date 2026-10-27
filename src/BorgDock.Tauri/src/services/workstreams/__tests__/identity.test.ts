import { describe, expect, it } from 'vitest';
import { normalizeUrl, parseReference, refKey, shortIdentity, sourceUrl } from '../identity';
import type { SourceRef } from '../types';

const context = {
  adoOrganization: 'acme',
  adoProject: 'Shop',
  environments: [
    { environmentId: 'env-laptop', hostId: 'local' },
    { environmentId: 'env-mini', hostId: 'mini' },
  ],
};

function refOf(text: string): SourceRef {
  const parsed = parseReference(text, context);
  if (!parsed || !('ref' in parsed)) throw new Error(`no reference in ${text}`);
  return parsed.ref;
}

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

  it('keeps one raw thread id on two T3 installs apart, whatever host id they carry', () => {
    const laptop = refKey({
      kind: 't3-thread',
      environmentId: 'env-laptop',
      threadId: 't1',
      hostId: 'local',
    });
    const mini = refKey({
      kind: 't3-thread',
      environmentId: 'env-mini',
      threadId: 't1',
      hostId: 'local',
    });
    const readded = refKey({
      kind: 't3-thread',
      environmentId: 'env-mini',
      threadId: 't1',
      hostId: 'mini-2',
    });
    expect(laptop).not.toBe(mini);
    expect(mini).toBe(readded);
  });

  it('treats two spellings of a page as one link', () => {
    expect(normalizeUrl('HTTPS://Docs.Example.com/spec/')).toBe(
      normalizeUrl('https://docs.example.com/spec'),
    );
  });
});

describe('parseReference', () => {
  it.each([
    ['https://github.com/acme/shop/pull/12', 'gh:github.com/acme/shop#12'],
    ['https://github.com/acme/shop/pull/12/files?diff=split', 'gh:github.com/acme/shop#12'],
    ['acme/shop#12', 'gh:github.com/acme/shop#12'],
    ['https://dev.azure.com/acme/Shop/_workitems/edit/59463', 'ado:acme#59463'],
    ['https://dev.azure.com/acme/My%20Shop/_workitems/edit/7/', 'ado:acme#7'],
    ['https://dev.azure.com/acme/Shop/_boards/board/t/Team/Stories?workitem=88', 'ado:acme#88'],
    ['https://acme.visualstudio.com/Shop/_workitems/edit/9', 'ado:acme#9'],
    ['AB#123', 'ado:acme#123'],
    ['#123', 'ado:acme#123'],
    ['t3code://threads/env-mini/thread-9', 't3:env-mini/thread-9'],
    ['https://docs.example.com/design', 'url:https://docs.example.com/design'],
  ])('reads %s', (text, key) => {
    expect(refKey(refOf(text))).toBe(key);
  });

  it('finds the host of a T3 link by its environment, not by a label', () => {
    expect(refOf('t3code://threads/env-mini/thread-9')).toMatchObject({ hostId: 'mini' });
    expect(refOf('t3code://threads/env-gone/thread-9')).toMatchObject({ hostId: '' });
  });

  it('decodes the project of an ADO address', () => {
    expect(refOf('https://dev.azure.com/acme/My%20Shop/_workitems/edit/7')).toMatchObject({
      project: 'My Shop',
    });
  });

  it('asks for Azure DevOps before it links AB#123', () => {
    const parsed = parseReference('AB#123', {
      ...context,
      adoOrganization: null,
      adoProject: null,
    });
    expect(parsed).toEqual({ error: expect.stringContaining('Azure DevOps') });
  });

  it('leaves plain words to the search', () => {
    expect(parseReference('queue rewrite', context)).toBeNull();
    expect(parseReference('   ', context)).toBeNull();
  });
});

describe('display', () => {
  it('names each kind in one line and points at the original', () => {
    const pr = refOf('acme/shop#12');
    const item = refOf('AB#123');
    const thread = refOf('t3code://threads/env-mini/thread-9');
    expect(shortIdentity(pr)).toBe('acme/shop#12');
    expect(shortIdentity(item)).toBe('AB#123');
    expect(sourceUrl(pr)).toBe('https://github.com/acme/shop/pull/12');
    expect(sourceUrl(item)).toBe('https://dev.azure.com/acme/Shop/_workitems/edit/123');
    expect(sourceUrl(thread)).toBe('t3code://threads/env-mini/thread-9');
  });
});
