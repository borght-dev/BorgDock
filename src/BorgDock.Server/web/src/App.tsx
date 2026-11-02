import { useCallback, useEffect, useState } from 'react';
import type { AuthStatus } from '../../shared/src/api.ts';
import { api } from './api.ts';
import { activeWorkBay, PhoneSummary, Rack, Rail, Tabs, Toasts, TopBar, WorkHeading } from './components/Chrome.tsx';
import { ItemPanel } from './components/ItemPanel.tsx';
import { StartSheet } from './components/StartSheet.tsx';
import { AppAuth, Setup, SignIn } from './pages/Auth.tsx';
import { Browse } from './pages/Browse.tsx';
import { MyWork } from './pages/MyWork.tsx';
import { Settings } from './pages/Settings.tsx';
import { StoreProvider, useRouter, useStore } from './store.tsx';

export function App() {
  const { route, navigate } = useRouter();
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(() => api.authStatus().then(setAuth).catch((e) => setError(e.message)), []);
  useEffect(() => {
    check();
    const onSignedOut = () => check();
    window.addEventListener('dispatch:signed-out', onSignedOut);
    return () => window.removeEventListener('dispatch:signed-out', onSignedOut);
  }, [check]);

  if (!auth) return <div className="empty">{error ?? 'Loading…'}</div>;
  if (route.path === '/auth/app') return <AppAuth authenticated={auth.authenticated} onSignedIn={check} />;
  if (route.path === '/setup') return <Setup onDone={() => { check(); navigate('/', { replace: true }); }} />;
  if (!auth.authenticated) return <SignIn setupRequired={auth.setupRequired} onSignedIn={check} />;

  return (
    <StoreProvider route={route} navigate={navigate}>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { route, navigate, startFor, overview } = useStore();
  const selected = route.params.has('item') ? Number(route.params.get('item')) : null;
  const page = route.path === '/browse' ? 'browse' : route.path === '/settings' ? 'settings' : 'work';
  const bay = activeWorkBay(overview, route.params);
  const panelItem = selected ?? (page === 'work' ? overview?.items.find((o) => o.bay === bay.key)?.item.id ?? null : null);

  const closeItem = () => {
    const params = new URLSearchParams(route.params);
    params.delete('item');
    navigate(`${route.path}${params.size ? `?${params}` : ''}`);
  };

  // Notifications open /?item=<id>; scroll the strip into view on wide screens too.
  useEffect(() => {
    if (selected) document.querySelector('.review-row.is-selected, .strip.is-selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <div className={`app ${selected ? 'has-item' : ''} page-${page} ${page === 'work' && bay.key === 'unlinked' ? 'is-unlinked' : ''}`}>
      <Rail />
      <TopBar />
      <PhoneSummary />
      <Rack />
      <div className="shell">
        {page === 'work' && <WorkHeading />}
        <main className="bays">
          {page === 'work' && <MyWork selected={panelItem} />}
          {page === 'browse' && <Browse selected={selected} />}
          {page === 'settings' && <Settings />}
        </main>
        <aside className="detail" aria-label="Work item details">
          {panelItem ? <ItemPanel key={panelItem} itemId={panelItem} onBack={closeItem} /> : <div className="detail-empty">Select a work item to review its update.</div>}
        </aside>
      </div>
      <Tabs />
      {startFor && <StartSheet item={startFor} />}
      <Toasts />
    </div>
  );
}
