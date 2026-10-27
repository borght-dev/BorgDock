import { useCiSheetStore } from '@/stores/ci-investigate-store';
import { InvestigateSheet } from './InvestigateSheet';
import { RerunAffectedSheet } from './RerunAffectedSheet';
import { TrackIssueSheet } from './TrackIssueSheet';

/** The related-failure sheet a group action opened, in the main window. */
export function CiSheetHost() {
  const sheet = useCiSheetStore((s) => s.sheet);
  const close = useCiSheetStore((s) => s.close);
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'investigate':
      return <InvestigateSheet key={sheet.groupId} groupId={sheet.groupId} onClose={close} />;
    case 'rerun':
      return <RerunAffectedSheet key={sheet.groupId} groupId={sheet.groupId} onClose={close} />;
    default:
      return <TrackIssueSheet key={sheet.groupId} groupId={sheet.groupId} onClose={close} />;
  }
}
