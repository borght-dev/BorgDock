// src/components/pr-detail/PRDetailPanel.stories.tsx

import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import {
  closedPr,
  mergedPr,
  openPr,
  PanelFrame,
  withPrDetail,
} from './__fixtures__/pr-detail-data';
import { PrDetailPanel } from './PRDetailPanel';

const meta: Meta<typeof PrDetailPanel> = {
  title: 'PR Detail/PRDetailPanel',
  component: PrDetailPanel,
  decorators: [
    (Story, context) => (
      <PanelFrame width={context.parameters.panelWidth} height={context.parameters.panelHeight}>
        <Story />
      </PanelFrame>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PrDetailPanel>;

export const Default: Story = {
  decorators: [withPrDetail(openPr)],
  args: { pr: openPr, popOutWindow: true },
};

export const EmbeddedInSidebar: Story = {
  decorators: [withPrDetail(openPr)],
  args: { pr: openPr, popOutWindow: false },
};

export const Merged: Story = {
  decorators: [withPrDetail(mergedPr)],
  args: { pr: mergedPr, popOutWindow: true },
};

export const Closed: Story = {
  decorators: [withPrDetail(closedPr)],
  args: { pr: closedPr, popOutWindow: true },
};

const groupedPr = {
  ...openPr,
  pullRequest: {
    ...openPr.pullRequest,
    title: 'Add Save & Approve for orders',
    changedFiles: 6,
    additions: 18,
    deletions: 6,
  },
};

export const GroupedFiles: Story = {
  parameters: { panelWidth: 1280, panelHeight: 860 },
  decorators: [
    withPrDetail(groupedPr, {
      githubResponses: {
        getPRFiles: [
          [
            'src/orders/OrderActions.tsx',
            '@@ -1,3 +1,4 @@\n return (\n-  <Button onClick={save}>Save</Button>\n+  <Button onClick={() => save(false)}>Save</Button>\n+  <Button onClick={() => save(true)}>Save & Approve</Button>\n );',
          ],
          [
            'src/orders/SaveOrderHandler.cs',
            '@@ -38,3 +38,5 @@\n var order = await orders.Get(request.OrderId);\n+if (request.ApproveAfterSave)\n+    await permissions.RequireApproval(order);\n await orders.Save(order);\n return Result.Success();',
          ],
          [
            'src/orders/SaveOrderRequest.cs',
            '@@ -1,3 +1,4 @@\n public sealed record SaveOrderRequest\n {\n+    public bool ApproveAfterSave { get; init; }\n }',
          ],
          [
            'docs/orders.md',
            '@@ -1 +1 @@\n-Choose Save.\n+Choose Save & Approve to save and approve in one step.',
          ],
          [
            'Orders.Tests/SaveOrderHandlerTests.cs',
            '@@ -1 +1 @@\n-oldTest();\n+assertApprovalPermission();',
          ],
          [
            'src/orders/OrderActions.test.tsx',
            '@@ -1 +1 @@\n-oldTest();\n+expect(save).toHaveBeenCalledWith(true);',
          ],
        ].map(([filename, patch]) => ({
          filename: filename!,
          patch,
          sha: filename!,
          status: 'modified',
          additions: 3,
          deletions: 1,
        })),
      },
    }),
  ],
  args: { pr: groupedPr, popOutWindow: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('tab', { name: /^Files/ }));
  },
};
