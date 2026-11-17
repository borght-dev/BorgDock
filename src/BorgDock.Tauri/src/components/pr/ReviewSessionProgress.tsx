import { useQuickReviewStore } from '@/stores/quick-review-store';

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

  return (
    <div className="bd-review-progress" role="status" aria-label="Review progress this app session">
      <span>This app session</span>
      <span className="bd-review-progress__approved">{approved} approved</span>
      <span>{reviewed} reviewed</span>
      {walked > 0 && <span>{walked} walked through</span>}
    </div>
  );
}
