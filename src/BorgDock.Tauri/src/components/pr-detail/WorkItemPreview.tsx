import { DetailDialog } from '@/components/shared/DetailDialog';
import { WorkItemDetailPanel } from '@/components/work-items/WorkItemDetailPanel';
import { useWorkItemDetailData } from '@/hooks/useWorkItemDetailData';
import type { WorkItem } from '@/types';

export function WorkItemPreview({
  id,
  item,
  onClose,
}: {
  id: number;
  item?: WorkItem;
  onClose: () => void;
}) {
  const data = useWorkItemDetailData(id, { initialItem: item, resolveImages: true });
  return (
    <DetailDialog title={`AB#${id}`} className="bd-work-item-preview" onClose={onClose}>
      {data.error && (
        <p className="qr-warning" role="alert">
          {data.error}
        </p>
      )}
      {!data.detailData ? (
        <p role="status">
          {data.isLoading
            ? 'Loading work item…'
            : 'Connect Azure DevOps in Settings to read this item.'}
        </p>
      ) : (
        <WorkItemDetailPanel
          readOnly
          item={data.detailData}
          isLoading={data.isLoading}
          statusText={data.statusText}
          availableStates={data.availableStates}
          richTextFields={data.richText}
          standardFields={data.standard}
          customFields={data.custom}
          extraTabs={data.extraTabs}
          detailsFieldKeys={data.detailsFieldKeys}
          attachments={data.attachments}
          comments={data.comments}
          isLoadingComments={data.isLoadingComments}
          onSave={() => undefined}
          onClose={onClose}
          onOpenInBrowser={data.openInBrowser}
          onDownloadAttachment={data.downloadAttachment}
        />
      )}
    </DetailDialog>
  );
}
