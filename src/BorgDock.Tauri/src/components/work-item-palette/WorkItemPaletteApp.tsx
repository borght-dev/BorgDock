import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useRef } from 'react';
import { WindowStatusBar } from '@/components/shared/chrome';
import { Kbd } from '@/components/shared/primitives';
import { WindowTitleBar } from '@/components/shared/WindowTitleBar';
import { WorkItemPaletteRow } from '@/components/work-item-palette/WorkItemPaletteRow';
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

  // Reveal the (invisible-built) window once React has painted, focus the
  // search input, and re-assert OS focus on the main thread. The window is
  // built `.visible(false)` so the user never sees an unstyled flash.
  //
  // A previous implementation polled setFocus every 50ms × 30 attempts,
  // which combined with a Rust-side std::thread::spawn + sleep(200ms) +
  // set_focus flooded WebView2's PostMessage queue and crashed the process
  // ("PostMessage failed ; is the messages queue full?" / invalid HWND).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      invoke('window_ready').catch(() => {});
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Global keydown for Escape — hide rather than close so any in-flight
  // `invoke()` responses still have a live HWND to PostMessage back to.
  // Closing destroys the window mid-IPC and floods stderr with
  // "PostMessage failed ; is the messages queue full? Error 0x80070578".
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        getCurrentWindow().hide().catch(console.debug); /* fire-and-forget */
      }
    }
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, []);

  // The window is hidden (not destroyed) on Escape / select, so on each
  // re-show the Rust toggle emits `palette-shown`. Reset transient state
  // and refocus the input so every open feels like a fresh palette.
  useEffect(() => {
    const unlisten = listen('palette-shown', () => {
      setSearchText('');
      setSelectedIndex(-1);
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [setSearchText, setSelectedIndex]);

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

  // Track flat index offset for sectioned rendering
  let globalOffset = 0;

  return (
    <div className="bd-wp-palette">
      <WindowTitleBar title="Work Items" meta={<Kbd>Ctrl+F9</Kbd>} />

      <div className="bd-wp-search-wrap">
        <input
          ref={inputRef}
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search by ID, title, or assigned to..."
          className="bd-input bd-wp-search"
        />
      </div>

      <div ref={listRef} className="bd-wp-content">
        {isSearchMode ? (
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
          <>
            {browseSections.length === 0 && !isLoadingBrowse && (
              <div className="bd-wp-empty">Type to search work items</div>
            )}
            {isLoadingBrowse && browseSections.length === 0 && (
              <div className="bd-wp-loading">
                <span className="bd-wp-spinner" />
                <span>Loading...</span>
              </div>
            )}
            {browseSections.map((section) => {
              const sectionStart = globalOffset;
              const rendered = (
                <div key={section.label}>
                  <div className="bd-wp-section-header">{section.label}</div>
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

      <WindowStatusBar
        left={
          <span className="bd-mono">
            {isSearching && <span className="bd-wp-spinner bd-wp-spinner--inline" />}
            {statusText || (navItems.length > 0 ? `${navItems.length} results` : '')}
          </span>
        }
        right={
          <span className="bd-mono">
            <Kbd>{'\u2191\u2193'}</Kbd> nav {'\u00b7'} <Kbd>{'\u23ce'}</Kbd> select {'\u00b7'} <Kbd>Esc</Kbd>
          </span>
        }
      />
    </div>
  );
}
