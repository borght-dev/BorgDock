import clsx from 'clsx';
import { useState } from 'react';
import { IconButton } from '@/components/shared/primitives';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  EditIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  ZapIcon,
} from './icons';
import type { SqlSnippet } from './snippet-types';

interface SnippetsRailProps {
  snippets: SqlSnippet[];
  activeId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onLoad: (snippet: SqlSnippet) => void;
  onToggleStar: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveAs: () => void;
}

export function SnippetsRail({
  snippets,
  activeId,
  collapsed,
  onToggleCollapsed,
  onLoad,
  onToggleStar,
  onRename,
  onDuplicate,
  onDelete,
  onSaveAs,
}: SnippetsRailProps) {
  const [search, setSearch] = useState('');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const lower = search.toLowerCase();
  const filtered = lower
    ? snippets.filter(
        (s) => s.name.toLowerCase().includes(lower) || s.body.toLowerCase().includes(lower),
      )
    : snippets;

  if (collapsed) {
    return (
      <aside className="sql-snippets-rail sql-snippets-rail--collapsed">
        <button
          type="button"
          className="sql-snippets-rail__expand bd-icon-btn"
          title="Expand snippets"
          onClick={onToggleCollapsed}
        >
          <ChevronRightIcon size={14} />
        </button>
        <div className="sql-snippets-rail__stack bd-scroll">
          <div className="sql-snippets-rail__vlabel">
            <FolderIcon size={11} />
            <span>Snippets · {snippets.length}</span>
          </div>
          {filtered.slice(0, 12).map((s) => {
            const isActive = s.id === activeId;
            const initial =
              s.name
                .replace(/^[^a-z0-9]*/i, '')
                .charAt(0)
                .toUpperCase() || '•';
            return (
              <button
                key={s.id}
                type="button"
                title={s.name}
                onClick={() => onLoad(s)}
                className={clsx(
                  'sql-snippets-rail__pip',
                  isActive && 'sql-snippets-rail__pip--active',
                  s.starred && !isActive && 'sql-snippets-rail__pip--starred',
                )}
              >
                {s.starred ? <ZapIcon size={11} /> : initial}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="sql-snippets-rail">
      <header className="sql-snippets-rail__header">
        <div className="sql-snippets-rail__heading">
          <FolderIcon size={12} />
          <span className="bd-section-label">Snippets</span>
          <span className="sql-snippets-rail__count">{snippets.length}</span>
          <IconButton
            icon={<ChevronLeftIcon size={15} />}
            tooltip="Collapse snippets"
            size={22}
            aria-label="Collapse snippets"
            onClick={onToggleCollapsed}
          />
        </div>
        <div className="bd-input sql-snippets-rail__search">
          <span className="bd-input__adornment">
            <SearchIcon size={11} />
          </span>
          <input
            type="text"
            placeholder="Filter snippets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>

      <ul className="sql-snippets-rail__list bd-scroll" role="listbox" aria-label="Snippets">
        {filtered.length === 0 && (
          <li className="sql-snippets-rail__empty">
            {snippets.length === 0
              ? 'No snippets yet — save your current query.'
              : `No snippets match "${search}"`}
          </li>
        )}
        {filtered.map((s) => {
          const isActive = s.id === activeId;
          const isHover = hoverId === s.id;
          const isRenaming = renamingId === s.id;
          const showActions = (isHover || isActive) && !isRenaming;
          const firstLine = s.body.split('\n').find((l) => l.trim()) ?? '';
          return (
            <li
              key={s.id}
              role="option"
              aria-selected={isActive}
              className={clsx(
                'sql-snippets-rail__row',
                isActive && 'sql-snippets-rail__row--active',
              )}
              onMouseEnter={() => setHoverId(s.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => !isRenaming && onLoad(s)}
            >
              <div className="sql-snippets-rail__row-head">
                <button
                  type="button"
                  className={clsx(
                    'bd-icon-btn',
                    'sql-snippets-rail__star',
                    s.starred && 'sql-snippets-rail__star--on',
                  )}
                  title={s.starred ? 'Unstar' : 'Star'}
                  aria-label={s.starred ? 'Unstar snippet' : 'Star snippet'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(s.id);
                  }}
                >
                  <ZapIcon size={13} />
                </button>
                {isRenaming ? (
                  <input
                    autoFocus
                    defaultValue={s.name}
                    className="sql-snippets-rail__rename"
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      onRename(s.id, e.target.value);
                      setRenamingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onRename(s.id, e.currentTarget.value);
                        setRenamingId(null);
                      }
                      if (e.key === 'Escape') {
                        // Mark handled so the SqlApp document-level Escape
                        // listener doesn't close the window out from under us.
                        e.preventDefault();
                        setRenamingId(null);
                      }
                    }}
                  />
                ) : (
                  <span
                    className={clsx(
                      'sql-snippets-rail__name',
                      isActive && 'sql-snippets-rail__name--active',
                    )}
                  >
                    {s.name}
                  </span>
                )}
                {showActions && (
                  <span className="sql-snippets-rail__actions" onClick={(e) => e.stopPropagation()}>
                    <IconButton
                      icon={<EditIcon size={13} />}
                      tooltip="Rename"
                      aria-label="Rename snippet"
                      size={22}
                      onClick={() => setRenamingId(s.id)}
                    />
                    <IconButton
                      icon={<CopyIcon size={13} />}
                      tooltip="Duplicate"
                      aria-label="Duplicate snippet"
                      size={22}
                      onClick={() => onDuplicate(s.id)}
                    />
                    <IconButton
                      icon={<TrashIcon size={13} />}
                      tooltip="Delete"
                      aria-label="Delete snippet"
                      size={22}
                      className="sql-snippets-rail__delete"
                      onClick={() => onDelete(s.id)}
                    />
                  </span>
                )}
              </div>
              <div className="sql-snippets-rail__meta">
                <ClockIcon size={9} />
                <span>{s.lastRun}</span>
                <span className="sql-snippets-rail__sep">·</span>
                <span className="sql-snippets-rail__preview bd-mono">{firstLine}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="sql-snippets-rail__footer">
        <button
          type="button"
          className="bd-btn bd-btn--sm sql-snippets-rail__save"
          onClick={onSaveAs}
        >
          <PlusIcon size={11} />
          <span>Save current as…</span>
        </button>
      </footer>
    </aside>
  );
}
