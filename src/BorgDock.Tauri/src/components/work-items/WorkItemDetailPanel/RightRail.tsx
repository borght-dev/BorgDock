// src/components/work-items/WorkItemDetailPanel/RightRail.tsx
import type { ReactNode } from 'react';
import { Pill } from '@/components/shared/primitives';
import {
  MiniAvatar,
  PrioBars,
  StatePill,
  TypeGlyph,
  avatarToneFor,
  getInitials,
} from '@/components/work-items/shared/wi-visuals';
import type { LinkedPR } from './parseLinkedPRs';

interface Props {
  state: string;
  priority?: number;
  severity?: string;
  workItemType: string;
  assignedTo: string;
  reporter: string;
  iteration: string;
  area: string;
  backlogPriority?: number | string;
  foundIn?: string;
  tags: string[];
  linkedPRs: LinkedPR[];
}

export function RightRail(props: Props) {
  const {
    state,
    priority,
    severity,
    workItemType,
    assignedTo,
    reporter,
    iteration,
    area,
    backlogPriority,
    foundIn,
    tags,
    linkedPRs,
  } = props;

  const assigneeInitials = getInitials(assignedTo || '??');
  const reporterInitials = reporter ? getInitials(reporter) : null;

  return (
    <div>
      <RailGroup title="Properties">
        <RailRow label="State">
          <StatePill state={state} compact />
        </RailRow>
        {priority != null && (
          <RailRow label="Priority">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11.5,
                color: 'var(--color-text-secondary)',
              }}
            >
              <PrioBars prio={priority} /> P{priority}
            </span>
          </RailRow>
        )}
        {severity && (
          <RailRow label="Severity">
            <Pill tone="warning">{severity}</Pill>
          </RailRow>
        )}
        <RailRow label="Type">
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11.5,
              color: 'var(--color-text-secondary)',
            }}
          >
            <TypeGlyph type={workItemType} /> {workItemType}
          </span>
        </RailRow>
      </RailGroup>

      <RailGroup title="People">
        <RailRow label="Assignee">
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              color: 'var(--color-text-secondary)',
            }}
          >
            <MiniAvatar
              initials={assigneeInitials}
              tone={avatarToneFor(assigneeInitials)}
              size={16}
            />
            {assignedTo || 'Unassigned'}
          </span>
        </RailRow>
        {reporter && reporterInitials && (
          <RailRow label="Reporter">
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11.5,
                color: 'var(--color-text-secondary)',
              }}
            >
              <MiniAvatar
                initials={reporterInitials}
                tone={avatarToneFor(reporterInitials)}
                size={16}
              />
              {reporter}
            </span>
          </RailRow>
        )}
      </RailGroup>

      {(iteration || area || backlogPriority != null || foundIn) && (
        <RailGroup title="Planning">
          {iteration && (
            <RailRow label="Iteration">
              <span
                className="bd-mono"
                style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}
              >
                {iteration}
              </span>
            </RailRow>
          )}
          {area && (
            <RailRow label="Area">
              <span
                className="bd-mono"
                style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}
              >
                {area}
              </span>
            </RailRow>
          )}
          {backlogPriority != null && (
            <RailRow label="Backlog Prio">
              <span
                style={{
                  fontSize: 11.5,
                  color: 'var(--color-text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {backlogPriority}
              </span>
            </RailRow>
          )}
          {foundIn && (
            <RailRow label="Found In">
              <span
                className="bd-mono"
                style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}
              >
                {foundIn}
              </span>
            </RailRow>
          )}
        </RailGroup>
      )}

      {tags.length > 0 && (
        <RailGroup title="Tags">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tags.map((t) => (
              <Pill key={t} tone="neutral">
                {t}
              </Pill>
            ))}
          </div>
        </RailGroup>
      )}

      {linkedPRs.length > 0 && (
        <RailGroup title="Linked PRs">
          {linkedPRs.map((pr) => (
            <div
              key={pr.id}
              className="bd-card"
              style={{
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginBottom: 6,
              }}
            >
              <span
                className="bd-mono"
                style={{ fontSize: 11, color: 'var(--color-text-muted)' }}
              >
                #{pr.id}
              </span>
              {pr.comment && (
                <span
                  style={{
                    flex: 1,
                    fontSize: 11.5,
                    color: 'var(--color-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pr.comment}
                </span>
              )}
            </div>
          ))}
        </RailGroup>
      )}
    </div>
  );
}

function RailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--color-text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

function RailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '92px 1fr',
        alignItems: 'center',
        columnGap: 8,
        minHeight: 24,
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {children}
      </span>
    </div>
  );
}
