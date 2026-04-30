import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import { PrDetailApp } from './components/pr-detail/PrDetailApp';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { attachConsoleBridge, createLogger } from './services/logger';
import { disableDefaultContextMenu } from './utils/disable-default-context-menu';

disableDefaultContextMenu();

// Route console.* into tauri-plugin-log so logs land in %APPDATA%/BorgDock/logs/borgdock.log.
// Must run before anything else writes to the console.
attachConsoleBridge();

const bootLog = createLogger('pr-detail-boot');

window.addEventListener('error', (e) => {
  bootLog.error('window error', e.error ?? e.message, {
    filename: e.filename,
    lineno: e.lineno,
    colno: e.colno,
  });
});
window.addEventListener('unhandledrejection', (e) => {
  bootLog.error('unhandled promise rejection', e.reason);
});

bootLog.info('bootstrap start', {
  href: window.location.href,
  hasTauri: '__TAURI_INTERNALS__' in window,
  search: window.location.search,
});

try {
  const root = document.getElementById('root');
  if (!root) throw new Error('#root element not found in pr-detail.html');
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <PrDetailApp />
      </ErrorBoundary>
    </React.StrictMode>,
  );
  bootLog.info('React mounted');
} catch (err) {
  bootLog.error('React mount failed', err);
  // Render a visible fallback so a blank screen isn't the only signal.
  document.body.innerHTML = `<pre style="padding:16px;color:#f87171;font:12px monospace;white-space:pre-wrap;">PR detail window failed to mount:\n${String(err)}</pre>`;
}
