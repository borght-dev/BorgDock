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

  it('skips relations with malformed URLs', () => {
    const relations: WorkItemRelation[] = [
      {
        rel: 'ArtifactLink',
        url: 'vstfs:///Git/PullRequestId/%ZZ/repo/42',
        attributes: {},
      },
      {
        rel: 'ArtifactLink',
        url: 'vstfs:///Git/PullRequestId/abc/myrepo/777',
        attributes: { comment: 'OK' },
      },
    ];
    expect(parseLinkedPRs(relations)).toEqual([{ id: 777, comment: 'OK' }]);
  });
});
