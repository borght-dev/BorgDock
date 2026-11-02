import { useState, type FormEvent } from 'react';
import type { Bay, Overview } from '../../../shared/src/api.ts';
import { ago } from '../helpers.ts';
import { useStore } from '../store.tsx';
import { Icon } from './Icon.tsx';

export const BAYS: { key: Bay | 'unlinked'; name: string; short?: string; hint: string }[] = [
  { key: 'waiting', name: 'Waiting on you', hint: 'An agent asked something, proposed a plan or finished its turn.' },
  { key: 'drift', name: 'Out of sync', hint: 'ADO and the agent disagree. Nothing changes in ADO until you confirm.' },
  { key: 'working', name: 'Agents working', hint: 'Running now. Nothing to do.' },
  { key: 'next', name: 'Up next', hint: 'You queued these. No agent yet.' },
  { key: 'idle', name: 'Not started', hint: 'Assigned to you. No agent has touched them.' },
  { key: 'paused', name: 'Paused', hint: 'An agent worked on these. Nothing is running now.' },
  { key: 'unlinked', name: 'Threads without a work item', short: 'Unlinked threads', hint: 'Open T3 threads that no ADO item knows about.' },
  { key: 'handed', name: 'Handed off', hint: 'Code Review, QA or later. Someone else has the next move.' },
];

export const countIn = (overview: Overview | null, key: Bay | 'unlinked') =>
  !overview ? 0 : key === 'unlinked' ? overview.unlinkedThreads.length : overview.items.filter((o) => o.bay === key).length;

export function activeWorkBay(overview: Overview | null, params: URLSearchParams) {
  const requested = params.get('bay') ?? overview?.items.find((o) => o.item.id === Number(params.get('item')))?.bay;
  return BAYS.find((b) => b.key === requested) ?? BAYS[0];
}

export function Brand() {
  const { navigate } = useStore();
  return <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}><span className="brand-mark" />Dispatch</a>;
}

export function WorkHeading() {
  const { overview, route, navigate } = useStore();
  const bay = activeWorkBay(overview, route.params);
  return (
    <header className="work-heading">
      <div><p className="eyebrow">YOUR WORK, AT A GLANCE</p><h1>{bay.name}<span className="heading-count">{countIn(overview, bay.key)}</span></h1><p className="heading-hint">{bay.hint}</p></div>
      <span className="review-view"><Icon name="grid" />Review view</span>
      <label className="bay-picker">View<select value={bay.key} onChange={(e) => navigate(`/?bay=${e.target.value}`)}>{BAYS.map((b) => <option key={b.key} value={b.key}>{b.short ?? b.name} ({countIn(overview, b.key)})</option>)}</select></label>
    </header>
  );
}

export function TopBar() {
  const { overview, navigate, syncNow, syncing } = useStore();
  const [search, setSearch] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (search.trim()) navigate(`/browse?search=${encodeURIComponent(search.trim())}`);
  };
  const ado = overview?.sources.ado;
  const t3 = overview?.sources.t3;
  const section = useRouteLabel();
  return (
    <header className="top">
      <Brand />
      <div className="breadcrumb">{section.parent}<span>/</span><strong>{section.title}</strong></div>
      <form className="search" onSubmit={submit} role="search">
        <Icon name="search" />
        <input aria-label="Search Azure DevOps" placeholder="Search ADO or type an item number" value={search} onChange={(e) => setSearch(e.target.value)} />
      </form>
      <div className="links">
        <span className={ado?.ok ? 'link-ok' : 'link-bad'} title={ado?.error ?? undefined}>{ado?.ok ? `ADO synced ${ago(ado.at)}` : 'ADO unreachable'}</span>
        <span className={t3?.ok ? 'link-ok' : 'link-bad'} title={t3?.error ?? undefined}>{overview?.sources.environments?.length ? overview.sources.environments.map((e) => `${e.label} ${e.ok ? 'connected' : 'offline'}`).join(' · ') : t3?.ok ? 'T3 Code connected' : 'T3 Code unreachable'}</span>
        <button className="sync" disabled={syncing} onClick={() => syncNow()}>{syncing ? 'Syncing…' : 'Sync now'}</button>
      </div>
      <a className="avatar" href="/settings" aria-label="Settings" onClick={(e) => { e.preventDefault(); navigate('/settings'); }}><Icon name="settings" /></a>
    </header>
  );
}

function useRouteLabel() {
  const { route, overview } = useStore();
  return route.path === '/settings' ? { parent: 'Dispatch', title: 'Settings' } : route.path === '/browse' ? { parent: 'Azure DevOps', title: 'Browse and search' } : { parent: 'My work', title: activeWorkBay(overview, route.params).short ?? activeWorkBay(overview, route.params).name };
}

export function PhoneSummary() {
  const { overview, syncNow, syncing } = useStore();
  if (!overview) return null;
  return (
    <div className="phone-sum">
      <span><b>{countIn(overview, 'waiting')}</b> waiting on you, <b>{countIn(overview, 'drift')}</b> out of sync, <b>{countIn(overview, 'working')}</b> running</span>
      <button className="sync" disabled={syncing} onClick={() => syncNow()}>{syncing ? 'Syncing…' : 'Sync'}</button>
    </div>
  );
}

