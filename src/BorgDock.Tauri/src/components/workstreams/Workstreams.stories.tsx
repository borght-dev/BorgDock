import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { MainWindow } from '@/components/layout/MainWindow';
import { ViewStack } from '@/components/layout/ViewStack';
import type { WorkstreamStatus } from '@/services/workstreams/types';
import { useDispatchStore } from '@/stores/dispatch-store';
import { type ActiveSection, useUiStore, type WorkstreamTab } from '@/stores/ui-store';
import { useWorkstreamsStore } from '@/stores/workstreams-store';
import { useWorkstreamsUiStore } from '@/stores/workstreams-ui-store';
import { seedWorkstreams, type WorkstreamScene } from './__fixtures__/workstreams-data';
import { WorkstreamSheets } from './WorkstreamSheets';

interface HarnessProps extends WorkstreamScene {
  /** Open this workstream (by its place in the scene) in the detail view. */
  open?: number;
  tab?: WorkstreamTab;
  filter?: WorkstreamStatus;
  /** Open a sheet over the window. */
  sheet?: 'new' | 'picker' | 'add';
  /** Show another section, with the workstreams loaded behind it. */
  section?: ActiveSection;
}

function Harness({
  open,
  tab,
  filter = 'active',
  sheet,
  section = 'workstreams',
  ...scene
}: HarnessProps) {
  useState(() => {
    const { ids } = seedWorkstreams(scene);
    const id = open !== undefined ? ids[open] : undefined;
    useWorkstreamsStore.setState({ filter });
    if (section === 'dispatch')
      useDispatchStore.setState({ viewMode: 'walk', selectedItemId: 59877 });
    useUiStore.setState({
      activeSection: section,
      viewStack: id
        ? [{ kind: 'list' }, { kind: 'workstream', id, ...(tab ? { tab } : {}) }]
        : [{ kind: 'list' }],
    });
    useWorkstreamsUiStore.setState({
      selectedId: ids[0] ?? null,
      creating: sheet === 'new' ? { refs: [] } : null,
      picking: sheet === 'picker' && id ? { workstreamId: id } : null,
      adding:
        sheet === 'add'
          ? {
              refs: [
                {
                  ref: { kind: 'github-pr', owner: 'acme', repo: 'shop', number: 3712 },
                  label: 'fix: CSV export keeps the last column (AB#60102)',
                },
              ],
            }
          : null,
    });
    return null;
  });
  return (
    <>
      <MainWindow>
        <ViewStack />
      </MainWindow>
      <WorkstreamSheets />
    </>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Workstreams/Workstreams',
  component: Harness,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** The section: pinned first, then what needs you, each card with its next action. */
export const List: Story = { args: {} };

/** No workstreams yet. */
export const Empty: Story = { args: { empty: true } };

/** Archived workstreams. */
export const Archived: Story = { args: { filter: 'archived' } };

/** A workstream with an open decision, a blocked outcome and a plan waiting for approval. */
export const Overview: Story = { args: { open: 0 } };

/** Every record by role, with its state and how current that is. */
export const Members: Story = { args: { open: 0, tab: 'members' } };

/** What blocks what. */
export const RelationMap: Story = { args: { open: 0, tab: 'map' } };

/** The log. */
export const Activity: Story = { args: { open: 0, tab: 'activity' } };

/** Every required outcome verified: ready to complete. */
export const Ready: Story = { args: { open: 1 } };

/** A host offline, a repository out of reach and a deleted item. */
export const Offline: Story = { args: { offline: true, open: 4, tab: 'members' } };

/** Changed on another machine as well: choose what to keep. */
export const Conflict: Story = { args: { conflict: true, open: 0 } };

/** Made by a newer BorgDock. */
export const ReadOnly: Story = { args: { readOnly: true, open: 0 } };

/** Adding records: paste an address or search. */
export const AddRecords: Story = { args: { open: 0, tab: 'members', sheet: 'picker' } };

/** A new workstream. */
export const NewWorkstream: Story = { args: { sheet: 'new' } };

/** Focus names the workstreams that need you. */
export const FocusCard: Story = { args: { section: 'focus' } };

/** Dispatch rows say which workstream an item is in; its detail adds it to one. */
export const DispatchChips: Story = { args: { section: 'dispatch' } };

/** "Add to workstream" from a pull request. */
export const AddToWorkstream: Story = { args: { section: 'prs', sheet: 'add' } };
