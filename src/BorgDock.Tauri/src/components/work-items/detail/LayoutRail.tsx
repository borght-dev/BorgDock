import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  PanelRight,
  Puzzle,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { AdoClient } from '@/services/ado/client';
import type { FormField, FormGroup } from '@/services/ado/form-model';
import { developmentLinks, RELATED_LABEL, relatedLinks } from '@/services/ado/relations';
import type { WorkItem } from '@/types';
import { avatarToneFor, getInitials, MiniAvatar, TypeGlyph } from '../shared/wi-visuals';
import type { ItemContext } from './useItemContext';
import { useRelatedItems } from './useRelatedItems';
import { openPull } from './WorkItemNow';

const ICON = { size: 12, strokeWidth: 2, 'aria-hidden': true } as const;
const URL_VALUE = /^https?:\/\/\S+$/i;

function isIdentity(field: FormField): boolean {
  if (field.type === 'identity') return true;
  const v = field.value;
  return typeof v === 'object' && v !== null && 'displayName' in (v as object);
}

/** A field's value as the rail shows it: by its ADO type. */
export function FieldValue({ field }: { field: FormField }): ReactNode {
  if (!field.text) return <span className="bd-wid-kv__muted">—</span>;
  if (isIdentity(field)) {
    const initials = getInitials(field.text);
    return (
      <>
        <MiniAvatar initials={initials} tone={avatarToneFor(initials)} size={16} />
        <span className="bd-wid-kv__text">{field.text}</span>
      </>
    );
  }
  if (field.type === 'treePath' || /Path$/.test(field.key)) {
    const parts = field.text.split('\\').filter(Boolean);
    const last = parts.pop() ?? field.text;
    return (
      <span className="bd-wid-kv__text" title={field.text}>
        {parts.length > 0 && <span className="bd-wid-kv__muted">{parts.slice(-1)[0]} › </span>}
        {last}
      </span>
    );
  }
  if (field.type === 'integer' || field.type === 'double' || typeof field.value === 'number') {
    const n = Number(field.value);
    return (
      <span className="bd-wid-kv__text" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Number.isFinite(n) ? n.toLocaleString() : field.text}
      </span>
    );
  }
  if (URL_VALUE.test(field.text)) {
    return (
      <a
        className="bd-wid-kv__text"
        href={field.text}
        onClick={(e) => {
          e.preventDefault();
          import('@tauri-apps/plugin-opener')
            .then(({ openUrl }) => openUrl(field.text))
            .catch(() => {});
        }}
      >
        {field.text.replace(/^https?:\/\//, '')}
      </a>
    );
  }
  const mono = /^[A-Z]{2,}-\d+$|^\d+(\.\d+){1,3}$/.test(field.text);
  return (
    <span
      className={mono ? 'bd-wid-kv__text bd-wid-kv__mono' : 'bd-wid-kv__text'}
      title={field.text}
    >
      {field.text}
    </span>
  );
}

function FieldsGroup({ group }: { group: FormGroup }) {
  const [showEmpty, setShowEmpty] = useState(false);
  const rows = showEmpty ? [...group.fields, ...group.empty] : group.fields;
  return (
    <div className="bd-wid-rg" data-wid-group={group.label}>
      <div className="bd-wid-rg__head">
        <b>{group.label || 'Details'}</b>
        {group.custom && <span className="bd-wid-rg__tag">custom group</span>}
        {group.empty.length > 0 && (
          <button
            type="button"
            className="bd-wid-rg__empty"
            aria-expanded={showEmpty}
            onClick={() => setShowEmpty((v) => !v)}
          >
            {showEmpty ? 'Hide empty' : `${group.empty.length} empty`}
            <ChevronDown
              {...ICON}
              style={{ transform: showEmpty ? 'rotate(180deg)' : undefined }}
            />
          </button>
        )}
      </div>
      {rows.length > 0 ? (
        <dl className="bd-wid-kv">
          {rows.map((field) => (
            <div key={field.key} style={{ display: 'contents' }}>
              <dt title={field.label}>{field.label}</dt>
              <dd data-empty={field.text ? undefined : ''}>
                <FieldValue field={field} />
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="bd-wid-rg__none">All fields empty</span>
      )}
    </div>
  );
}

function DevelopmentGroup({
  group,
  workItem,
  context,
}: {
  group: FormGroup;
  workItem: WorkItem;
  context: ItemContext;
}) {
  const links = developmentLinks(workItem.relations);
  const known = new Map(context.pulls.map((p) => [p.number, p]));
  const numbers = [...new Set([...context.pulls.map((p) => p.number), ...links.pullRequests])];
  const empty = numbers.length === 0 && links.branches.length === 0 && links.commits.length === 0;
  return (
    <div className="bd-wid-rg" data-wid-group={group.label}>
      <div className="bd-wid-rg__head">
        <b>{group.label || 'Development'}</b>
        <span className="bd-wid-rg__tag">ADO control</span>
      </div>
      {empty && <span className="bd-wid-rg__none">No pull requests or branches</span>}
      {numbers.map((number) => {
        const pull = known.get(number);
        return (
          <button
            key={number}
            type="button"
            className="bd-wid-rlink"
            disabled={!pull}
            onClick={() => pull && openPull(pull)}
          >
            <GitPullRequest
              {...ICON}
              style={{
                color:
                  pull?.state === 'merged'
                    ? 'var(--color-status-merged)'
                    : pull?.state === 'closed'
                      ? 'var(--color-text-tertiary)'
                      : 'var(--color-status-green)',
              }}
            />
            <span className="bd-wid-rlink__id">#{number}</span>
            <span className="bd-wid-rlink__text" data-muted={pull ? undefined : ''}>
              {pull?.title ?? 'Pull request'}
            </span>
            {pull?.conflicts && (
              <span
                title="Conflicts with the base branch"
                style={{ color: 'var(--color-status-yellow)' }}
              >
                <AlertTriangle {...ICON} />
              </span>
            )}
          </button>
        );
      })}
      {links.branches.map((branch) => (
        <div key={branch} className="bd-wid-rlink">
          <GitBranch {...ICON} style={{ color: 'var(--color-text-tertiary)' }} />
          <span className="bd-wid-rlink__text bd-wid-rlink__mono">{branch}</span>
        </div>
      ))}
      {links.commits.length > 0 && (
        <div className="bd-wid-rlink">
          <GitCommitHorizontal {...ICON} style={{ color: 'var(--color-text-tertiary)' }} />
          <span className="bd-wid-rlink__text" data-muted="">
            {links.commits.length} commit{links.commits.length === 1 ? '' : 's'}
          </span>
        </div>
      )}
    </div>
  );
}

function RelatedGroup({
  group,
  workItem,
  getClient,
  onOpenItem,
}: {
  group: FormGroup;
  workItem: WorkItem;
  getClient: () => AdoClient | null;
  onOpenItem?: (id: number) => void;
}) {
  const links = relatedLinks(workItem.relations);
  const items = useRelatedItems(
    links.map((l) => l.id),
    getClient,
  );
  const children = links.filter((l) => l.kind === 'child');
  const done = children.filter((l) =>
    /^(done|closed|resolved|removed)$/i.test(items.get(l.id)?.state ?? ''),
  ).length;
  return (
    <div className="bd-wid-rg" data-wid-group={group.label}>
      <div className="bd-wid-rg__head">
        <b>{group.label || 'Related Work'}</b>
        <span className="bd-wid-rg__tag">ADO control</span>
      </div>
      {links.length === 0 && <span className="bd-wid-rg__none">No linked items</span>}
      {links.map((link) => {
        const item = items.get(link.id);
        const closed = /^(done|closed|removed)$/i.test(item?.state ?? '');
        return (
          <button
            key={`${link.kind}-${link.id}`}
            type="button"
            className="bd-wid-rlink"
            onClick={() => onOpenItem?.(link.id)}
            title={item ? `${item.type} ${link.id} · ${item.state}` : `AB#${link.id}`}
          >
            <span className="bd-wid-rlink__kind">{RELATED_LABEL[link.kind]}</span>
            {item && <TypeGlyph type={item.type} size={10} />}
            <span className="bd-wid-rlink__id">{link.id}</span>
            <span className="bd-wid-rlink__text" data-muted={closed ? '' : undefined}>
              {item ? `${item.title}${closed ? ` · ${item.state}` : ''}` : ''}
            </span>
          </button>
        );
      })}
      {children.length > 1 && (
        <div className="bd-wid-progress" title={`${done} of ${children.length} children done`}>
          <span className="bd-wid-progress__bar">
            <i style={{ width: `${(done / children.length) * 100}%` }} />
          </span>
          <span>
            {done} of {children.length} done
          </span>
        </div>
      )}
    </div>
  );
}

export interface LayoutRailProps {
  groups: FormGroup[];
  workItem: WorkItem;
  context: ItemContext;
  workItemType: string;
  fromLayout: boolean;
  getClient: () => AdoClient | null;
  onOpenInAdo?: () => void;
  onOpenItem?: (id: number) => void;
  /** Show only the first few groups (the peek). */
  limit?: number;
}

/**
 * The rail: the ADO layout's groups with ADO's labels and order, the
 * header's facts left out. Development and Related Work are drawn natively;
 * an extension BorgDock can't draw gets a row that opens ADO.
 */
export function LayoutRail({
  groups,
  workItem,
  context,
  workItemType,
  fromLayout,
  getClient,
  onOpenInAdo,
  onOpenItem,
  limit,
}: LayoutRailProps) {
  const shown = limit ? groups.slice(0, limit) : groups;
  const hiddenEmpty = groups.reduce((n, g) => n + g.empty.length, 0);
  const createdBy = workItem.fields['System.CreatedBy'] as
    | { displayName?: string }
    | string
    | undefined;
  const creator = typeof createdBy === 'string' ? createdBy : createdBy?.displayName;
  const created = workItem.fields['System.CreatedDate'];
  const createdText =
    typeof created === 'string'
      ? new Date(created).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : null;

  return (
    <div className="bd-wid-railgroups" data-wid-rail="">
      {shown.map((group) => {
        if (group.kind === 'development') {
          return (
            <DevelopmentGroup key={group.id} group={group} workItem={workItem} context={context} />
          );
        }
        if (group.kind === 'related') {
          return (
            <RelatedGroup
              key={group.id}
              group={group}
              workItem={workItem}
              getClient={getClient}
              onOpenItem={onOpenItem}
            />
          );
        }
        if (group.kind === 'extension') {
          return (
            <div key={group.id} className="bd-wid-rg" data-wid-group={group.label}>
              <div
                className="bd-wid-ext"
                title={`${group.label}: an ADO extension BorgDock can't draw`}
              >
                <Puzzle {...ICON} />
                <span>{group.label || 'Extension'}</span>
                <span className="bd-wid-ext__kind">extension</span>
                {onOpenInAdo && (
                  <button type="button" className="bd-wid-ext__open" onClick={onOpenInAdo}>
                    Open in ADO
                    <ExternalLink {...ICON} />
                  </button>
                )}
              </div>
            </div>
          );
        }
        return <FieldsGroup key={group.id} group={group} />;
      })}
      {limit && groups.length > limit ? (
        <div className="bd-wid-rail__foot">
          <PanelRight {...ICON} />
          <span>
            {groups.length - limit} more group{groups.length - limit === 1 ? '' : 's'} in the full
            view
          </span>
        </div>
      ) : (
        <div className="bd-wid-rail__foot">
          <PanelRight {...ICON} />
          <span>
            {fromLayout ? (
              <>
                Groups and labels come from the ADO layout of <b>{workItemType}</b>.
                {hiddenEmpty > 0 &&
                  ` ${hiddenEmpty} empty field${hiddenEmpty === 1 ? '' : 's'} folded.`}
              </>
            ) : (
              <>No ADO layout for {workItemType}: its fields are listed as they come.</>
            )}
            {creator && (
              <>
                {' '}
                Created by <b>{creator}</b>
                {createdText ? ` on ${createdText}` : ''}.
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
