import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef } from 'react';
import { WorkItemPaletteRow } from '@/components/work-item-palette/WorkItemPaletteRow';
import { Kbd } from '@/components/shared/primitives';
import {
  saveCurrentPosition,
  useWorkItemPaletteSearch,
} from '@/hooks/useWorkItemPaletteSearch';

export function WorkItemPaletteApp() {
  const {
    searchText,
    setSearchText,
    selectedIndex,
    setSelectedIndex,
    statusText,
    isSearching,
    isSearchMode,
    isLoadingBrowse,
    browseSections,
    navItems,
    selectAndClose,
  } = useWorkItemPaletteSearch();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on mount. One paint after mount the input is in the DOM,
  // so a single .focus() is enough. `invoke('palette_ready')` re-asserts
  // OS-level focus on the main thread (Windows' foreground-lock rules
  // sometimes leave a newly-created WebView2 window focus-less).
  //
  // A previous implementation polled setFocus every 50ms × 30 attempts,
  // which combined with a Rust-side std::thread::spawn + sleep(200ms) +
  // set_focus flooded WebView2's PostMessage queue and crashed the process
  // ("PostMessage failed ; is the messages queue full?" / invalid HWND).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      invoke('palette_ready').catch(() => {});
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Global keydown for Escape
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        getCurrentWindow().close().catch(console.debug); /* fire-and-forget */
      }
    }
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const allRows = listRef.current.querySelectorAll('[data-palette-row]');
    allRows[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (navItems.length > 0) {
            setSelectedIndex((i: number) => (i <= 0 ? navItems.length - 1 : i - 1));
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (navItems.length > 0) {
            setSelectedIndex((i: number) => (i >= navItems.length - 1 ? 0 : i + 1));
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < navItems.length) {
            const item = navItems[selectedIndex];
            if (item) selectAndClose(item.id);
          }
          break;
      }
    },
    [navItems, selectedIndex, selectAndClose, setSelectedIndex],
  );

  // Save position whenever the window is moved
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await getCurrentWindow().onMoved(() => {
        saveCurrentPosition();
      });
    })();
    return () => unlisten?.();
  }, []);

  function startDrag(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    getCurrentWindow().startDragging();
  }

  // Track flat index offset for sectioned rendering
  let globalOffset = 0;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[var(--color-card-background)]">
      <div className="flex h-full w-full flex-col">
        {/* Drag handle */}
        <div
          className="flex h-7 cursor-grab items-center justify-center active:cursor-grabbing bg-[var(--color-surface-raised)]"
          data-tauri-drag-region
          onMouseDown={startDrag}
        >
          {/* drag handle: bespoke 3-dot grip, no primitive maps */}
          <div className="flex gap-1">
            <div className="h-1 w-1 rounded-full bg-[var(--color-text-ghost)]" />
            <div className="h-1 w-1 rounded-full bg-[var(--color-text-ghost)]" />
            <div className="h-1 w-1 rounded-full bg-[var(--color-text-ghost)]" />
          </div>
        </div>

        {/* Search input */}
        <div className="px-3 pt-1 pb-2">
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search by ID, title, or assigned to..."
            className="bd-input w-full rounded-lg border px-3 py-2.5 text-base outline-none bg-[var(--color-input-bg)] border-[var(--color-input-border)] text-[var(--color-text-primary)] caret-[var(--color-accent)]"
          />
        </div>

        {/* Content area */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {isSearchMode ? (
            /* Search results */
            navItems.map((item, index) => (
              <WorkItemPaletteRow
                key={item.id}
                item={item}
                isSelected={index === selectedIndex}
                onMouseEnter={() => setSelectedIndex(index)}
                onSelect={selectAndClose}
              />
            ))
          ) : (
            /* Browse sections */
            <>
              {browseSections.length === 0 && !isLoadingBrowse && (
                <div className="px-4 py-6 text-center text-[13px] text-[var(--color-text-muted)]">
                  Type to search work items
                </div>
              )}
              {isLoadingBrowse && browseSections.length === 0 && (
                <div className="flex items-center justify-center py-6">
                  <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent text-[var(--color-text-muted)]" />
                  <span className="text-[13px] text-[var(--color-text-muted)]">Loading...</span>
                </div>
              )}
              {browseSections.map((section) => {
                const sectionStart = globalOffset;
                const rendered = (
                  <div key={section.label}>
                    <div className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                      {section.label}
                    </div>
                    {section.items.map((item, localIndex) => {
                      const flatIndex = sectionStart + localIndex;
                      return (
                        <WorkItemPaletteRow
                          key={item.id}
                          item={item}
                          isSelected={flatIndex === selectedIndex}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                          onSelect={selectAndClose}
                        />
                      );
                    })}
                  </div>
                );
                globalOffset += section.items.length;
                return rendered;
              })}
            </>
          )}
        </div>

        {/* Separator */}
        {(navItems.length > 0 || browseSections.length > 0) && (
          <div className="h-px bg-[var(--color-separator)]" />
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs text-[var(--color-text-muted)]">
            {isSearching && (
              <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent align-middle" />
            )}
            {statusText ||
              (navItems.length > 0 ? '\u2191\u2193 navigate \u00b7 \u23ce select' : '')}
          </span>
          <span className="text-[11px] text-[var(--color-text-faint)]">
            <Kbd>Esc</Kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
