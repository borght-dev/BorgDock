import { memo } from 'react';
import { Avatar, CheckBar, checkBarSummary } from '@/components/shared/primitives';
import type { PrFacts } from '@/services/pr-list/facts';
import type { PrGroupNode } from '@/services/pr-list/groups';
import { formatAgoShort } from '@/utils/relative-time';
import { NextStepPill, PrTitle, StatusMark } from './PrListRow';
import { usePrRowBehaviour } from './PrRow';
import { PrRowOverlays } from './PrRowOverlays';
import { avatarInitials } from './pr-card-data';

/**
 * PrBoardCard — one PR on the board: title over two lines, who and where,
 * the check bar, and the next step. Clicks, keys, the context menu and the
 * trailing action are the rows' (`usePrRowBehaviour`).
 */
const PrBoardCard = memo(function PrBoardCard({ facts, now }: { facts: PrFacts; now: number }) {
  const p = facts.pr.pullRequest;
  const { key, selected, cardData, actions, action, handleClick, handleAuxClick, handleMouseDown } =
    usePrRowBehaviour(facts.pr);
  const checks = cardData.checks ?? { ok: 0, fail: 0, run: 0, total: 0 };
  return (
    <>
      <article
        className="bd-prl-card"
        data-pr-card=""
        data-pr-key={key}
        data-pr-number={String(p.number)}
        data-key={key}
        data-bucket={facts.bucket}
        data-selected={selected ? 'true' : undefined}
        role="button"
        tabIndex={0}
        aria-label={`${p.title}, #${p.number}`}
        aria-current={selected ? 'true' : undefined}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        onMouseDown={handleMouseDown}
        onContextMenu={actions.handleContextMenu}
        onKeyDown={(e) => {
          if (e.defaultPrevented || e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e as unknown as React.MouseEvent<HTMLElement>);
          }
        }}
      >
        <div className="bd-prl-card__title">
          <StatusMark facts={facts} />
          <PrTitle facts={facts} />
        </div>
        <div className="bd-prl-card__meta">
          <Avatar
            initials={avatarInitials(p.authorLogin)}
            tone={facts.mine ? 'own' : 'them'}
            size="sm"
            className="bd-prl-stack__av"
            aria-hidden="true"
          />
          <span className="bd-prl-card__where">
            {p.repoName} #{p.number} · {formatAgoShort(p.updatedAt, now)}
            {facts.stale ? ' · stale' : ''}
          </span>
          {checks.total > 0 && (
            <CheckBar
              className="bd-prl-card__checks"
              ok={checks.ok}
              fail={checks.fail}
              run={checks.run}
              total={checks.total}
              unavailable={checks.unavailable}
              title={checkBarSummary(checks).label}
            />
          )}
        </div>
        <div className="bd-prl-card__foot">
          <NextStepPill facts={facts} />
          {action && (
            <span className="bd-prl-card__action" data-pr-card-action="">
              {action}
            </span>
          )}
        </div>
      </article>
      <PrRowOverlays prWithChecks={facts.pr} actions={actions} />
    </>
  );
});

/** The board: one column per group of the display's grouping, cards in the list's order. */
export function PrBoard({ groups, now }: { groups: readonly PrGroupNode[]; now: number }) {
  return (
    <div className="bd-prl-board" data-board="">
      {groups.map((group) => (
        <section
          key={group.key}
          className="bd-prl-col"
          aria-label={group.label}
          data-group-key={group.key}
        >
          <header className="bd-prl-col__head" data-key={`group:${group.key}`}>
            <span className="bd-prl-col__title">
              {group.bucket ? (
                <span className="bd-prl-mark" data-bucket={group.bucket} aria-hidden="true" />
              ) : group.author ? (
                <Avatar
                  initials={group.author.login.slice(0, 2).toUpperCase()}
                  tone={group.author.isMe ? 'own' : 'them'}
                  size="sm"
                  className="bd-wb-group__avatar"
                  aria-hidden="true"
                />
              ) : null}
              <span className="bd-prl-col__label">{group.label}</span>
              <span className="bd-prl-col__count">{group.facts.length}</span>
            </span>
            {group.hint && <span className="bd-prl-col__hint">{group.hint}</span>}
          </header>
          <div className="bd-prl-col__cards">
            {group.facts.length === 0 && <p className="bd-prl-empty-group">Nothing here</p>}
            {group.facts.map((f) => (
              <PrBoardCard key={f.key} facts={f} now={now} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
