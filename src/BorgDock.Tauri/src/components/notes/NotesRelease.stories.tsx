import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { userEvent, waitFor, within } from 'storybook/test';
import { seedNotes } from './__fixtures__/notes-data';
import { NoteCaptureApp } from './NoteCaptureApp';

const diagram = new URL('./__fixtures__/note-flow.svg?no-inline', import.meta.url).href;

function Capture() {
  useState(() => seedNotes({}));
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <NoteCaptureApp />
    </div>
  );
}

const meta: Meta<typeof Capture> = {
  title: 'Notes/Release',
  component: Capture,
  parameters: { layout: 'fullscreen' },
};
export default meta;

export const LiveMarkdown: StoryObj<typeof Capture> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = await canvas.findByRole('textbox', { name: 'Quick note' });
    await userEvent.click(editor);
    await userEvent.paste(
      [
        '# Quick notes, ready as you type',
        '',
        '**Write it down.** Your note saves automatically.',
        '',
        '| Feature | Status |',
        '| :--- | :---: |',
        '| Markdown previews | Ready |',
        '| Tables and images | Ready |',
        '',
        '~~~typescript',
        'const greeting: string = "Hello";',
        'console.log(greeting);',
        '~~~',
        '',
        `![Capture, format and save](${diagram})`,
        '',
        'Keep writing, or choose New note for another capture.',
        '',
      ]
        .join('\n')
        .replaceAll('~~~', String.fromCharCode(96).repeat(3)),
    );
    await userEvent.keyboard('{Control>}{End}{/Control}');
    await waitFor(() => {
      if (!canvas.getByRole('status').textContent?.includes('Saved.'))
        throw new Error('Waiting for autosave');
    });
  },
};
