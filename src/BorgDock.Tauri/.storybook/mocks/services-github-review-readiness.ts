import type { ReviewReadiness } from '../../src/services/github/review-readiness';
import { getControl } from './control';

export async function getReviewReadiness(): Promise<ReviewReadiness> {
  return (
    getControl().githubResponses.getReviewReadiness ?? {
      checks: [],
      complete: false,
      warnings: ['Branch rules unavailable'],
    }
  );
}
