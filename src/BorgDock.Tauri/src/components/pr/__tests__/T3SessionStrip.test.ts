import { describe, expect, it } from 'vitest';
import type { PullRequest } from '@/types';
import { belongsToPr } from '../T3SessionStrip';

const pr = {
  number: 42,
  headRef: 'feat/thing',
  htmlUrl: 'https://github.com/acme/shop/pull/42',
} as PullRequest;

describe('belongsToPr', () => {
  it('matches a thread on the pull request branch, whatever the case', () => {
    expect(belongsToPr({ branch: 'Feat/Thing', pullRequestUrls: [] }, pr)).toBe(true);
  });

  it('matches a thread linked to the pull request', () => {
    const session = { branch: 'other', pullRequestUrls: ['https://github.com/Acme/Shop/pull/42'] };
    expect(belongsToPr(session, pr)).toBe(true);
  });

  it('does not match a thread on another branch and another pull request', () => {
    const session = { branch: 'other', pullRequestUrls: ['https://github.com/acme/shop/pull/7'] };
    expect(belongsToPr(session, pr)).toBe(false);
  });
});
