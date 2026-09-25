// src/components/shared/WindowChrome.stories.tsx
//
// The chrome every tool window shares with the main window: WindowTitleBar
// and WindowStatusBar, porcelain and graphite side by side (BothThemes pins
// the toolbar theme to light so the left panel really is light).

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { BothThemes } from '@/test-support/story-themes';
import { WindowStatusBar } from './chrome/WindowStatusBar';
import { Button, Kbd } from './primitives';
import { WindowTitleBar } from './WindowTitleBar';

const meta: Meta = {
  title: 'Shared/WindowChrome',
  globals: { theme: 'light' },
};
export default meta;
type Story = StoryObj;

function ToolWindow({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div
      className="flex h-[220px] flex-col overflow-hidden rounded-[10px] border border-[var(--color-subtle-border)] bg-[var(--color-background)]"
      style={{ boxShadow: 'var(--elevation-2)' }}
    >
      <WindowTitleBar title={title} meta={<Kbd>Ctrl+F10</Kbd>} />
      <div className="flex-1 p-4 text-[13px] text-[var(--color-text-secondary)]">{children}</div>
      <WindowStatusBar
        left={<span>1,204 rows · 38 ms · 6 cols</span>}
        hints={[
          { keys: 'Ctrl+S', label: 'save' },
          { keys: 'Ctrl+↵', label: 'run' },
        ]}
      />
    </div>
  );
}

export const TitleAndStatusBars: Story = {
  render: () => (
    <BothThemes>
      {() => (
        <div className="flex flex-col gap-6">
          <ToolWindow title="BorgDock SQL">The window body sits between the two bars.</ToolWindow>
          <div
            className="overflow-hidden rounded-[10px] border border-[var(--color-subtle-border)]"
            style={{ boxShadow: 'var(--elevation-1)' }}
          >
            <WindowTitleBar
              title={<span className="bd-fv-path">src/components/sql/SqlApp.tsx</span>}
              actions={
                <Button variant="secondary" size="sm">
                  Copy all
                </Button>
              }
            />
          </div>
        </div>
      )}
    </BothThemes>
  ),
};
