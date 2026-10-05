import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { makePr } from '@/components/focus/__tests__/helpers';
import { getAllComments, getReviews } from '@/services/github/reviews';
import { usePrConversation } from '../usePrConversation';

vi.mock('@/services/github/reviews', () => ({ getAllComments: vi.fn(), getReviews: vi.fn() }));
const client = vi.hoisted(() => ({}));
vi.mock('@/services/github/singleton', () => ({ getClientForRepo: () => client }));
const pr = makePr({ headSha: 'aaaaaaa' }).pullRequest;
const comment = {
  id: '1',
  author: 'developer',
  body: 'PROOF for the first head',
  createdAt: '2026-10-05T10:00:00Z',
  htmlUrl: `${pr.htmlUrl}#issuecomment-1`,
  severity: 'unknown' as const,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAllComments).mockResolvedValue([comment]);
  vi.mocked(getReviews).mockResolvedValue([]);
});
afterEach(cleanup);

it('hides old proof and reloads when the PR head changes', async () => {
  const { result, rerender } = renderHook(({ item }) => usePrConversation(item, true), {
    initialProps: { item: pr },
  });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  let resolve!: (comments: (typeof comment)[]) => void;
  vi.mocked(getAllComments).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  rerender({ item: { ...pr, headSha: 'bbbbbbb' } });
  expect(result.current.loading).toBe(true);
  expect(result.current.items).toEqual([]);
  await act(async () => {
    resolve([{ ...comment, body: 'PROOF for the new head' }]);
  });
  expect(result.current.loading).toBe(false);
  expect(result.current.items[0]?.body).toBe('PROOF for the new head');
  expect(getAllComments).toHaveBeenCalledTimes(2);
});

it('ignores a slower response from the previous PR', async () => {
  let resolve!: (comments: (typeof comment)[]) => void;
  vi.mocked(getAllComments).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result, rerender } = renderHook(({ item }) => usePrConversation(item, true), {
    initialProps: { item: pr },
  });
  vi.mocked(getAllComments).mockResolvedValueOnce([{ ...comment, body: 'PROOF for the next PR' }]);
  rerender({ item: { ...pr, number: pr.number + 1 } });
  await waitFor(() => expect(result.current.items[0]?.body).toBe('PROOF for the next PR'));
  await act(async () => {
    resolve([comment]);
  });
  expect(result.current.items[0]?.body).toBe('PROOF for the next PR');
});
