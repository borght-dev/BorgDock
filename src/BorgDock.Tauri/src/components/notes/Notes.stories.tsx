import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { userEvent, waitFor, within } from 'storybook/test';
import { LAUNCH_CATALOGUE } from '@/components/dispatch/__fixtures__/dispatch-data';
import { MainWindow } from '@/components/layout/MainWindow';
import { ViewStack } from '@/components/layout/ViewStack';
import { rememberCaptureContext } from '@/services/notes/capture';
import { type ActiveSection, useUiStore } from '@/stores/ui-store';
import { getControl } from '../../../.storybook/mocks/control';
import { type NotesScene, seedNotes } from './__fixtures__/notes-data';
import { NoteCaptureApp } from './NoteCaptureApp';
import { NoteThreadSheet } from './NoteThreadSheet';

interface HarnessProps extends NotesScene {
  /** Show another section, with the notes loaded behind it. */
  section?: ActiveSection;
  /** Open PR 3712's detail on its Notes tab. */
  prNotes?: boolean;
  /** Open the start-a-thread sheet over the note. */
  threadSheet?: boolean;
}

function Harness({ section = 'notes', prNotes, threadSheet, ...scene }: HarnessProps) {
  useState(() => {
    getControl().invokeResponses.t3_catalogue = LAUNCH_CATALOGUE;
    seedNotes(scene);
    useUiStore.setState({
      activeSection: prNotes ? 'prs' : section,
      viewStack: prNotes
        ? [
            { kind: 'list' },
            { kind: 'pr-detail', owner: 'acme', repo: 'shop', number: 3712, initialTab: 'notes' },
          ]
        : [{ kind: 'list' }],
    });
    return null;
  });
  return (
    <>
      <MainWindow>
        <ViewStack />
      </MainWindow>
      {threadSheet && (
        <NoteThreadSheet
          path="Projects/CSV export drops the last column.md"
          text="Ask QA to export a report with an empty last column, then check the Excel path."
          onClose={() => {}}
        />
      )}
    </>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Notes/Notes',
  component: Harness,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

/** A note in live preview: chips with the live state of the PR, item and thread it names. */
export const Section: Story = { args: {} };

/** The same in the light theme. */
export const SectionLight: Story = { args: {}, globals: { theme: 'light' } };

/** Today's note: yesterday's activity written in, and what was captured with Ctrl+F8. */
export const DailyNote: Story = { args: { open: 'today' } };

/** Every open task across the vault, ticked from one list. */
export const Tasks: Story = { args: { view: 'tasks' } };

/** A decision recorded from a workstream. */
export const DecisionNote: Story = { args: { open: 'decision' } };

/** The file changed in Obsidian while this note held an unsaved edit: nothing was overwritten. */
export const Conflict: Story = { args: { conflict: true } };

/** A new vault. */
export const Empty: Story = { args: { empty: true } };

/** Ctrl+O: open a note by title. */
export const QuickSwitcher: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const open = await waitFor(() => canvas.getByRole('button', { name: /Open or search/ }), {
      timeout: 15_000,
    });
    await userEvent.click(open);
    await userEvent.keyboard('exp');
  },
};

/** A pull request's Notes tab: every note that mentions it. */
export const PullRequestNotes: Story = { args: { prNotes: true } };

/** Focus: today's note and the open tasks. */
export const FocusCard: Story = { args: { section: 'focus', open: null } };

/** Start a T3 thread from a note. */
export const StartThread: Story = { args: { threadSheet: true } };

function CaptureHarness() {
  useState(() => {
    seedNotes({});
    rememberCaptureContext({
      kind: 'pr',
      owner: 'acme',
      repo: 'shop',
      number: 3712,
      title: 'fix: CSV export keeps the last column',
    });
    return null;
  });
  return (
    <div style={{ width: 560, height: 230 }}>
      <NoteCaptureApp />
    </div>
  );
}

/** The quick note window (Ctrl+F8 from anywhere), linked to the PR you had open. */
export const QuickNote: StoryObj = {
  render: () => <CaptureHarness />,
  play: async () => {
    await userEvent.keyboard('Empty trailing cells also break the PDF renderer?');
  },
};
