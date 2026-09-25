import { invoke } from '@tauri-apps/api/core';
import { FileText } from 'lucide-react';
import { Button, Card } from '@/components/shared/primitives';

/** The Work items section before Azure DevOps is set up: a pointer to Settings. */
export function AdoNotConfigured() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <Card padding="lg" className="text-center">
        <FileText
          className="mx-auto mb-3 h-10 w-10 text-[var(--color-text-ghost)]"
          strokeWidth={1.5}
        />
        <p className="mb-3 text-[13px] text-[var(--color-text-muted)]">
          Configure Azure DevOps in Settings to see work items
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() =>
            void invoke('open_settings_window', { section: 'ado' }).catch(console.error)
          }
        >
          Open Settings
        </Button>
      </Card>
    </div>
  );
}
