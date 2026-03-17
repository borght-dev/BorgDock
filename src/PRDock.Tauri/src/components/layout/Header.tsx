import clsx from 'clsx';
import { useUiStore, type ActiveSection } from '@/stores/ui-store';

const sections: { key: ActiveSection; label: string }[] = [
  { key: 'prs', label: 'PRs' },
  { key: 'workitems', label: 'Work Items' },
];

export function Header() {
  const activeSection = useUiStore((s) => s.activeSection);
  const setActiveSection = useUiStore((s) => s.setActiveSection);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  return (
    <header className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-separator)]">
      {/* Logo */}
      <span
        className="text-sm font-bold bg-clip-text text-transparent select-none"
        style={{
          backgroundImage:
            'linear-gradient(135deg, var(--color-logo-gradient-start), var(--color-logo-gradient-end))',
        }}
      >
        PRDock
      </span>

      {/* Section switcher */}
      <div className="flex gap-0.5 rounded-md bg-[var(--color-surface-raised)] p-0.5">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={clsx(
              'rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors',
              activeSection === s.key
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Settings */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="rounded-md p-1.5 text-[var(--color-icon-btn-fg)] hover:bg-[var(--color-icon-btn-hover)] active:bg-[var(--color-icon-btn-pressed)] transition-colors"
        aria-label="Settings"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6.86 1.45a1.2 1.2 0 0 1 2.28 0l.23.7a1.2 1.2 0 0 0 1.52.72l.67-.27a1.2 1.2 0 0 1 1.61 1.14l-.02.72a1.2 1.2 0 0 0 1.02 1.22l.71.12a1.2 1.2 0 0 1 .57 2.17l-.57.44a1.2 1.2 0 0 0-.36 1.54l.35.63a1.2 1.2 0 0 1-.88 1.77l-.71.08a1.2 1.2 0 0 0-1.07 1.16l-.02.72a1.2 1.2 0 0 1-1.66 1.06l-.64-.3a1.2 1.2 0 0 0-1.55.34l-.43.57a1.2 1.2 0 0 1-1.94 0l-.43-.57a1.2 1.2 0 0 0-1.55-.34l-.64.3a1.2 1.2 0 0 1-1.66-1.06l-.02-.72a1.2 1.2 0 0 0-1.07-1.16l-.71-.08a1.2 1.2 0 0 1-.88-1.77l.35-.63a1.2 1.2 0 0 0-.36-1.54l-.57-.44A1.2 1.2 0 0 1 1.6 4.6l.71-.12a1.2 1.2 0 0 0 1.02-1.22l-.02-.72A1.2 1.2 0 0 1 4.92 1.4l.67.27a1.2 1.2 0 0 0 1.52-.72l.23-.7z" />
          <circle cx="8" cy="8" r="2.5" />
        </svg>
      </button>
    </header>
  );
}
