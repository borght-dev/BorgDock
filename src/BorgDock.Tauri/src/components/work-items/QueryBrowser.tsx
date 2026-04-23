import clsx from 'clsx';
import { useCallback, useState } from 'react';
import type { AdoQuery } from '../../types';

export interface AdoQueryTreeNode extends AdoQuery {
  isFavorite: boolean;
  isExpanded: boolean;
}

interface QueryBrowserProps {
  queryTree: AdoQueryTreeNode[];
  favoriteQueries: AdoQueryTreeNode[];
  isLoading: boolean;
  errorMessage?: string;
  selectedQueryId?: string;
  onSelectQuery: (queryId: string) => void;
  onToggleFavorite: (queryId: string) => void;
  onClose: () => void;
}

function QueryTreeItem({
  node,
  depth,
  selectedQueryId,
  onSelectQuery,
  onToggleFavorite,
  onToggleExpand,
}: {
  node: AdoQueryTreeNode;
  depth: number;
  selectedQueryId?: string;
  onSelectQuery: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const isSelected = node.id === selectedQueryId;

  return (
    <div>
      <div
        className={clsx(
          'group/item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors cursor-pointer',
          isSelected
            ? 'bg-[var(--color-selected-row-bg)] text-[var(--color-accent)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.isFolder) {
            onToggleExpand(node.id);
          } else {
            onSelectQuery(node.id);
          }
        }}
      >
        {node.isFolder ? (
          <svg
            className={clsx(
              'h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform',
              node.isExpanded && 'rotate-90',
            )}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M6 4l4 4-4 4V4z" />
          </svg>
        ) : (
          <svg
            className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="2" y="3" width="12" height="10" rx="1.5" />
            <path d="M5 6h6M5 9h4" />
          </svg>
        )}
        <span className="min-w-0 truncate">{node.name}</span>
        {!node.isFolder && (
          <button
            className={clsx(
              'ml-auto shrink-0 p-0.5 transition-colors',
              node.isFavorite
                ? 'text-[var(--color-status-yellow)]'
                : 'text-[var(--color-text-ghost)] opacity-0 group-hover/item:opacity-100 hover:text-[var(--color-status-yellow)]',
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(node.id);
            }}
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 16 16"
              fill={node.isFavorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <path d="M8 1.5l2 4.1 4.5.6-3.3 3.2.8 4.5L8 11.7l-4 2.2.8-4.5L1.5 6.2l4.5-.6z" />
            </svg>
          </button>
        )}
      </div>
      {node.isFolder && node.isExpanded && node.children.length > 0 && (
        <div>
          {(node.children as AdoQueryTreeNode[]).map((child) => (
            <QueryTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedQueryId={selectedQueryId}
              onSelectQuery={onSelectQuery}
              onToggleFavorite={onToggleFavorite}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function QueryBrowser({
  queryTree,
  favoriteQueries,
  isLoading,
  errorMessage,
  selectedQueryId,
  onSelectQuery,
  onToggleFavorite,
  onClose,
}: QueryBrowserProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const treeWithExpansion = queryTree.map(function addExpansion(
    node: AdoQueryTreeNode,
  ): AdoQueryTreeNode {
    return {
      ...node,
      isExpanded: expandedIds.has(node.id),
      children: (node.children as AdoQueryTreeNode[]).map(addExpansion),
    };
  });

  return (
    <div className="flex h-full flex-col border-r border-[var(--color-subtle-border)] bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-subtle-border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Saved Queries</h2>
        <button
          onClick={onClose}
          className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-text-ghost)] border-t-[var(--color-accent)]" />
          </div>
        )}

        {errorMessage && !isLoading && (
          <div className="rounded-md bg-[var(--color-error-badge-bg)] px-3 py-2 text-[13px] text-[var(--color-error-badge-fg)]">
            {errorMessage}
          </div>
        )}

        {!isLoading && !errorMessage && (
          <>
            {/* Favorites */}
            {favoriteQueries.length > 0 && (
              <div className="mb-3">
                <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-ghost)]">
                  Favorites
                </div>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {favoriteQueries.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => onSelectQuery(q.id)}
                      className={clsx(
                        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition-colors',
                        q.id === selectedQueryId
                          ? 'bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                          : 'bg-[var(--color-filter-chip-bg)] text-[var(--color-filter-chip-fg)] hover:bg-[var(--color-surface-hover)]',
                      )}
                    >
                      <svg
                        className="h-3 w-3 text-[var(--color-status-yellow)]"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
                        <path d="M8 1.5l2 4.1 4.5.6-3.3 3.2.8 4.5L8 11.7l-4 2.2.8-4.5L1.5 6.2l4.5-.6z" />
                      </svg>
                      {q.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Query tree */}
            <div>
              {treeWithExpansion.map((node) => (
                <QueryTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedQueryId={selectedQueryId}
                  onSelectQuery={onSelectQuery}
                  onToggleFavorite={onToggleFavorite}
                  onToggleExpand={handleToggleExpand}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
