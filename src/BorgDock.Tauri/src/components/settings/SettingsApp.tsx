import { WindowTitleBar } from '@/components/shared/WindowTitleBar';

export function SettingsApp() {
  return (
    <div className="flex h-screen flex-col bg-[var(--color-background)] text-[var(--color-text-primary)]">
      <WindowTitleBar title="BorgDock — Settings" />
      <main className="flex-1 grid place-items-center text-sm text-[var(--color-text-tertiary)]">
        Settings (placeholder)
      </main>
    </div>
  );
}
