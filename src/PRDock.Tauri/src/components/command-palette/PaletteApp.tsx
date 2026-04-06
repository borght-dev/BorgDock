import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef } from 'react';
import { PaletteRow } from '@/components/command-palette/PaletteRow';
import { saveCurrentPosition, usePaletteSearch } from '@/hooks/usePaletteSearch';

export function PaletteApp() {
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
  } = usePaletteSearch();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    let attempts = 0;
    const interval = setInterval(async () => {
      try {
        await getCurrentWindow().setFocus();
      } catch {
        /* ignore */
      }
      inputRef.current?.focus();
      attempts++;
      if (document.activeElement === inputRef.current || attempts > 30) {
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
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
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ backgroundColor: 'var(--color-card-background)' }}
    >
      <div className="flex h-full w-full flex-col">
        {/* Drag handle */}
        <div
          className="flex h-7 cursor-grab items-center justify-center active:cursor-grabbing"
          style={{ backgroundColor: 'var(--color-surface-raised)' }}
          onMouseDown={startDrag}
        >
          <div className="flex gap-1">
            <div className="h-1 w-1 rounded-full" style={{ backgroundColor: 'var(--color-text-ghost)' }} />
            <div className="h-1 w-1 rounded-full" style={{ backgroundColor: 'var(--color-text-ghost)' }} />
            <div className="h-1 w-1 rounded-full" style={{ backgroundColor: 'var(--color-text-ghost)' }} />
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
            className="w-full rounded-lg border px-3 py-2.5 text-base outline-none"
            style={{
              backgroundColor: 'var(--color-input-bg)',
              borderColor: 'var(--color-input-border)',
              color: 'var(--color-text-primary)',
              caretColor: 'var(--color-accent)',
            }}
          />
        </div>

        {/* Content area */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {isSearchMode ? (
            /* Search results */
            navItems.map((item, index) => (
              <PaletteRow
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
                <div
                  className="px-4 py-6 text-center text-[13px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Type to search work items
                </div>
              )}
              {isLoadingBrowse && browseSections.length === 0 && (
                <div className="flex items-center justify-center py-6">
                  <span
                    className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
                    style={{ color: 'var(--color-text-muted)' }}
                  />
                  <span className="text-[13px]" style={{ color: 'var(--color-text-muted)' }}>
                    Loading...
                  </span>
                </div>
              )}
              {browseSections.map((section) => {
                const sectionStart = globalOffset;
                const rendered = (
                  <div key={section.label}>
                    <div
                      className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {section.label}
                    </div>
                    {section.items.map((item, localIndex) => {
                      const flatIndex = sectionStart + localIndex;
                      return (
                        <PaletteRow
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
          <div className="h-px" style={{ backgroundColor: 'var(--color-separator)' }} />
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {isSearching && (
              <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent align-middle" />
            )}
            {statusText || (navItems.length > 0 ? '\u2191\u2193 navigate \u00b7 \u23ce select' : '')}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
            Esc to close
          </span>
        </div>
      </div>
    </div>
  );
}
