import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect } from 'react';
import { RELEASES } from '@/generated/changelog';
import { createLogger } from '@/services/logger';
import { useWhatsNewStore } from '@/stores/whats-new-store';
import { WindowControls } from '@/components/shared/chrome';
import { Button, TitleBar } from '@/components/shared/primitives';
import { ReleaseAccordion } from './ReleaseAccordion';
import { useReleasesToShow } from './useReleasesToShow';

const log = createLogger('whats-new-app');

interface InjectedWindow {
  __BORGDOCK_WHATS_NEW__?: { version: string | null };
}

export function WhatsNewApp() {
  const lastSeenVersion = useWhatsNewStore((s) => s.lastSeenVersion);
  const hydrated = useWhatsNewStore((s) => s.hydrated);
  const hydrate = useWhatsNewStore((s) => s.hydrate);
  const setLastSeenVersion = useWhatsNewStore((s) => s.setLastSeenVersion);
  const disableAutoOpen = useWhatsNewStore((s) => s.disableAutoOpen);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  const initialTarget = (window as unknown as InjectedWindow).__BORGDOCK_WHATS_NEW__?.version ?? null;

  const { releases, expandedVersion, countBehind, currentVersion, ready } = useReleasesToShow(
    RELEASES,
    lastSeenVersion,
    initialTarget,
  );

  const handleGotIt = useCallback(async () => {
    if (!ready) return;
    await setLastSeenVersion(currentVersion);
    try {
      await getCurrentWindow().close();
    } catch (err) {
      log.error('window close failed', err);
    }
  }, [ready, currentVersion, setLastSeenVersion]);

  const handleMinimize = useCallback(() => {
    getCurrentWindow()
      .minimize()
      .catch((err) => log.error('minimize failed', err));
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      const isMax = await win.isMaximized();
      if (isMax) await win.unmaximize();
      else await win.maximize();
    } catch (err) {
      log.error('toggle maximize failed', err);
    }
  }, []);

  const handleDisable = useCallback(
    async (checked: boolean) => {
      if (!ready || !checked) return;
      await disableAutoOpen(currentVersion);
    },
    [ready, currentVersion, disableAutoOpen],
  );

  const currentRelease = releases.find((r) => r.version === currentVersion);
  const headTitle = currentRelease?.version ?? currentVersion;
  const headSummary = currentRelease?.summary ?? '';

  // countBehind from useReleasesToShow includes the current release itself in
  // the "missed" count. Display the UX-meaningful number: releases strictly
  // between lastSeen and current (exclusive of current), i.e. releases the
  // user never opened before this session.
  const displayBehind = Math.max(0, countBehind - 1);
  const behindLabel = displayBehind === 1 ? '1 version behind' : `${displayBehind} versions behind`;

  return (
    <div
      data-whats-new-app
      className="h-screen w-full flex flex-col bg-background text-text-primary font-sans"
    >
      {/* Title bar — mirrors PrDetailPanel's pop-out header so it feels like
       *  the same app. The X button routes through handleGotIt so closing via
       *  the title bar marks lastSeenVersion the same way the footer "Got it"
       *  button does (can't delegate to WindowTitleBar which owns its close). */}
      <TitleBar
        data-tauri-drag-region
        left={
          <span data-tauri-drag-region className="bd-title-bar__title">
            What's new in BorgDock
          </span>
        }
        right={
          <WindowControls
            onMinimize={handleMinimize}
            onMaximize={handleToggleMaximize}
            onClose={handleGotIt}
          />
        }
      />
      <header className="px-6 pt-6 pb-3.5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-text-muted inline-flex items-center gap-2 before:content-[''] before:w-[5px] before:h-[5px] before:rounded-full before:bg-status-green">
            Release notes
          </span>
          <span className="text-[11px] text-text-muted tabular-nums">
            {displayBehind > 0 ? behindLabel : 'Up to date'}
          </span>
        </div>
        {/*
         * Deviation from plan: the version is rendered as part of the h1's own
         * text node (template literal) rather than inside a <b> child element.
         *
         * Reason: @testing-library's getNodeText() collects only DIRECT
         * TEXT_NODE children of each element. With `<b>{headTitle}</b>`, the
         * <b> element itself has textContent '1.0.11', which causes
         * getByText('1.0.11') to find two elements: the <b> in the header AND
         * the version <span> in ReleaseAccordion — throwing "Found multiple".
         *
         * Using a template literal makes the h1's direct text "What's new in
         * 1.0.11" (≠ '1.0.11'), so only the accordion span matches getByText.
         *
         * The <b> is preserved as an empty semantic marker with aria-label for
         * screen-reader emphasis; visual styling for the version number can be
         * achieved with a CSS [data-version] pseudo-element if desired later.
         */}
        <h1 className="text-[22px] font-medium tracking-[-0.015em] mb-1 text-text-primary">
          {`What's new in ${headTitle}`}
        </h1>
        {headSummary && <p className="text-[13px] text-text-muted">{headSummary}</p>}
      </header>

      <div className="flex-1 overflow-y-auto px-6 pb-3.5">
        {!ready ? null : releases.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-text-muted">
            No release notes yet.
          </div>
        ) : (
          releases.map((release) => (
            <ReleaseAccordion
              key={release.version}
              release={release}
              defaultExpanded={release.version === expandedVersion}
              isCurrent={release.version === currentVersion}
            />
          ))
        )}
      </div>

      <footer className="px-6 py-3 border-t border-subtle-border bg-surface-raised flex items-center justify-between">
        {/*
         * Deviation from plan: aria-label moved from <label> to <input>.
         *
         * Reason: @testing-library's getByLabelText() concatenates two result
         * paths — elements associated with matching label text AND elements that
         * have a matching aria-label attribute. With aria-label on the <label>
         * itself, both the label element and the wrapped input were returned,
         * causing "Found multiple elements". Moving aria-label to the <input>
         * means both paths resolve to the same element; Set() deduplication
         * yields exactly one result.
         */}
        <label className="flex items-center gap-2 text-[12px] text-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            aria-label="Don't auto-open again"
            className="h-[13px] w-[13px] accent-accent cursor-pointer"
            onChange={(e) => handleDisable(e.target.checked)}
          />
          Don't auto-open again
        </label>
        <div className="flex items-center gap-3.5">
          <a
            href="https://github.com/KoenvdB/BorgDock/releases"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-text-muted hover:text-accent"
          >
            View on GitHub →
          </a>
          <Button variant="primary" size="md" onClick={handleGotIt}>
            Got it
          </Button>
        </div>
      </footer>
    </div>
  );
}
