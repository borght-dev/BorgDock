import { useQuickReviewStore } from '@/stores/quick-review-store';

/**
 * ReviewSessionProgress — what you reviewed since BorgDock started, at the
 * end of the Pull requests view tabs. Nothing until the first review.
 */
export function ReviewSessionProgress() {
  const approved = useQuickReviewStore(
    (s) => Object.values(s.activity).filter((entry) => entry.decision === 'approved').length,
  );
  const reviewed = useQuickReviewStore(
    (s) =>
      Object.values(s.activity).filter(
        (entry) => entry.decision !== 'skipped' && entry.decision !== 'walked',
      ).length,
  );
  const walked = useQuickReviewStore(
    (s) => Object.values(s.activity).filter((entry) => entry.decision === 'walked').length,
  );

  if (reviewed === 0 && walked === 0) return null;

  return (
    <div className="bd-review-progress" role="status" aria-label="Review progress this app session">
      <span className="bd-review-progress__approved">{approved} approved</span>
      <span>{reviewed} reviewed</span>
      {walked > 0 && <span>{walked} walked through</span>}
      <span className="bd-review-progress__scope">this session</span>
    </div>
  );
}