export function Rack() {
  const { overview, navigate } = useStore();
  if (!overview) return <div className="rack" />;
  const free = overview.worktrees.filter((w) => w.state === 'free' && w.available !== false).length;
  const needYou = overview.worktrees.filter((w) => w.needsYou).length;
  return (
    <div className="rack" aria-label="Worktrees">
      <div className="rack-label"><span className="phone-hide">Worktrees </span><b>{free} free</b>{needYou > 0 && `, ${needYou} need you`}</div>
      {[...new Set(overview.worktrees.map((w) => w.environmentId ?? ''))].map((environmentId) => {
        const group = overview.worktrees.filter((w) => (w.environmentId ?? '') === environmentId);
        return <div className="rack-group" key={environmentId}>
          {group[0]?.environmentLabel && <span className="rack-host">{group[0].environmentLabel}</span>}
          <div className="rack-slots">{group.map((w) => (
            w.available === false ? <div key={w.id ?? w.name} className="slot is-offline" title={`${w.environmentLabel ?? 'Host'} offline; showing last known activity`}><b>{w.name}</b><span>offline</span></div>
              : w.state === 'free' ? <div key={w.id ?? w.name} className="slot is-free"><b>{w.name}</b><span>free</span></div>
              : <button key={w.id ?? w.name} className={`slot ${w.needsYou ? 'is-you' : 'is-run'}`} onClick={() => navigate(w.itemId ? `/?item=${w.itemId}` : '/?bay=unlinked')}><b>{w.name}</b><span>{w.itemId ?? 'busy'}<em className="needs">{w.needsYou ? ' needs you' : ''}</em></span></button>
          ))}</div>
        </div>;
      })}
    </div>
  );
}

export function Rail() {
  const { overview, route, navigate, config } = useStore();
  const active = activeWorkBay(overview, route.params).key;
  const navIcons = { waiting: 'inbox', drift: 'sync', working: 'clock', next: 'grid', idle: 'clock', paused: 'pause', unlinked: 'link', handed: 'check' } as const;
  const userName = config?.user.name ?? 'Your account';
  const nameParts = userName.split(/\s+/).filter(Boolean);
  const initials = `${nameParts[0]?.[0] ?? ''}${nameParts.length > 1 ? nameParts.at(-1)![0] : ''}`.toUpperCase();
  const go = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); navigate(to); };
  return (
    <aside className="rail">
      <Brand />
      <div className="workspace-label"><Icon name="grid" /><div>Work overview<small>Azure DevOps + T3 Code</small></div></div>
      <h3>My work</h3>
      {BAYS.map((b) => {
        const n = countIn(overview, b.key);
        if (!n && b.key !== 'waiting') return null;
        return (
          <a key={b.key} className={`nav ${route.path === '/' && active === b.key ? 'is-on' : ''}`} aria-current={route.path === '/' && active === b.key ? 'page' : undefined} href={`/?bay=${b.key}`} onClick={go(`/?bay=${b.key}`)}>
            <Icon name={navIcons[b.key]} />{b.short ?? b.name}<span className="n">{n}</span>
          </a>
        );
      })}
      <h3>Worktrees</h3>
      <Rack />
      <div className="rail-bottom">
        <a className={`nav ${route.path === '/browse' ? 'is-on' : ''}`} href="/browse" onClick={go('/browse')}><Icon name="search" />Browse ADO</a>
        <a className={`nav ${route.path === '/settings' ? 'is-on' : ''}`} href="/settings" onClick={go('/settings')}><Icon name="settings" />Settings and devices</a>
        <div className="profile"><span className="profile-avatar">{initials}</span><div>{userName}<small>{config?.user.email}</small></div></div>
      </div>
    </aside>
  );
}

const ICONS = {
  work: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="4" rx="1" /><rect x="3" y="10" width="18" height="4" rx="1" /><rect x="3" y="16" width="18" height="4" rx="1" /></svg>,
  browse: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>,
};

export function Tabs() {
  const { route, navigate, overview } = useStore();
  const waiting = countIn(overview, 'waiting');
  const tab = (to: string, label: string, icon: React.ReactNode, on: boolean, badge = 0) => (
    <a href={to} className={on ? 'is-on' : ''} onClick={(e) => { e.preventDefault(); navigate(to); }}>
      {icon}{label}{badge > 0 && <span className="badge">{badge}</span>}
    </a>
  );
  return (
    <nav className="tabs">
      {tab('/', 'My work', ICONS.work, route.path === '/', waiting)}
      {tab('/browse', 'Browse ADO', ICONS.browse, route.path === '/browse')}
      {tab('/settings', 'Settings', ICONS.settings, route.path === '/settings')}
    </nav>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone === 'error' ? 'is-error' : ''}`}>
          <span>{t.text}</span>
          {t.link && <a href={t.link.href} {...(t.link.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{t.link.label}</a>}
        </div>
      ))}
    </div>
  );
}
