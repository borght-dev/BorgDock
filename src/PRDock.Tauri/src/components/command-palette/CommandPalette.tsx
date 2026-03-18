import { useState, useEffect, useRef, useCallback } from 'react';
import { useUiStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { AdoClient } from '@/services/ado/client';
import { searchWorkItemsByIdPrefix } from '@/services/ado/workitems';
import type { WorkItem } from '@/types';

interface ResultItem {
  id: number;
  title: string;
  state: string;
  workItemType: string;
  assignedTo: string;
}

function getField(item: WorkItem, field: string): string {
  const value = item.fields[field];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.displayName === 'string') return obj.displayName;
  }
  return '';
}

interface CommandPaletteProps {
  onSelectWorkItem: (id: number) => void;
}

export function CommandPalette({ onSelectWorkItem }: CommandPaletteProps) {
  const isOpen = useUiStore((s) => s.isCommandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const settings = useSettingsStore((s) => s.settings);

  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [statusText, setStatusText] = useState('Type a work item ID...');
  const [isSearching, setIsSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const searchCtsRef = useRef<AbortController | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearchText('');
      setResults([]);
      setSelectedIndex(-1);
      setStatusText('Type a work item ID...');
      setIsSearching(false);
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const getClient = useCallback(() => {
    const ado = settings.azureDevOps;
    return new AdoClient(ado.organization, ado.project, ado.personalAccessToken ?? '');
  }, [settings.azureDevOps]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    searchCtsRef.current?.abort();

    if (!searchText.trim()) {
      setResults([]);
      setSelectedIndex(-1);
      setStatusText('Type a work item ID...');
      return;
    }

    if (!/^\d+$/.test(searchText)) {
      setResults([]);
      setSelectedIndex(-1);
      setStatusText('Type a numeric ID');
      return;
    }

    if (searchText.length < 2) {
      setResults([]);
      setSelectedIndex(-1);
      setStatusText('Type at least 2 digits');
      return;
    }

    const controller = new AbortController();
    searchCtsRef.current = controller;

    setIsSearching(true);
    setStatusText('Searching...');

    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return;

      try {
        const client = getClient();
        const items = await searchWorkItemsByIdPrefix(client, searchText);
        if (controller.signal.aborted) return;

        const mapped: ResultItem[] = items.map((wi) => ({
          id: wi.id,
          title: getField(wi, 'System.Title'),
          state: getField(wi, 'System.State'),
          workItemType: getField(wi, 'System.WorkItemType'),
          assignedTo: getField(wi, 'System.AssignedTo'),
        }));

        setResults(mapped);
        setSelectedIndex(mapped.length > 0 ? 0 : -1);
        setStatusText(
          mapped.length === 0
            ? 'No results'
            : mapped.length === 1
              ? '1 result'
              : `${mapped.length} results`,
        );
      } catch {
        if (!controller.signal.aborted) {
          setStatusText('Search failed');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchText, isOpen, getClient]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (results.length > 0) {
            setSelectedIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (results.length > 0) {
            setSelectedIndex((i) => (i >= results.length - 1 ? 0 : i + 1));
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < results.length) {
            const item = results[selectedIndex];
            if (item) {
              setOpen(false);
              onSelectWorkItem(item.id);
            }
          }
          break;
      }
    },
    [results, selectedIndex, setOpen, onSelectWorkItem],
  );

  const handleItemClick = useCallback(
    (id: number) => {
      setOpen(false);
      onSelectWorkItem(id);
    },
    [setOpen, onSelectWorkItem],
  );

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) setOpen(false);
      }}
    >
      <div
        className="w-[460px] rounded-xl border shadow-2xl"
        style={{
          backgroundColor: 'var(--color-card-background)',
          borderColor: 'var(--color-strong-border)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="p-3 pb-2">
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search work item by ID..."
            className="w-full rounded-lg border px-3 py-2.5 text-base outline-none"
            style={{
              backgroundColor: 'var(--color-input-bg)',
              borderColor: 'var(--color-input-border)',
              color: 'var(--color-text-primary)',
              caretColor: 'var(--color-accent)',
            }}
          />
        </div>

        {/* Results list */}
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            {results.map((item, index) => (
              <div
                key={item.id}
                className="flex cursor-pointer items-center justify-between px-4 py-2 transition-colors"
                style={{
                  backgroundColor:
                    index === selectedIndex
                      ? 'var(--color-accent-subtle)'
                      : 'transparent',
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseDown={() => handleItemClick(item.id)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="shrink-0 text-[13px] font-bold"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    #{item.id}
                  </span>
                  <span
                    className="truncate text-[13px]"
                    style={{ color: 'var(--color-text-primary)' }}
                  >
                    {item.title}
                  </span>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                  <span
                    className="text-[11px]"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {item.workItemType}
                  </span>
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    {item.state}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Separator */}
        {results.length > 0 && (
          <div className="h-px" style={{ backgroundColor: 'var(--color-separator)' }} />
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {isSearching && (
              <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent align-middle" />
            )}
            {statusText}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
            Esc to close
          </span>
        </div>
      </div>
    </div>
  );
}
