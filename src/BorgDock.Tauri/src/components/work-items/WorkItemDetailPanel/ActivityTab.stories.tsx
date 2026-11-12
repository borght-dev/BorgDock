// The work item's Activity tab (design/work-item-detail/mockups.html, frame B):
// AB#4127's history and discussion on one timeline. The ADO service mock
// answers the revisions from the scenario's `updates`.

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { AdoClient } from '@/services/ado/client';
import type { WorkItemComment } from '@/types';
import { getControl } from '../../../../.storybook/mocks/control';
import { activityComments, activityUpdates } from '../__fixtures__/activity-data';
import { ActivityTab } from './ActivityTab';

/** The mock never calls the client; the tab only needs one to exist. */
const getClient = () => ({}) as AdoClient;

interface HarnessProps {
  readOnly?: boolean;
  empty?: boolean;
}

function Harness({ readOnly = false, empty = false }: HarnessProps) {
  const [now] = useState(() => Date.now());
  const ctrl = getControl();
  ctrl.workItemScenario = {
    ...ctrl.workItemScenario,
    updates: empty ? [] : activityUpdates(now),
  };
  const [comments, setComments] = useState<WorkItemComment[]>(() =>
    empty ? [] : activityComments(now),
  );
  return (
    <div
      className="bd-detail"
      style={{ padding: '18px 28px 30px', minHeight: '100vh', overflow: 'auto' }}
    >
      <ActivityTab
        itemId={4127}
        comments={comments}
        isLoadingComments={false}
        getClient={getClient}
        readOnly={readOnly}
        now={now}
        onAddComment={async (text) => {
          const at = new Date().toISOString();
          setComments((prev) => [
            ...prev,
            {
              id: 9000 + prev.length,
              text,
              createdBy: { displayName: 'You' },
              createdDate: at,
              modifiedDate: at,
            },
          ]);
        }}
      />
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Work Items/Activity tab',
  component: Harness,
  parameters: { layout: 'fullscreen' },
  globals: { theme: 'dark' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

export const Timeline: Story = {};

export const TimelineLight: Story = { globals: { theme: 'light' } };

export const ReadOnly: Story = { args: { readOnly: true } };

export const Empty: Story = { args: { empty: true }, globals: { theme: 'light' } };
